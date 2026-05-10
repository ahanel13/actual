import { send } from '@actual-app/core/platform/client/connection';
import type { AccountEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

function selectActive(accounts: AccountEntity[]) {
  return accounts.filter(account => !account.closed);
}

export const accountQueries = {
  all: () => ['accounts'],
  lists: () => [...accountQueries.all(), 'lists'],
  list: () =>
    queryOptions<AccountEntity[]>({
      queryKey: [...accountQueries.lists()],
      queryFn: async () => {
        const accounts: AccountEntity[] = await send('accounts-get');
        return accounts;
      },
      placeholderData: [],
      // Manually invalidated when accounts change
      staleTime: Infinity,
    }),
  listActive: () =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: selectActive,
    }),
  listClosed: () =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: accounts => accounts.filter(account => !!account.closed),
    }),
  listOnBudget: () =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: accounts =>
        selectActive(accounts).filter(account => !account.offbudget),
    }),
  listOffBudget: () =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: accounts =>
        selectActive(accounts).filter(
          account => !!account.offbudget && account.type !== 'investment',
        ),
    }),
  listInvestment: () =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: accounts =>
        selectActive(accounts).filter(account => account.type === 'investment'),
    }),
  listByType: (type: import('@actual-app/core/types/models').AccountType) =>
    queryOptions<AccountEntity[]>({
      ...accountQueries.list(),
      select: accounts =>
        selectActive(accounts).filter(account => account.type === type),
    }),
};
