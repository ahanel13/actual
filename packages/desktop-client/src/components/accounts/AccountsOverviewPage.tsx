// @ts-strict-ignore
import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgArrowButtonDown1,
  SvgArrowButtonRight1,
} from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { q } from '@actual-app/core/shared/query';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useMoveAccountMutation } from '#accounts';
import { BalanceHistoryGraph } from '#components/accounts/BalanceHistoryGraph';
import { BankLogo } from '#components/common/BankLogo';
import { Link } from '#components/common/Link';
import { DropHighlight, useDraggable, useDroppable } from '#components/sort';
import { useAccounts } from '#hooks/useAccounts';
import { useDragRef } from '#hooks/useDragRef';
import { useFormat } from '#hooks/useFormat';
import { usePlaidItems } from '#hooks/usePlaidItems';
import { useSheetValue } from '#hooks/useSheetValue';
import { pushModal } from '#modals/modalsSlice';
import { liveQuery } from '#queries/liveQuery';
import { useDispatch } from '#redux';
import * as bindings from '#spreadsheet/bindings';

// ─── Group balance hook ───────────────────────────────────────────────────────

function useGroupBalance(accountIds: string[]): number {
  const [balance, setBalance] = useState(0);
  const key = accountIds.slice().sort().join(',');

  useEffect(() => {
    if (accountIds.length === 0) {
      setBalance(0);
      return;
    }
    const groupQuery = q('transactions')
      .filter({ account: { $oneof: accountIds }, 'account.closed': false })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' });

    const live = liveQuery(groupQuery, {
      onData: (data: number[]) => setBalance(data[0] ?? 0),
    });
    return () => live?.unsubscribe();
  }, [key]);

  return balance;
}

// ─── Balance helpers ──────────────────────────────────────────────────────────

function AccountBalance({
  accountId,
  style,
}: {
  accountId: string;
  style?: React.CSSProperties;
}) {
  const value = useSheetValue(bindings.accountBalance(accountId) as any) ?? 0;
  const format = useFormat();
  return (
    <span
      style={{
        whiteSpace: 'nowrap',
        color: (value as number) < 0 ? theme.errorText : theme.pageText,
        ...style,
      }}
    >
      {format(Math.abs(value as number), 'financial')}
    </span>
  );
}

function NetWorthBalance({ style }: { style?: React.CSSProperties }) {
  const value = useSheetValue(bindings.allAccountBalance() as any) ?? 0;
  const format = useFormat();
  return (
    <span
      style={{
        whiteSpace: 'nowrap',
        color: (value as number) < 0 ? theme.errorText : theme.pageText,
        ...style,
      }}
    >
      {format(Math.abs(value as number), 'financial')}
    </span>
  );
}

// ─── Types & grouping ─────────────────────────────────────────────────────────

type AccountGroup = {
  label: string;
  isLiability: boolean;
  accounts: AccountEntity[];
  color: string;
};

type GroupDef = {
  label: string;
  isLiability: boolean;
  color: string;
  match: (a: AccountEntity) => boolean;
};

const GROUP_DEFS: GroupDef[] = [
  {
    label: 'Checking & Savings',
    isLiability: false,
    color: '#6366f1',
    match: a => !a.type || a.type === 'cash',
  },
  {
    label: 'Investments',
    isLiability: false,
    color: '#3b82f6',
    match: a => a.type === 'investment',
  },
  {
    label: 'Real Estate',
    isLiability: false,
    color: '#a855f7',
    match: a => a.type === 'real_estate',
  },
  {
    label: 'Vehicles',
    isLiability: false,
    color: '#f59e0b',
    match: a => a.type === 'vehicle',
  },
  {
    label: 'Valuables',
    isLiability: false,
    color: '#ec4899',
    match: a => a.type === 'valuables',
  },
  {
    label: 'Other Assets',
    isLiability: false,
    color: '#14b8a6',
    match: a => a.type === 'other_asset',
  },
  {
    label: 'Credit Cards',
    isLiability: true,
    color: '#ef4444',
    match: a => a.type === 'credit_card',
  },
  {
    label: 'Loans',
    isLiability: true,
    color: '#f97316',
    match: a =>
      a.type === 'mortgage' ||
      a.type === 'loan' ||
      a.type === 'other_liability',
  },
];

function buildGroups(accounts: AccountEntity[]): AccountGroup[] {
  const active = accounts.filter(a => !a.closed && !a.tombstone);

  return GROUP_DEFS.map(def => ({
    label: def.label,
    isLiability: def.isLiability,
    color: def.color,
    accounts: active.filter(def.match),
  })).filter(g => g.accounts.length > 0);
}

// ─── Account row ──────────────────────────────────────────────────────────────

