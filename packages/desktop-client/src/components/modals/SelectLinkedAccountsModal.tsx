import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { getOffBudgetForType } from '@actual-app/core/shared/accounts';
import { currentDay, subDays } from '@actual-app/core/shared/months';
import type {
  AccountEntity,
  SyncServerGoCardlessAccount,
  SyncServerPlaidAccount,
  SyncServerPluggyAiAccount,
  SyncServerSimpleFinAccount,
} from '@actual-app/core/types/models';
import type { AccountType } from '@actual-app/core/types/models';
import { format as formatDate, parseISO } from 'date-fns';

import {
  useLinkAccountMutation,
  useLinkAccountPlaidMutation,
  useLinkAccountPluggyAiMutation,
  useLinkAccountSimpleFinMutation,
  useUnlinkAccountMutation,
} from '#accounts';
import { Autocomplete } from '#components/autocomplete/Autocomplete';
import type { AutocompleteItem } from '#components/autocomplete/Autocomplete';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { Cell, Field, Row, Table, TableHeader } from '#components/table';
import { AmountInput } from '#components/util/AmountInput';
import { useAccounts } from '#hooks/useAccounts';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { closeModal } from '#modals/modalsSlice';
import { transactions } from '#queries';
import { liveQuery } from '#queries/liveQuery';
import { useDispatch } from '#redux';

function useAddNewAccountOption() {
  const { t } = useTranslation();

  const addNewAccountOption = {
    id: 'new',
    name: t('Add as new account'),
  };

  return { addNewAccountOption };
}

function isNewAccountOption(
  chosenAccountId: string | undefined,
  addNewOptionId: string,
): boolean {
  return chosenAccountId === addNewOptionId;
}

export type SelectLinkedAccountsModalProps =
  | {
      requisitionId: string;
      externalAccounts: SyncServerGoCardlessAccount[];
      syncSource: 'goCardless';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerSimpleFinAccount[];
      syncSource: 'simpleFin';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerPluggyAiAccount[];
      syncSource: 'pluggyai';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerPlaidAccount[];
      syncSource: 'plaid';
      plaidItemId: string;
      plaidInstitution: { institution_id: string | null; name: string | null };
      upgradingAccountId?: string;
    };

