import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaidLink } from 'react-plaid-link';

import { send } from '@actual-app/core/platform/client/connection';
import type { SyncServerPlaidAccount } from '@actual-app/core/types/models';

import { closeModal, pushModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

type PlaidLinkModalProps = Extract<
  ModalType,
  { name: 'plaid-link' }
>['options'];

type LinkTokenResponse = {
  link_token: string;
};

type ExchangeResponse = {
  item_id: string;
  accounts: SyncServerPlaidAccount[];
  institution: { institution_id: string | null; name: string | null };
};

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

/**
 * Renders Plaid Link in-page WITHOUT wrapping it in Actual's Modal. The Modal
 * wrapper traps keyboard focus and Plaid's iframe is attached to document.body
 * outside the React tree, so focus trapping prevents users from typing into
 * the bank-login inputs. This component is registered in Modals.tsx so it can
 * still be dismissed via dispatch(closeModal()).
 */
export function PlaidLinkModal({
  upgradingAccountId,
  reauthItemId,
}: PlaidLinkModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Fetch the link token on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = (await send(
          'plaid-create-link-token',
          reauthItemId ? { itemId: reauthItemId } : {},
        )) as LinkTokenResponse | undefined;
        if (cancelled) return;
        const token = result?.link_token;
        if (!token) {
          setBootError(t('Failed to start Plaid Link.'));
          return;
        }
        setLinkToken(token);
      } catch (e) {
        if (!cancelled) setBootError(describeError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, reauthItemId]);

  // Surface boot errors via the notification system since we don't render any UI.
  useEffect(() => {
    if (!bootError) return;
    dispatch(
      addNotification({
        notification: {
          type: 'error',
          title: t('Plaid Link error'),
          message: bootError,
          timeout: 7000,
        },
      }),
    );
    dispatch(closeModal());
  }, [bootError, dispatch, t]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      // Update mode: no exchange. Plaid silently refreshes the existing
      // access_token. Just clear the stored error state.
      if (reauthItemId) {
        await send('plaid-mark-item-reauthed', { itemId: reauthItemId });
        dispatch(
          addNotification({
            notification: {
              type: 'message',
              title: t('Plaid item re-authenticated'),
              message: t('Sync will resume on next refresh.'),
              timeout: 4000,
            },
          }),
        );
        dispatch(closeModal());
        return;
      }

      let result: ExchangeResponse | undefined;
      try {
        result = (await send('plaid-exchange-public-token', {
          publicToken,
        })) as ExchangeResponse | undefined;
      } catch (e) {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              title: t('Plaid exchange failed'),
              message: describeError(e),
              timeout: 7000,
            },
          }),
        );
        dispatch(closeModal());
        return;
      }

      if (!result || !result.item_id || !result.accounts) {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              title: t('Plaid exchange failed'),
              message: t('Server did not return account data.'),
              timeout: 7000,
            },
          }),
        );
        dispatch(closeModal());
        return;
      }

      dispatch(closeModal());
      dispatch(
        pushModal({
          modal: {
            name: 'select-linked-accounts',
            options: {
              syncSource: 'plaid',
              externalAccounts: result.accounts,
              plaidItemId: result.item_id,
              plaidInstitution: result.institution,
              upgradingAccountId,
            },
          },
        }),
      );
    },
    [dispatch, t, upgradingAccountId, reauthItemId],
  );

  const onExit = useCallback(() => {
    dispatch(closeModal());
  }, [dispatch]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  // Open Plaid Link as soon as the SDK reports ready.
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  // No visual UI — Plaid's iframe is the UI. Returning null avoids the focus
  // trap that would otherwise block the iframe inputs.
  return null;
}
