import { send } from '@actual-app/core/platform/client/connection';
import type { BalanceHistoryEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

export function balanceHistoryQueryKey(accountId: string) {
  return ['balance-history', accountId];
}

export function useBalanceHistory(accountId: string | undefined) {
  return useQuery({
    queryKey: balanceHistoryQueryKey(accountId ?? ''),
    queryFn: (): Promise<BalanceHistoryEntity[]> =>
      send('balance-history-get', { accountId: accountId! }),
    staleTime: Infinity,
    enabled: !!accountId,
  });
}