export function SelectLinkedAccountsModal(
  props: SelectLinkedAccountsModalProps,
) {
  const {
    requisitionId = undefined,
    externalAccounts,
    syncSource,
    upgradingAccountId,
  } = props as SelectLinkedAccountsModalProps & {
    requisitionId?: string;
  };
  const plaidItemId =
    props.syncSource === 'plaid' ? props.plaidItemId : undefined;
  const plaidInstitution =
    props.syncSource === 'plaid' ? props.plaidInstitution : undefined;
  const propsWithSortedExternalAccounts =
    useMemo<SelectLinkedAccountsModalProps>(() => {
      const toSort = externalAccounts ? [...externalAccounts] : [];
      toSort.sort(
        (a, b) =>
          getInstitutionName(a)?.localeCompare(getInstitutionName(b)) ||
          a.name.localeCompare(b.name),
      );
      switch (syncSource) {
        case 'simpleFin':
          return {
            syncSource: 'simpleFin',
            externalAccounts: toSort as SyncServerSimpleFinAccount[],
            upgradingAccountId,
          };
        case 'pluggyai':
          return {
            syncSource: 'pluggyai',
            externalAccounts: toSort as SyncServerPluggyAiAccount[],
            upgradingAccountId,
          };
        case 'plaid':
          return {
            syncSource: 'plaid',
            externalAccounts: toSort as SyncServerPlaidAccount[],
            plaidItemId: plaidItemId!,
            plaidInstitution: plaidInstitution!,
            upgradingAccountId,
          };
        case 'goCardless':
          return {
            syncSource: 'goCardless',
            requisitionId: requisitionId!,
            externalAccounts: toSort as SyncServerGoCardlessAccount[],
            upgradingAccountId,
          };
        default:
          throw new Error(`Unrecognized sync source: ${String(syncSource)}`);
      }
    }, [
      externalAccounts,
      syncSource,
      requisitionId,
      plaidItemId,
      plaidInstitution,
      upgradingAccountId,
    ]);

  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const dispatch = useDispatch();
  const { data: allAccounts = [] } = useAccounts();
  const localAccounts = allAccounts.filter(a => a.closed === 0);
  // Tracks the external account IDs that were already linked when this modal
  // opened. Only these should produce an 'unlinking' entry when removed —
  // removing a pre-selection from upgradingAccountId should not.
  const [originallyLinkedExternalIds] = useState(() => {
    const externalAccountIds = new Set(externalAccounts.map(a => a.account_id));
    return new Set(
      localAccounts
        .filter(acc => acc.account_id && externalAccountIds.has(acc.account_id))
        .map(acc => acc.account_id as string),
    );
  });

  const [draftLinkAccounts, setDraftLinkAccounts] = useState<
    Map<string, 'linking' | 'unlinking'>
  >(() => {
    const initial = new Map<string, 'linking' | 'unlinking'>();
    for (const id of originallyLinkedExternalIds) {
      initial.set(id, 'linking');
    }
    // When upgrading an existing account, pre-mark the auto-selected external
    // account as 'linking' so the confirm button is enabled immediately.
    if (upgradingAccountId) {
      const alreadyLinkedLocalIds = new Set(
        localAccounts
          .filter(acc => originallyLinkedExternalIds.has(acc.account_id ?? ''))
          .map(acc => acc.id),
      );
      if (!alreadyLinkedLocalIds.has(upgradingAccountId)) {
        const preselectedExternal =
          propsWithSortedExternalAccounts.externalAccounts.find(
            account => !initial.has(account.account_id),
          );
        if (preselectedExternal) {
          initial.set(preselectedExternal.account_id, 'linking');
        }
      }
    }
    return initial;
  });
  const [chosenAccounts, setChosenAccounts] = useState<Record<string, string>>(
    () => {
      const initiallyChosenAccounts = Object.fromEntries(
        localAccounts
          .filter(acc => acc.account_id)
          .map(acc => [acc.account_id, acc.id]),
      );

      const preselectedExternalAccount =
        propsWithSortedExternalAccounts.externalAccounts.find(
          account => initiallyChosenAccounts[account.account_id] == null,
        );

      if (
        upgradingAccountId &&
        preselectedExternalAccount &&
        !Object.values(initiallyChosenAccounts).includes(upgradingAccountId)
      ) {
        initiallyChosenAccounts[preselectedExternalAccount.account_id] =
          upgradingAccountId;
      }

      return initiallyChosenAccounts;
    },
  );
  const [customStartingDates, setCustomStartingDates] = useState<
    Record<string, StartingBalanceInfo>
  >({});
  const [accountTypes, setAccountTypes] = useState<
    Record<string, AccountType | undefined>
  >({});
  const { addNewAccountOption } = useAddNewAccountOption();

  const linkAccount = useLinkAccountMutation();
  const unlinkAccount = useUnlinkAccountMutation();
  const linkAccountSimpleFin = useLinkAccountSimpleFinMutation();
  const linkAccountPluggyAi = useLinkAccountPluggyAiMutation();
  const linkAccountPlaid = useLinkAccountPlaidMutation();

  async function onNext() {
    const chosenLocalAccountIds = Object.values(chosenAccounts);

    // Unlink accounts that were previously linked, but the user
    // chose to remove the bank-sync
    localAccounts
      .filter(acc => acc.account_id)
      .filter(acc => !chosenLocalAccountIds.includes(acc.id))
      .forEach(acc => unlinkAccount.mutate({ id: acc.id }));

    // Link new accounts
    Object.entries(chosenAccounts).forEach(
      ([chosenExternalAccountId, chosenLocalAccountId]) => {
        const externalAccountIndex =
          propsWithSortedExternalAccounts.externalAccounts.findIndex(
            account => account.account_id === chosenExternalAccountId,
          );
        const isNew = isNewAccountOption(
          chosenLocalAccountId,
          addNewAccountOption.id,
        );
        const accountType = isNew
          ? accountTypes[chosenExternalAccountId]
          : undefined;
        const offBudget = getOffBudgetForType(accountType) === 1;

        // Skip linking accounts that were previously linked with
        // a different bank.
        if (externalAccountIndex === -1) {
          return;
        }

        // Finally link the matched account
        const customSettings = customStartingDates[chosenExternalAccountId];
        const startingDate =
          customSettings?.date && customSettings.date.trim() !== ''
            ? customSettings.date
            : undefined;
        const startingBalance =
          customSettings?.amount != null ? customSettings.amount : undefined;

        const upgradingId = isNew ? undefined : chosenLocalAccountId;

        if (propsWithSortedExternalAccounts.syncSource === 'simpleFin') {
          linkAccountSimpleFin.mutate({
            externalAccount:
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ],
            upgradingId,
            offBudget,
            type: accountType,
            startingDate,
            startingBalance,
          });
        } else if (propsWithSortedExternalAccounts.syncSource === 'pluggyai') {
          linkAccountPluggyAi.mutate({
            externalAccount:
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ],
            upgradingId,
            offBudget,
            type: accountType,
            startingDate,
            startingBalance,
          });
        } else if (propsWithSortedExternalAccounts.syncSource === 'plaid') {
          linkAccountPlaid.mutate({
            externalAccount: propsWithSortedExternalAccounts.externalAccounts[
              externalAccountIndex
            ] as SyncServerPlaidAccount,
            itemId: propsWithSortedExternalAccounts.plaidItemId,
            institution: propsWithSortedExternalAccounts.plaidInstitution,
            upgradingId,
            offBudget,
            type: accountType,
            startingDate,
            startingBalance,
          });
        } else {
          linkAccount.mutate({
            requisitionId: propsWithSortedExternalAccounts.requisitionId,
            account:
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ],
            upgradingId,
            offBudget,
            type: accountType,
            startingDate,
            startingBalance,
          });
        }
      },
    );

    dispatch(closeModal());
  }

  const unlinkedAccounts = localAccounts.filter(
    account => !Object.values(chosenAccounts).includes(account.id),
  );

  function onSetLinkedAccount(
    externalAccount:
      | SyncServerGoCardlessAccount
      | SyncServerSimpleFinAccount
      | SyncServerPluggyAiAccount
      | SyncServerPlaidAccount,
    localAccountId: string | null | undefined,
  ) {
    setChosenAccounts(accounts => {
      const updatedAccounts = { ...accounts };

      if (localAccountId) {
        updatedAccounts[externalAccount.account_id] = localAccountId;
        setDraftLinkAccounts(prev =>
          new Map(prev).set(externalAccount.account_id, 'linking'),
        );
      } else {
        delete updatedAccounts[externalAccount.account_id];
        setDraftLinkAccounts(prev => {
          const next = new Map(prev);
          if (originallyLinkedExternalIds.has(externalAccount.account_id)) {
            // Was linked before this modal opened → mark for unlinking
            next.set(externalAccount.account_id, 'unlinking');
          } else {
            // Was only pre-selected (upgradingAccountId path) → just remove
            next.delete(externalAccount.account_id);
          }
          return next;
        });
      }

      return updatedAccounts;
    });
  }

  const getChosenAccount = (accountId: string) => {
    const chosenId = chosenAccounts[accountId];
    if (!chosenId) return undefined;

    if (chosenId === addNewAccountOption.id) {
      return addNewAccountOption;
    }

    return localAccounts.find(acc => acc.id === chosenId);
  };

  // Memoize default starting settings to avoid repeated calculations
  const defaultStartingSettings = useMemo<StartingBalanceInfo>(
    () => ({
      date: subDays(currentDay(), 90),
      amount: 0,
    }),
    [],
  );

  const getCustomStartingDate = (accountId: string) => {
    if (customStartingDates[accountId]) {
      return customStartingDates[accountId];
    }
    // Default to 90 days ago (matches server default)
    return defaultStartingSettings;
  };

  const setCustomStartingDate = (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => {
    setCustomStartingDates(prev => ({
      ...prev,
      [accountId]: settings,
    }));
  };

  const setAccountType = (accountId: string, type: AccountType | undefined) => {
    setAccountTypes(prev => ({ ...prev, [accountId]: type }));
  };

  const label = useMemo(() => {
    const s = new Set(draftLinkAccounts.values());
    if (s.has('linking') && s.has('unlinking')) {
      return t('Link and unlink accounts');
    } else if (s.has('linking')) {
      return t('Link accounts');
    } else if (s.has('unlinking')) {
      return t('Unlink accounts');
    }

    return t('Link or unlink accounts');
  }, [draftLinkAccounts, t]);

  return (
    <Modal
      name="select-linked-accounts"
      containerProps={{
        style: isNarrowWidth
          ? {
              width: '100vw',
              maxWidth: '100vw',
              height: '100vh',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
            }
          : { width: 1000 },
      }}
    >
      {({ state }) => (
        <View
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <ModalHeader
            title={t('Link Accounts')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          <View
            style={{
              padding: isNarrowWidth ? '0 16px' : '0 20px',
              flexShrink: 0,
            }}
          >
            <Text style={{ marginBottom: 20 }}>
              <Trans>
                We found the following accounts. Select which ones you want to
                add:
              </Trans>
            </Text>
          </View>

          {isNarrowWidth ? (
            <View
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {propsWithSortedExternalAccounts.externalAccounts.map(account => (
                <AccountCard
                  key={account.account_id}
                  externalAccount={account}
                  chosenAccount={getChosenAccount(account.account_id)}
                  unlinkedAccounts={unlinkedAccounts}
                  accountType={accountTypes[account.account_id]}
                  onSetLinkedAccount={onSetLinkedAccount}
                  onSetAccountType={setAccountType}
                  customStartingDate={getCustomStartingDate(account.account_id)}
                  onSetCustomStartingDate={setCustomStartingDate}
                />
              ))}
            </View>
          ) : (
            <View
              style={{ ...styles.tableContainer, height: 300, flex: 'unset' }}
            >
              <TableHeader>
                <Cell value={t('Institution to Sync')} width={150} />
                <Cell value={t('Bank Account To Sync')} width={150} />
                <Cell value={t('Balance')} width={120} />
                <Cell value={t('Account in Actual')} width="flex" />
                <Cell value={t('Account Type')} width={130} />
                <Cell value={t('Starting Date')} width={120} />
                <Cell value={t('Starting Balance')} width={120} />
                <Cell value={t('Actions')} width={150} textAlign="center" />
              </TableHeader>

              <Table<ExternalAccount & { id: string }>
                items={propsWithSortedExternalAccounts.externalAccounts.map(
                  acc => ({ ...acc, id: acc.account_id }),
                )}
                style={{ backgroundColor: theme.tableHeaderBackground }}
                renderItem={({ item }) => {
                  const chosenAccount = getChosenAccount(item.account_id);
                  // Only show starting options for new accounts being created
                  const shouldShowStartingOptions = isNewAccountOption(
                    chosenAccount?.id,
                    addNewAccountOption.id,
                  );

                  return (
                    <TableRow
                      key={item.id}
                      externalAccount={item}
                      chosenAccount={chosenAccount}
                      unlinkedAccounts={unlinkedAccounts}
                      accountType={accountTypes[item.account_id]}
                      onSetLinkedAccount={onSetLinkedAccount}
                      onSetAccountType={setAccountType}
                      customStartingDate={getCustomStartingDate(
                        item.account_id,
                      )}
                      onSetCustomStartingDate={setCustomStartingDate}
                      showStartingOptions={shouldShowStartingOptions}
                    />
                  );
                }}
              />
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: isNarrowWidth ? 'center' : 'flex-end',
              ...(isNarrowWidth
                ? {
                    padding: '16px',
                    flexShrink: 0,
                    borderTop: `1px solid ${theme.tableBorder}`,
                  }
                : { marginTop: 10 }),
            }}
          >
            <Button
              variant="primary"
              onPress={onNext}
              isDisabled={draftLinkAccounts.size === 0}
              style={
                isNarrowWidth
                  ? {
                      width: '100%',
                      height: '44px',
                      fontSize: '1em',
                    }
                  : undefined
              }
            >
              {label}
            </Button>
          </View>
        </View>
      )}
    </Modal>
  );
}

type ExternalAccount =
  | SyncServerGoCardlessAccount
  | SyncServerSimpleFinAccount
  | SyncServerPluggyAiAccount
  | SyncServerPlaidAccount;

type StartingBalanceInfo = {
  date: string;
  amount: number;
};

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
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

type SharedAccountRowProps = {
  externalAccount: ExternalAccount;
  chosenAccount: { id: string; name: string } | undefined;
  unlinkedAccounts: AccountEntity[];
  accountType: AccountType | undefined;
  onSetLinkedAccount: (
    externalAccount: ExternalAccount,
    localAccountId: string | null | undefined,
  ) => void;
  onSetAccountType: (accountId: string, type: AccountType | undefined) => void;
};

function getAvailableAccountOptions(
  unlinkedAccounts: AccountEntity[],
  chosenAccount: { id: string; name: string } | undefined,
  addNewAccountOption: { id: string; name: string },
): AutocompleteItem[] {
  const options: AutocompleteItem[] = [...unlinkedAccounts];
  if (chosenAccount && chosenAccount.id !== addNewAccountOption.id) {
    options.push(chosenAccount);
  }
  options.push(addNewAccountOption);
  return options;
}

type TableRowProps = SharedAccountRowProps & {
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
  showStartingOptions: boolean;
};

type AccountCardProps = SharedAccountRowProps & {
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
};

function useStartingBalanceInfo(accountId: string | undefined) {
  const [info, setInfo] = useState<StartingBalanceInfo | null>(null);

  useEffect(() => {
    if (!accountId) {
      setInfo(null);
      return;
    }

    const query = transactions(accountId)
      .filter({ starting_balance_flag: true })
      .select(['date', 'amount'])
      .limit(1);

    const live = liveQuery<StartingBalanceInfo>(query, {
      onData: data => {
        setInfo(data?.[0] ?? null);
      },
      onError: () => {
        setInfo(null);
      },
    });

    return () => {
      live?.unsubscribe();
    };
  }, [accountId]);

  return info;
}

function TableRow({
  externalAccount,
  chosenAccount,
  unlinkedAccounts,
  accountType,
  onSetLinkedAccount,
  onSetAccountType,
  customStartingDate,
  onSetCustomStartingDate,
  showStartingOptions,
}: TableRowProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { addNewAccountOption } = useAddNewAccountOption();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { t } = useTranslation();
  const startingBalanceInfo = useStartingBalanceInfo(
    showStartingOptions ? undefined : chosenAccount?.id,
  );

  const availableAccountOptions = getAvailableAccountOptions(
    unlinkedAccounts,
    chosenAccount,
    addNewAccountOption,
  );

  return (
    <Row style={{ backgroundColor: theme.tableBackground }}>
      {/* Institution to Sync */}
      <Field width={150}>
        <Tooltip content={getInstitutionName(externalAccount)}>
          <View
            style={{
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              display: 'block',
            }}
          >
            {getInstitutionName(externalAccount)}
          </View>
        </Tooltip>
      </Field>
      {/* Bank Account To Sync */}
      <Field width={150}>
        <Tooltip content={externalAccount.name}>
          <View
            style={{
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              display: 'block',
            }}
          >
            {externalAccount.name}
          </View>
        </Tooltip>
      </Field>
      {/* Balance */}
      <Field width={120} style={{ textAlign: 'right' }}>
        <PrivacyFilter>
          {externalAccount.balance != null ? (
            <FinancialText>
              {format(externalAccount.balance.toString(), 'financial')}
            </FinancialText>
          ) : (
            t('Unknown')
          )}
        </PrivacyFilter>
      </Field>
      {/* Account in Actual */}
      <Field
        width="flex"
        truncate={focusedField !== 'account'}
        onClick={() => setFocusedField('account')}
      >
        {focusedField === 'account' ? (
          <Autocomplete
            focused
            strict
            highlightFirst
            clearOnBlur={false}
            suggestions={availableAccountOptions}
            onSelect={value => {
              onSetLinkedAccount(externalAccount, value);
            }}
            inputProps={{
              onBlur: () => setFocusedField(null),
            }}
            value={chosenAccount?.id}
          />
        ) : (
          chosenAccount?.name
        )}
      </Field>
      {/* Account Type */}
      <Field width={130} truncate={false}>
        {showStartingOptions ? (
          <select
            value={accountType ?? ''}
            onChange={e =>
              onSetAccountType(
                externalAccount.account_id,
                (e.target.value as AccountType) || undefined,
              )
            }
            style={{
              width: '100%',
              fontSize: 13,
              padding: '3px 4px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.tableBackground,
              color: theme.pageText,
            }}
          >
            <option value="">
              <Trans>Default</Trans>
            </option>
            {ACCOUNT_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
      </Field>

      {showStartingOptions ? (
        <StartingOptionsFields
          accountId={externalAccount.account_id}
          externalBalance={externalAccount.balance}
          customStartingDate={customStartingDate}
          onSetCustomStartingDate={onSetCustomStartingDate}
          layout="inline"
        />
      ) : (
        <>
          {/* Starting Date */}
          <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
            {startingBalanceInfo ? (
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontStyle: 'italic',
                }}
              >
                {formatDate(parseISO(startingBalanceInfo.date), dateFormat)}
              </Text>
            ) : null}
          </Field>
          {/* Starting Balance */}
          <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
            {startingBalanceInfo ? (
              <PrivacyFilter>
                <FinancialText
                  style={{
                    color: theme.pageTextSubdued,
                    fontStyle: 'italic',
                  }}
                >
                  {format(startingBalanceInfo.amount, 'financial')}
                </FinancialText>
              </PrivacyFilter>
            ) : null}
          </Field>
        </>
      )}
      {/* Actions */}
      <Field width={150}>
        {chosenAccount ? (
          <Button
            onPress={() => {
              onSetLinkedAccount(externalAccount, null);
            }}
            style={{ float: 'right' }}
          >
            <Trans>Remove bank sync</Trans>
          </Button>
        ) : (
          <Button
            variant="primary"
            onPress={() => {
              setFocusedField('account');
            }}
            style={{ float: 'right' }}
          >
            <Trans>Set up bank sync</Trans>
          </Button>
        )}
      </Field>
    </Row>
  );
}

function getInstitutionName(
  externalAccount:
    | SyncServerGoCardlessAccount
    | SyncServerSimpleFinAccount
    | SyncServerPluggyAiAccount
    | SyncServerPlaidAccount,
) {
  const maybeInstitution = (externalAccount as { institution?: unknown })
    .institution;
  if (typeof maybeInstitution === 'string') {
    return maybeInstitution ?? '';
  } else if (
    maybeInstitution &&
    typeof (maybeInstitution as { name?: unknown }).name === 'string'
  ) {
    return (maybeInstitution as { name: string }).name ?? '';
  }
  return '';
}

type StartingOptionsFieldsProps = {
  accountId: string;
  externalBalance: number | null | undefined;
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
  layout: 'inline' | 'stacked';
};

function StartingOptionsFields({
  accountId,
  externalBalance,
  customStartingDate,
  onSetCustomStartingDate,
  layout,
}: StartingOptionsFieldsProps) {
  const zeroSign = externalBalance != null && externalBalance < 0 ? '-' : '+';

  if (layout === 'inline') {
    return (
      <>
        {/* Starting Date */}
        <Field width={120} truncate={false}>
          <Input
            type="date"
            value={customStartingDate.date}
            onChange={e =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                date: e.target.value,
              })
            }
            style={{ width: '100%' }}
          />
        </Field>
        {/* Starting Balance */}
        <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
          <AmountInput
            value={customStartingDate.amount}
            zeroSign={zeroSign}
            onUpdate={amount =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                amount,
              })
            }
            style={{ width: '100%' }}
          />
        </Field>
      </>
    );
  }

  return (
    <View
      style={{
        marginTop: 8,
        padding: '12px',
        backgroundColor: theme.tableHeaderBackground,
        borderRadius: 4,
      }}
    >
      <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <View>
          <Text
            style={{
              marginBottom: 4,
              fontSize: 13,
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>Starting date:</Trans>
          </Text>
          <Input
            type="date"
            value={customStartingDate.date}
            onChange={e =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                date: e.target.value,
              })
            }
            style={{ width: '100%' }}
          />
        </View>
        <View>
          <Text
            style={{
              marginBottom: 4,
              fontSize: 13,
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>Balance on that date:</Trans>
          </Text>
          <AmountInput
            value={customStartingDate.amount}
            zeroSign={zeroSign}
            onUpdate={amount =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                amount,
              })
            }
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </View>
  );
}

