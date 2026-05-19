import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { formatDistanceToNow } from 'date-fns';

import { BankLogo } from '#components/common/BankLogo';
import { usePlaidItems } from '#hooks/usePlaidItems';
import { pushModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
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
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  const handleRemove = async (itemId: string, label: string) => {
    if (
      !window.confirm(
        t(
          'Remove the Plaid link for "{{label}}"? Any Actual accounts tied to this bank will keep their transactions but stop syncing.',
          { label },
        ),
      )
    ) {
      return;
    }
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
            <BankLogo
              bankName={item.institution_name}
              institutionLogo={item.institution_logo}
              size={28}
            />
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
            <View style={{ flexDirection: 'row', gap: 6 }}>
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
        );
      })}
    </View>
  );
}
