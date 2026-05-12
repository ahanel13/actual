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
  const [selectedOffbudget, setSelectedOffbudget] = useState<0 | 1>(
    account?.offbudget ? 1 : 0,
  );

  if (!account) return null;

  const onSave = () => {
    updateAccount.mutate({
      account: {
        ...account,
        type: selectedType === '' ? null : selectedType,
        offbudget: selectedOffbudget,
      },
    });
    dispatch(closeModal());
  };

  return (
    <Modal name="edit-account-type">
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={t('Edit account')} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 16 }}>
            <View style={{ fontSize: 14, color: theme.pageTextSubdued }}>
              <Trans>Account:</Trans>{' '}
              <strong style={{ color: theme.pageText }}>{account.name}</strong>
            </View>

            {/* On budget / Off budget toggle */}
            <View style={{ gap: 8 }}>
              <View
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.pageTextSubdued,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <Trans>Budget status</Trans>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(
                  [
                    { value: 0 as const, label: 'On budget' },
                    { value: 1 as const, label: 'Off budget' },
                  ]
                ).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedOffbudget(opt.value)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `2px solid ${
                        selectedOffbudget === opt.value
                          ? theme.buttonPrimaryBackground
                          : theme.tableBorder
                      }`,
                      backgroundColor:
                        selectedOffbudget === opt.value
                          ? theme.buttonPrimaryBackground + '15'
                          : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: 14,
                      color: theme.pageText,
                    }}
                  >
                    <Trans>{opt.label}</Trans>
                  </button>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              {TYPE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() =>
                    setSelectedType(option.value as AccountType | '')
                  }
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
            <Button
              variant="primary"
              onPress={onSave}
              style={{ marginLeft: 10 }}
            >
              <Trans>Save</Trans>
            </Button>
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