type AccountRowProps = {
  account: AccountEntity;
  dragType: string;
  onDragChange: (drag: { state: string }) => void;
  onDrop: (
    id: string,
    dropPos: 'top' | 'bottom' | null,
    targetId: string,
  ) => void;
};

function AccountRow({
  account,
  dragType,
  onDragChange,
  onDrop,
}: AccountRowProps) {
  const { items: plaidItems } = usePlaidItems();
  const institutionLogo = account.bankSyncId
    ? (plaidItems.find(i => i.item_id === account.bankSyncId)
        ?.institution_logo ?? null)
    : null;
  const { dragRef } = useDraggable({
    type: dragType,
    onDragChange,
    item: { id: account.id },
    canDrag: true,
  });
  const handleDragRef = useDragRef(dragRef);
  const { dropRef, dropPos } = useDroppable({
    types: [dragType],
    id: account.id,
    onDrop,
  });

  return (
    <View innerRef={dropRef} style={{ position: 'relative' }}>
      <DropHighlight pos={dropPos} />
      <View innerRef={handleDragRef}>
        <Link
          variant="internal"
          to={`/accounts/${account.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 16px',
            gap: 12,
            borderBottom: `1px solid ${theme.tableBorder}`,
            textDecoration: 'none',
            color: theme.pageText,
            ':hover': { backgroundColor: theme.tableRowBackgroundHover },
          }}
        >
          {(account.account_sync_source || account.bankName) && (
            <BankLogo
              bankName={account.bankName}
              institutionLogo={institutionLogo}
              size={26}
            />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ fontWeight: 500, fontSize: 14 }}>
              {account.name}
            </View>
            {account.official_name && (
              <View
                style={{
                  fontSize: 12,
                  color: theme.pageTextSubdued,
                  marginTop: 1,
                }}
              >
                {account.official_name}
              </View>
            )}
          </View>

          <View style={{ width: 80, height: 28, flexShrink: 0 }}>
            <BalanceHistoryGraph
              accountId={account.id}
              style={{ height: 28, margin: 0 }}
              compact
            />
          </View>

          <AccountBalance
            accountId={account.id}
            style={{
              fontSize: 14,
              fontWeight: 500,
              minWidth: 80,
              textAlign: 'right',
            }}
          />
        </Link>
      </View>
    </View>
  );
}

// ─── Account group ─────────────────────────────────────────────────────────────

function AccountGroup({ group }: { group: AccountGroup }) {
  const [collapsed, setCollapsed] = useState(false);
  const groupBalance = useGroupBalance(group.accounts.map(a => a.id));
  const format = useFormat();
  const [isDragging, setIsDragging] = useState(false);
  const moveAccount = useMoveAccountMutation();
  const dragType = `overview-account-${group.label}`;

  function onDragChange(drag: { state: string }) {
    setIsDragging(drag.state === 'start');
  }

  function onReorder(
    id: string,
    dropPos: 'top' | 'bottom' | null,
    targetId: string,
  ) {
    let targetIdToMove: string | null = targetId;
    if (dropPos === 'bottom') {
      const idx = group.accounts.findIndex(a => a.id === targetId) + 1;
      targetIdToMove =
        idx < group.accounts.length ? group.accounts[idx].id : null;
    }
    moveAccount.mutate({ id, targetId: targetIdToMove });
  }

  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${theme.tableBorder}`,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            backgroundColor: group.color,
            flexShrink: 0,
          }}
        />
        {collapsed ? (
          <SvgArrowButtonRight1
            style={{ width: 10, height: 10, color: theme.pageTextSubdued }}
          />
        ) : (
          <SvgArrowButtonDown1
            style={{ width: 10, height: 10, color: theme.pageTextSubdued }}
          />
        )}
        <View
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 13,
            color: theme.pageText,
          }}
        >
          <Trans>{group.label}</Trans>
        </View>
        {collapsed ? (
          <View
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: groupBalance < 0 ? theme.errorText : theme.noticeTextLight,
            }}
          >
            {format(Math.abs(groupBalance), 'financial')}
          </View>
        ) : (
          <View style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {group.accounts.length}{' '}
            {group.accounts.length === 1 ? 'account' : 'accounts'}
          </View>
        )}
      </button>

      {!collapsed &&
        group.accounts.map(account => (
          <AccountRow
            key={account.id}
            account={account}
            dragType={dragType}
            onDragChange={onDragChange}
            onDrop={onReorder}
          />
        ))}
    </View>
  );
}

// ─── Summary panel ─────────────────────────────────────────────────────────────

