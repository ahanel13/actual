import React, { memo, useState } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { format as formatDate } from 'date-fns';
import type { Locale } from 'date-fns';

import { useUpdateAccountMutation } from '#accounts/mutations';
import { BankLogo } from '#components/common/BankLogo';
import { Cell, Row } from '#components/table';

type AccountRowProps = {
  account: AccountEntity;
  hovered: boolean;
  onHover: (id: AccountEntity['id'] | null) => void;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
  locale: Locale;
  /** Fallback institution name when account.bankName is null */
  institutionName?: string | null;
  /** Base64 Plaid logo to show when available */
  institutionLogo?: string | null;
};

export const AccountRow = memo(
  ({
    account,
    hovered,
    onHover,
    onAction,
    locale,
    institutionName,
    institutionLogo,
  }: AccountRowProps) => {
    const backgroundFocus = hovered;
    const [isEditing, setIsEditing] = useState(false);
    const { mutate: updateAccount } = useUpdateAccountMutation();

    const lastSyncString = tsToRelativeTime(account.last_sync, locale, {
      capitalize: true,
    });
    const lastSyncDateTime = formatDate(
      new Date(parseInt(account.last_sync ?? '0', 10)),
      'MMM d, yyyy, HH:mm:ss',
      { locale },
    );

    const commitRename = (newName: string) => {
      if (newName.trim() && newName.trim() !== account.name) {
        updateAccount({ account: { ...account, name: newName.trim() } });
      }
      setIsEditing(false);
    };

    return (
      <Row
        height="auto"
        style={{
          fontSize: 13,
          backgroundColor: backgroundFocus
            ? theme.tableRowBackgroundHover
            : theme.tableBackground,
        }}
        collapsed
        onMouseEnter={() => onHover && onHover(account.id)}
        onMouseLeave={() => onHover && onHover(null)}
      >
        <Cell
          name="bankLogo"
          width={44}
          plain
          style={{ padding: '8px 4px 8px 10px', display: 'flex', alignItems: 'center' }}
        >
          <BankLogo
            bankName={account.bankName ?? institutionName}
            institutionLogo={institutionLogo}
            size={26}
          />
        </Cell>
        <Cell
          name="accountName"
          width={220}
          plain
          style={{ color: theme.tableText, padding: '10px' }}
        >
          {isEditing ? (
            <InitialFocus>
              <Input
                style={{ padding: '2px 4px', fontSize: 13, width: '100%' }}
                defaultValue={account.name}
                onEnter={value => commitRename(value)}
                onBlur={e => commitRename(e.currentTarget.value)}
                onEscape={() => setIsEditing(false)}
              />
            </InitialFocus>
          ) : (
            <Tooltip content="Click to rename" placement="bottom start">
              <span
                style={{ cursor: 'text' }}
                onClick={() => setIsEditing(true)}
              >
                {account.name}
              </span>
            </Tooltip>
          )}
        </Cell>

        <Cell
          name="bankName"
          width="flex"
          plain
          style={{ color: theme.tableText, padding: '10px' }}
        >
          {account.bankName}
        </Cell>

        {account.account_sync_source ? (
          <Tooltip
            placement="bottom start"
            content={lastSyncDateTime}
            style={{
              ...styles.tooltip,
            }}
          >
            <Cell
              name="lastSync"
              width={200}
              plain
              style={{
                color: theme.tableText,
                padding: '11px',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textDecorationColor: theme.pageTextSubdued,
                textUnderlineOffset: '4px',
              }}
              data-vrt-mask
            >
              {lastSyncString}
            </Cell>
          </Tooltip>
        ) : (
          ''
        )}

        {account.account_sync_source ? (
          <Cell name="edit" plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'edit')}>
              <Trans>Edit</Trans>
            </Button>
          </Cell>
        ) : (
          <Cell name="link" plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'link')}>
              <Trans>Link account</Trans>
            </Button>
          </Cell>
        )}
      </Row>
    );
  },
);

AccountRow.displayName = 'AccountRow';
