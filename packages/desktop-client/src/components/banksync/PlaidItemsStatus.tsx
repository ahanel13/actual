import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { formatDistanceToNow } from 'date-fns';

import { usePlaidItems } from '#hooks/usePlaidItems';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

const ITEM_ERROR_LABELS: Record<string, string> = {
  ITEM_LOGIN_REQUIRED: 'Bank login required',
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_MFA: 'MFA failed',
  USER_SETUP_REQUIRED: 'Bank requires setup',
  PENDING_EXPIRATION: 'Pending expiration',
  ITEM_LOCKED: 'Account locked',
  INSTITUTION_DOWN: 'Bank is down',
};

function renderErrorLabel(code: string) {
  return ITEM_ERROR_LABELS[code] || code;
}

export function PlaidItemsStatus() {
  const { items, isLoading, refresh } = usePlaidItems();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  if (!isLoading && items.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.tableBackground,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontWeight: 600 }}>
          <Trans>Linked Plaid banks</Trans>
        </Text>
        <Button variant="bare" onPress={() => refresh()}>
          <Trans>Refresh</Trans>
        </Button>
      </View>
      {items.map(item => {
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
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 6,
              paddingBottom: 6,
              borderTop: `1px solid ${theme.tableBorder}`,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: 500 }}>
                {item.institution_name || item.item_id}
              </Text>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>Last synced</Trans>: {lastSynced}
                {error && (
                  <>
                    {' · '}
                    <span style={{ color: theme.errorText }}>
                      {renderErrorLabel(error)}
                    </span>
                  </>
                )}
              </Text>
            </View>
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
          </View>
        );
      })}
    </View>
  );
}
