import { useQuery, useQueryClient } from '@tanstack/react-query';

import { plaidQueries } from '#accounts/plaidQueries';
import type { PlaidItem } from '#accounts/plaidQueries';

import { useSyncServerStatus } from './useSyncServerStatus';

export type { PlaidItem };

export function usePlaidItems() {
  const status = useSyncServerStatus();
  const queryClient = useQueryClient();
  const { data, isFetching } = useQuery({
    ...plaidQueries.itemsList(),
    enabled: status === 'online',
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: plaidQueries.items() });

  return {
    items: data ?? [],
    isLoading: isFetching,
    refresh,
  };
}
