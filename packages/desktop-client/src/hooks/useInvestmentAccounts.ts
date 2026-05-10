import { useQuery } from '@tanstack/react-query';

import { accountQueries } from '#accounts';

export function useInvestmentAccounts() {
  return useQuery(accountQueries.listInvestment());
}
