// @ts-strict-ignore
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { toRelaxedNumber } from '@actual-app/core/shared/util';
import type {
  AccountType,
  AccountAssetType,
  AccountLiabilityType,
} from '@actual-app/core/types/models';

import {
  SvgArrowOutlineDown,
  SvgArrowOutlineUp,
  SvgChartArea,
  SvgCreditCard,
  SvgCurrencyDollar,
  SvgDocument,
  SvgHome,
  SvgStarFull,
  SvgTravelCar,
} from '@actual-app/components/icons/v1';

import { useCreateAccountMutation } from '#accounts';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { validateAccountName } from '#components/util/accountValidation';
import { useAccounts } from '#hooks/useAccounts';
import { useNavigate } from '#hooks/useNavigate';
import { closeModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type AccountTypeOption = {
  type: AccountType;
  label: string;
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
};

const ASSET_TYPES: AccountTypeOption[] = [
  { type: 'cash', label: 'Cash', Icon: SvgCurrencyDollar },
  { type: 'investment', label: 'Investments', Icon: SvgChartArea },
  { type: 'real_estate', label: 'Real Estate', Icon: SvgHome },
  { type: 'vehicle', label: 'Vehicles', Icon: SvgTravelCar },
  { type: 'valuables', label: 'Valuables', Icon: SvgStarFull },
  { type: 'other_asset', label: 'Other Assets', Icon: SvgArrowOutlineUp },
];

const LIABILITY_TYPES: AccountTypeOption[] = [
  { type: 'credit_card', label: 'Credit Card', Icon: SvgCreditCard },
  { type: 'mortgage', label: 'Mortgage', Icon: SvgHome },
  { type: 'loan', label: 'Loans', Icon: SvgDocument },
  { type: 'other_liability', label: 'Other Liabilities', Icon: SvgArrowOutlineDown },
];

const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>([
  'credit_card',
  'mortgage',
  'loan',
  'other_liability',
]);

function isLiability(type: AccountType): boolean {
  return LIABILITY_ACCOUNT_TYPES.has(type);
}

type TypeRowProps = {
  option: AccountTypeOption;
  onSelect: (type: AccountType) => void;
};

function TypeRow({ option, onSelect }: TypeRowProps) {
  const { Icon, label, type } = option;
  return (
    <button
      onClick={() => onSelect(type)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '14px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `1px solid ${theme.tableBorder}`,
        cursor: 'pointer',
        fontSize: 15,
        color: theme.pageText,
        textAlign: 'left',
      }}
      onMouseEnter={e =>
        (e.currentTarget.style.backgroundColor = theme.tableRowBackgroundHover)
      }
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon style={{ width: 18, height: 18, color: theme.pageTextSubdued }} />
      <Trans>{label}</Trans>
    </button>
  );
}

type SectionHeaderProps = { title: string };

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div
      style={{
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.pageTextSubdued,
        backgroundColor: theme.tableBackground,
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <Trans>{title}</Trans>
    </div>
  );
}

export function CreateLocalAccountModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();

  const [step, setStep] = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('0');
  const [nameError, setNameError] = useState(null);
  const [balanceError, setBalanceError] = useState(false);

  const createAccount = useCreateAccountMutation();

  const validateBalance = (val: string) => !isNaN(parseFloat(val));

  const validateAndSetName = (value: string) => {
    const error = validateAccountName(value, '', accounts);
    if (error) {
      setNameError(error);
    } else {
      setName(value);
      setNameError(null);
    }
  };

  const handleTypeSelect = (type: AccountType) => {
    setSelectedType(type);
    setStep('details');
  };

  const handleBack = () => {
    setStep('type');
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nameError = validateAccountName(name, '', accounts);
    const balErr = !validateBalance(balance);
    setBalanceError(balErr);

    if (!nameError && !balErr) {
      const offBudget = selectedType !== 'cash';
      createAccount.mutate(
        {
          name,
          balance: toRelaxedNumber(balance),
          offBudget,
          type: selectedType,
        },
        {
          onSuccess: id => {
            dispatch(closeModal());
            void navigate('/accounts/' + id);
          },
        },
      );
    }
  };

  return (
    <Modal name="add-local-account">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={t('Create Local Account')}
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          {step === 'type' ? (
            <View style={{ width: 400 }}>
              <SectionHeader title={t('Asset')} />
              {ASSET_TYPES.map(option => (
                <TypeRow
                  key={option.type}
                  option={option}
                  onSelect={handleTypeSelect}
                />
              ))}
              <SectionHeader title={t('Liability')} />
              {LIABILITY_TYPES.map(option => (
                <TypeRow
                  key={option.type}
                  option={option}
                  onSelect={handleTypeSelect}
                />
              ))}
            </View>
          ) : (
            <View>
              <Form onSubmit={onSubmit}>
                <InlineField label={t('Name')} width="100%">
                  <InitialFocus>
                    <Input
                      name="name"
                      value={name}
                      onChangeValue={setName}
                      onUpdate={value => validateAndSetName(value.trim())}
                      style={{ flex: 1 }}
                    />
                  </InitialFocus>
                </InlineField>
                {nameError && (
                  <FormError style={{ marginLeft: 75, color: theme.warningText }}>
                    {nameError}
                  </FormError>
                )}

                <InlineField label={t('Balance')} width="100%">
                  <Input
                    name="balance"
                    inputMode="decimal"
                    value={balance}
                    onChangeValue={setBalance}
                    onUpdate={value => {
                      const val = value.trim();
                      setBalance(val);
                      if (validateBalance(val) && balanceError) {
                        setBalanceError(false);
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                </InlineField>
                {balanceError && (
                  <FormError style={{ marginLeft: 75 }}>
                    <Trans>Balance must be a number</Trans>
                  </FormError>
                )}

                <ModalButtons>
                  <Button onPress={handleBack}>
                    <Trans>Back</Trans>
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    style={{ marginLeft: 10 }}
                  >
                    <Trans>Create</Trans>
                  </Button>
                </ModalButtons>
              </Form>
            </View>
          )}
        </>
      )}
    </Modal>
  );
}