function SummaryPanel({ groups }: { groups: AccountGroup[] }) {
  const { t } = useTranslation();

  const assetGroups = groups.filter(g => !g.isLiability);
  const liabilityGroups = groups.filter(g => g.isLiability);

  if (groups.length === 0) return null;

  return (
    <View
      style={{
        width: 260,
        flexShrink: 0,
        backgroundColor: theme.cardBackground,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        padding: '16px 20px',
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 20,
      }}
    >
      <View style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
        <Trans>Summary</Trans>
      </View>

      {assetGroups.length > 0 && (
        <SummarySection title={t('Assets')} groups={assetGroups} />
      )}
      {liabilityGroups.length > 0 && (
        <SummarySection
          title={t('Liabilities')}
          groups={liabilityGroups}
          isLiability
        />
      )}
    </View>
  );
}

function SummaryGroupRow({ group }: { group: AccountGroup }) {
  const balance = useGroupBalance(group.accounts.map(a => a.id));
  const format = useFormat();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: group.color,
          flexShrink: 0,
        }}
      />
      <View style={{ flex: 1, fontSize: 13, color: theme.pageText }}>
        <Trans>{group.label}</Trans>
      </View>
      <View style={{ fontSize: 13, fontWeight: 500, color: theme.pageText }}>
        {format(Math.abs(balance), 'financial')}
      </View>
    </View>
  );
}

function SectionTotal({
  groups,
  isLiability,
}: {
  groups: AccountGroup[];
  isLiability: boolean;
}) {
  const allIds = groups.flatMap(g => g.accounts.map(a => a.id));
  const total = useGroupBalance(allIds);
  const format = useFormat();
  return (
    <View style={{ fontSize: 13, fontWeight: 700, color: theme.pageText }}>
      {format(Math.abs(total), 'financial')}
    </View>
  );
}

function SummarySection({
  title,
  groups,
  isLiability = false,
}: {
  title: string;
  groups: AccountGroup[];
  isLiability?: boolean;
}) {
  const allIds = groups.flatMap(g => g.accounts.map(a => a.id));
  const total = useGroupBalance(allIds);
  const format = useFormat();

  return (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <View style={{ fontWeight: 700, fontSize: 14, color: theme.pageText }}>
          {title}
        </View>
        <View style={{ fontSize: 13, fontWeight: 700, color: theme.pageText }}>
          {format(Math.abs(total), 'financial')}
        </View>
      </View>

      {/* Colored proportional bar */}
      <View
        style={{
          flexDirection: 'row',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 12,
          gap: 2,
        }}
      >
        {groups.map(g => (
          <View
            key={g.label}
            style={{
              flex: g.accounts.length,
              backgroundColor: g.color,
              borderRadius: 3,
            }}
          />
        ))}
      </View>

      {groups.map(g => (
        <SummaryGroupRow key={g.label} group={g} />
      ))}
    </View>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function AccountsOverviewPage() {
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();

  const groups = buildGroups(accounts);

  const onAddAccount = () => {
    dispatch(pushModal({ modal: { name: 'add-account', options: {} } }));
  };

  return (
    <View
      style={{
        ...styles.pageContent,
        paddingTop: 20,
        paddingBottom: 40,
        flexDirection: 'column',
        minHeight: '100%',
        // Reserve scrollbar gutter so the chart doesn't reflow / shrink the
        // moment the account list becomes long enough to scroll.
        scrollbarGutter: 'stable',
      }}
    >
      {/* Header */}
      <View
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: theme.pageText,
          marginBottom: 16,
        }}
      >
        <Trans>Accounts</Trans>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          marginBottom: 20,
        }}
      >
        <Button
          variant="primary"
          onPress={onAddAccount}
          style={{ flexShrink: 0 }}
        >
          + <Trans>Add account</Trans>
        </Button>
      </View>

      {/* Net worth chart */}
      <View
        style={{
          backgroundColor: theme.cardBackground,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '20px 24px',
          marginBottom: 20,
          flexShrink: 0,
        }}
      >
        <View style={{ marginBottom: 8 }}>
          <View
            style={{
              fontSize: 11,
              color: theme.pageTextSubdued,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <Trans>Net Worth</Trans>
          </View>
          <NetWorthBalance
            style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}
          />
        </View>
        <BalanceHistoryGraph style={{ height: 170, margin: 0 }} labelsAbove />
      </View>

      {/* Two-column layout */}
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        {/* Account groups */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {groups.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.cardBackground,
                borderRadius: 12,
                padding: 40,
                textAlign: 'center',
                color: theme.pageTextSubdued,
                fontSize: 14,
              }}
            >
              <Trans>No accounts found.</Trans>{' '}
              <button
                onClick={onAddAccount}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.formLabelText,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: 'inherit',
                }}
              >
                <Trans>Add one now.</Trans>
              </button>
            </View>
          ) : (
            groups.map(group => (
              <AccountGroup key={group.label} group={group} />
            ))
          )}
        </View>

        {/* Summary panel */}
        <SummaryPanel groups={groups} />
      </View>
    </View>
  );
}
