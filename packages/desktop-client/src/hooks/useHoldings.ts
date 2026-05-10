import { send } from '@actual-app/core/platform/client/connection';
import type { HoldingWithPrice } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

export function holdingQueryKey(accountId: string) {
  return ['holdings', accountId];
}

export function useHoldings(accountId: string) {
  return useQuery<HoldingWithPrice[]>({
    queryKey: holdingQueryKey(accountId),
    queryFn: () => send('holdings-get', { accountId }),
    staleTime: Infinity,
  });
}
