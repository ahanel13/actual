import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Paragraph } from '@actual-app/components/paragraph';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ConfirmUnlinkAccountModalProps = Extract<
  ModalType,
  { name: 'confirm-unlink-account' }
>['options'];

export function ConfirmUnlinkAccountModal({
  accountName,
  isViewBankSyncSettings,
  isChangingProvider = false,
  onUnlink,
}: ConfirmUnlinkAccountModalProps) {
  const { t } = useTranslation();

  const title = isChangingProvider
    ? t('Change sync provider')
    : t('Confirm Unlink');

  const body = isChangingProvider
    ? t(
        'This will disconnect {{accountName}} from its current provider. You can immediately re-link it to a different provider. Your transactions, balance history, and holdings will be preserved.',
        { accountName },
      )
    : isViewBankSyncSettings
      ? t(
          'Transactions will no longer be synchronized with this account and must be manually entered. You will not be able to edit the bank sync settings for this account and the settings will close.',
        )
      : t(
          'Transactions will no longer be synchronized with this account and must be manually entered.',
        );

  return (
    <Modal
      name="confirm-unlink-account"
      containerProps={{ style: { width: '30vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={title}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5 }}>
            {!isChangingProvider && (
              <Paragraph>
                <Trans>
                  Are you sure you want to unlink <strong>{accountName}</strong>?
                </Trans>
              </Paragraph>
            )}

            <Paragraph>{body}</Paragraph>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
              }}
            >
              <Button style={{ marginRight: 10 }} onPress={() => state.close()}>
                <Trans>Cancel</Trans>
              </Button>
              <InitialFocus>
                <Button
                  variant="primary"
                  onPress={() => {
                    onUnlink();
                    state.close();
                  }}
                >
                  {isChangingProvider ? (
                    <Trans>Continue</Trans>
                  ) : (
                    <Trans>Unlink</Trans>
                  )}
                </Button>
              </InitialFocus>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