function AccountCard({
  externalAccount,
  chosenAccount,
  unlinkedAccounts,
  accountType,
  onSetLinkedAccount,
  onSetAccountType,
  customStartingDate,
  onSetCustomStartingDate,
}: AccountCardProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { addNewAccountOption } = useAddNewAccountOption();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { t } = useTranslation();

  const availableAccountOptions = getAvailableAccountOptions(
    unlinkedAccounts,
    chosenAccount,
    addNewAccountOption,
  );

  // Only show starting date options for new accounts being created
  const shouldShowStartingOptions = isNewAccountOption(
    chosenAccount?.id,
    addNewAccountOption.id,
  );
  const startingBalanceInfo = useStartingBalanceInfo(
    shouldShowStartingOptions ? undefined : chosenAccount?.id,
  );

  return (
    <SpaceBetween
      direction="vertical"
      gap={10}
      style={{
        backgroundColor: theme.tableBackground,
        borderRadius: 8,
        padding: '12px 16px',
        border: `1px solid ${theme.tableBorder}`,
        minHeight: 'fit-content',
        alignItems: 'stretch',
      }}
    >
      <View
        style={{
          fontWeight: 600,
          fontSize: '1.1em',
          color: theme.pageText,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {externalAccount.name}
      </View>

      <View
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {getInstitutionName(externalAccount)}
      </View>

      <View
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
        }}
      >
        <Trans>Balance:</Trans>{' '}
        <PrivacyFilter>
          {externalAccount.balance != null ? (
            <FinancialText>
              {format(externalAccount.balance.toString(), 'financial')}
            </FinancialText>
          ) : (
            t('Unknown')
          )}
        </PrivacyFilter>
      </View>

      <SpaceBetween
        direction="horizontal"
        gap={5}
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
        }}
      >
        <Text>
          <Trans>Linked to:</Trans>
        </Text>
        {chosenAccount ? (
          <Text style={{ color: theme.noticeTextLight, fontWeight: 500 }}>
            {chosenAccount.name}
          </Text>
        ) : (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>Not linked</Trans>
          </Text>
        )}
      </SpaceBetween>

      {!shouldShowStartingOptions && startingBalanceInfo && (
        <View
          style={{
            fontSize: '0.9em',
            color: theme.pageTextSubdued,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Starting date:</Trans>
            </Text>
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontStyle: 'italic',
              }}
            >
              {formatDate(parseISO(startingBalanceInfo.date), dateFormat)}
            </Text>
          </View>
          <View style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Starting balance:</Trans>
            </Text>
            <PrivacyFilter>
              <FinancialText
                style={{
                  color: theme.pageTextSubdued,
                  fontStyle: 'italic',
                }}
              >
                {format(startingBalanceInfo.amount, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          </View>
        </View>
      )}

      {focusedField === 'account' && (
        <View style={{ marginBottom: 12 }}>
          <Autocomplete
            focused
            strict
            highlightFirst
            clearOnBlur={false}
            suggestions={availableAccountOptions}
            onSelect={value => {
              onSetLinkedAccount(externalAccount, value);
              setFocusedField(null);
            }}
            inputProps={{
              onBlur: () => setFocusedField(null),
              placeholder: t('Select account...'),
            }}
            value={chosenAccount?.id}
          />
        </View>
      )}

      {shouldShowStartingOptions && (
        <>
          <View>
            <Text
              style={{
                marginBottom: 4,
                fontSize: 13,
                color: theme.pageTextSubdued,
              }}
            >
              <Trans>Account type:</Trans>
            </Text>
            <select
              value={accountType ?? ''}
              onChange={e =>
                onSetAccountType(
                  externalAccount.account_id,
                  (e.target.value as AccountType) || undefined,
                )
              }
              style={{
                width: '100%',
                fontSize: 13,
                padding: '6px 8px',
                borderRadius: 4,
                border: `1px solid ${theme.tableBorder}`,
                backgroundColor: theme.tableBackground,
                color: theme.pageText,
              }}
            >
              <option value="">Default (checking/savings)</option>
              {ACCOUNT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </View>
          <StartingOptionsFields
            accountId={externalAccount.account_id}
            externalBalance={externalAccount.balance}
            customStartingDate={customStartingDate}
            onSetCustomStartingDate={onSetCustomStartingDate}
            layout="stacked"
          />
        </>
      )}

      {chosenAccount ? (
        <Button
          onPress={() => {
            onSetLinkedAccount(externalAccount, null);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '0.9em',
            width: '100%',
          }}
        >
          <Trans>Remove bank sync</Trans>
        </Button>
      ) : (
        <Button
          variant="primary"
          onPress={() => {
            setFocusedField('account');
          }}
          style={{
            padding: '8px 16px',
            fontSize: '0.9em',
            width: '100%',
          }}
        >
          <Trans>Link account</Trans>
        </Button>
      )}
    </SpaceBetween>
  );
}
