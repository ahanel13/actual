import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountType } from '@actual-app/core/types/models';

import { useUpdateAccountMutation } from '#accounts';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useAccounts } from '#hooks/useAccounts';
import { closeModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type EditAccountTypeModalProps = Extract<
  ModalType,
  { name: 'edit-account-type' }
>['options'];

const TYPE_OPTIONS: Array<{ value: AccountType | ''; label: string }> = [
  { value: '', label: 'Default (checking/savings)' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investments' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'valuables', label: 'Valuables' },
  { value: 'other_asset', label: 'Other Assets' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'loan', label: 'Loan' },
  { value: 'other_liability', label: 'Other Liability' },
];

export function EditAccountTypeModal({ accountId }: EditAccountTypeModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();
  const account = accounts.find(a => a.id === accountId);
  const updateAccount = useUpdateAccountMutation();

  const [selectedType, setSelectedType] = useState<AccountType | ''>(
    account?.type ?? '',
  );

  if (!account) return null;

  const onSave = () => {
    updateAccount.mutate({
      account: {
        ...account,
        type: selectedType === '' ? null : selectedType,
      },
    });
    dispatch(closeModal());
  };

  return (
    <Modal name="edit-account-type">
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={t('Change account type')} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 16 }}>
            <View style={{ fontSize: 14, color: theme.pageTextSubdued }}>
              <Trans>Account:</Trans>{' '}
              <strong style={{ color: theme.pageText }}>{account.name}</strong>
            </View>

            <View style={{ gap: 6 }}>
              {TYPE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedType(option.value as AccountType | '')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `2px solid ${
                      selectedType === option.value
                        ? theme.buttonPrimaryBackground
                        : theme.tableBorder
                    }`,
                    backgroundColor:
                      selectedType === option.value
                        ? theme.buttonPrimaryBackground + '15'
                        : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    fontSize: 14,
                    color: theme.pageText,
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `2px solid ${
                        selectedType === option.value
                          ? theme.buttonPrimaryBackground
                          : theme.tableBorder
                      }`,
                      backgroundColor:
                        selectedType === option.value
                          ? theme.buttonPrimaryBackground
                          : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  <Trans>{option.label}</Trans>
                </button>
              ))}
            </View>
          </View>

          <ModalButtons>
            <Button onPress={() => state.close()}>
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="primary" onPress={onSave} style={{ marginLeft: 10 }}>
              <Trans>Save</Trans>
            </Button>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
