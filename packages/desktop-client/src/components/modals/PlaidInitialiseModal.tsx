// @ts-strict-ignore
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { Error } from '#components/alerts';
import { Link } from '#components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import type { Modal as ModalType } from '#modals/modalsSlice';

type PlaidInitialiseModalProps = Extract<
  ModalType,
  { name: 'plaid-init' }
>['options'];

export const PlaidInitialiseModal = ({
  onSuccess,
}: PlaidInitialiseModalProps) => {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (close: () => void) => {
    if (!clientId || !secret) {
      setIsValid(false);
      setError(t('Both client ID and secret are required.'));
      return;
    }

    setIsLoading(true);

    const result = await send('plaid-set-credentials', { clientId, secret });

    if (result?.status === 'error' || result?.error) {
      setIsValid(false);
      setError(
        result?.reason || result?.error || t('Failed to save credentials.'),
      );
      setIsLoading(false);
      return;
    }

    onSuccess();
    setIsLoading(false);
    close();
  };

  return (
    <Modal name="plaid-init" containerProps={{ style: { width: 380 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Set up Plaid')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ display: 'flex', gap: 10 }}>
            <Text>
              <Trans>
                Plaid connects to most US and Canadian banks. You will need a{' '}
                <Link
                  variant="external"
                  to="https://dashboard.plaid.com/signup"
                  linkColor="purple"
                >
                  Plaid developer account
                </Link>{' '}
                with production access. Plaid bills ~$0.20–0.30 per linked
                account per month.
              </Trans>
            </Text>

            <Text style={{ fontSize: 12, opacity: 0.7 }}>
              <Trans>
                Credentials are encrypted at rest on the sync-server using
                AES-256-GCM. The encryption key must be set via the
                ACTUAL_ENCRYPTION_KEY env var.
              </Trans>
            </Text>

            <FormField>
              <FormLabel title={t('Client ID:')} htmlFor="plaid-client-id" />
              <Input
                id="plaid-client-id"
                type="password"
                value={clientId}
                onChangeValue={value => {
                  setClientId(value);
                  setIsValid(true);
                }}
              />
            </FormField>

            <FormField>
              <FormLabel title={t('Secret:')} htmlFor="plaid-secret" />
              <Input
                id="plaid-secret"
                type="password"
                value={secret}
                onChangeValue={value => {
                  setSecret(value);
                  setIsValid(true);
                }}
              />
            </FormField>

            {!isValid && error && <Error>{error}</Error>}
          </View>

          <ModalButtons>
            <ButtonWithLoading
              variant="primary"
              autoFocus
              isLoading={isLoading}
              onPress={() => {
                void onSubmit(() => state.close());
              }}
            >
              <Trans>Save and continue</Trans>
            </ButtonWithLoading>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
};
