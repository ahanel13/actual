import { useMemo } from 'react';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { BankLogo } from '#components/common/BankLogo';
import { useLocale } from '#hooks/useLocale';

import { AccountRow } from './AccountRow';

type ProviderGroupedSectionProps = {
  accounts: AccountEntity[];
  hoveredAccount: AccountEntity['id'] | null;
  onHover: (id: AccountEntity['id'] | null) => void;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
};

export function ProviderGroupedSection({
  accounts,
  hoveredAccount,
  onHover,
  onAction,
}: ProviderGroupedSectionProps) {
  const locale = useLocale();

  // Group accounts by bankName; accounts with no bankName get their own group
  const groups = useMemo(() => {
    const map = new Map<string, AccountEntity[]>();
    for (const account of accounts) {
      const key = account.bankName ?? '__none__';
      const list = map.get(key) ?? [];
      list.push(account);
      map.set(key, list);
    }
    // Sort: named institutions first, unnamed last
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });
  }, [accounts]);

  return (
    <View style={{ gap: 16 }}>
      {groups.map(([key, groupAccounts]) => {
        const bankName = key === '__none__' ? null : key;
        return (
          <View
            key={key}
            style={{
              borderRadius: 8,
              border: `1px solid ${theme.tableBorder}`,
              overflow: 'hidden',
            }}
          >
            {/* Institution header — only shown when bankName is known */}
            {bankName && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  backgroundColor: theme.tableBackground,
                  borderBottom: `1px solid ${theme.tableBorder}`,
                }}
              >
                <BankLogo bankName={bankName} size={28} />
                <Text style={{ fontWeight: 600, fontSize: 14 }}>
                  {bankName}
                </Text>
              </View>
            )}

            {/* Account rows */}
            {groupAccounts.map(account => (
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
    </View>
  );
}
