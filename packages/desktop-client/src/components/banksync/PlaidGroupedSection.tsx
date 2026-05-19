import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { AccountEntity } from '@actual-app/core/types/models';
import { formatDistanceToNow } from 'date-fns';

import { BankLogo } from '#components/common/BankLogo';
import { usePlaidItems } from '#hooks/usePlaidItems';
import { useLocale } from '#hooks/useLocale';
import { pushModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { AccountRow } from './AccountRow';

const ITEM_ERROR_LABELS: Record<string, string> = {
  ITEM_LOGIN_REQUIRED: 'Bank login required',
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_MFA: 'MFA failed',
  USER_SETUP_REQUIRED: 'Bank requires setup',
  PENDING_EXPIRATION: 'Pending expiration',
  ITEM_LOCKED: 'Account locked',
  INSTITUTION_DOWN: 'Bank is down',
};

type PlaidGroupedSectionProps = {
  accounts: AccountEntity[];
  hoveredAccount: AccountEntity['id'] | null;
  onHover: (id: AccountEntity['id'] | null) => void;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
};

export function PlaidGroupedSection({
  accounts,
  hoveredAccount,
  onHover,
  onAction,
}: PlaidGroupedSectionProps) {
  const { items, isLoading, refresh } = usePlaidItems();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const locale = useLocale();
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  // Group accounts by Plaid item_id.
  // account.bankId = banks.bank_id = Plaid item_id (set by linkPlaidAccount).
  const accountsByItemId = useMemo(() => {
    const map = new Map<string, AccountEntity[]>();
    for (const account of accounts) {
      if (account.bankId) {
        const list = map.get(account.bankId) ?? [];
        list.push(account);
        map.set(account.bankId, list);
      }
    }
    return map;
  }, [accounts]);

  // Accounts not associated with any Plaid item
  const orphanAccounts = useMemo(
    () => accounts.filter(a => !a.bankId),
    [accounts],
  );

  const handleRemove = async (itemId: string, label: string) => {
    if (
      !window.confirm(
        t(
          'Remove the Plaid link for "{{label}}"? Any Actual accounts tied to this bank will keep their transactions but stop syncing.',
          { label },
        ),
      )
    )
      return;

    setRemovingItemId(itemId);
    try {
      const result = (await send('plaid-remove-item', { itemId })) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (result?.error) throw new Error(result.error);
      await refresh();
    } catch (e) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            title: t('Failed to remove Plaid item'),
            message: e instanceof Error ? e.message : String(e),
            timeout: 6000,
          },
        }),
      );
    } finally {
      setRemovingItemId(null);
    }
  };

  if (!isLoading && items.length === 0 && accounts.length === 0) return null;

  return (
    <View style={{ gap: 16 }}>
      {items.map(item => {
        const itemAccounts = accountsByItemId.get(item.item_id) ?? [];
        const lastSynced = item.last_synced_at
          ? formatDistanceToNow(new Date(item.last_synced_at), {
              addSuffix: true,
            })
          : t('Never');
        const error = item.error_code;

        return (
          <View
            key={item.item_id}
            style={{
              borderRadius: 8,
              border: `1px solid ${theme.tableBorder}`,
              overflow: 'hidden',
            }}
          >
            {/* Institution header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                backgroundColor: theme.tableBackground,
                borderBottom:
                  itemAccounts.length > 0
                    ? `1px solid ${theme.tableBorder}`
                    : 'none',
              }}
            >
              <BankLogo
                bankName={item.institution_name}
                institutionLogo={item.institution_logo}
                size={28}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: 600, fontSize: 14 }}>
                  {item.institution_name || item.item_id}
                </Text>
                <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                  <Trans>Last synced</Trans>: {lastSynced}
                  {error && (
                    <>
                      {' · '}
                      <span style={{ color: theme.errorText }}>
                        {ITEM_ERROR_LABELS[error] ?? error}
                      </span>
                    </>
                  )}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
                {error && (
                  <Button
                    variant="primary"
                    onPress={() =>
                      dispatch(
                        pushModal({
                          modal: {
                            name: 'plaid-link',
                            options: { reauthItemId: item.item_id },
                          },
                        }),
                      )
                    }
                  >
                    <Trans>Re-link</Trans>
                  </Button>
                )}
                <Button
                  variant="bare"
                  isDisabled={removingItemId === item.item_id}
                  onPress={() =>
                    void handleRemove(
                      item.item_id,
                      item.institution_name || item.item_id,
                    )
                  }
                >
                  {removingItemId === item.item_id ? (
                    <Trans>Removing…</Trans>
                  ) : (
                    <Trans>Remove</Trans>
                  )}
                </Button>
              </View>
            </View>

            {/* Account rows */}
            {itemAccounts.map(account => (
              <AccountRow
                key={account.id}
                account={account}
                hovered={hoveredAccount === account.id}
                onHover={onHover}
                onAction={onAction}
                locale={locale}
              />
            ))}
          </View>
        );
      })}

      {/* Plaid accounts not matched to any item (edge case) */}
      {orphanAccounts.map(account => (
        <AccountRow
          key={account.id}
          account={account}
          hovered={hoveredAccount === account.id}
          onHover={onHover}
          onAction={onAction}
          locale={locale}
        />
      ))}
    </View>
  );
}
