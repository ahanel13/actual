import { send } from '@actual-app/core/platform/client/connection';
import type { HoldingEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { holdingQueryKey } from '#hooks/useHoldings';

export function useCreateHoldingMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holding: Omit<HoldingEntity, 'id'>) =>
      send('holdings-create', holding),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: holdingQueryKey(accountId),
      });
    },
  });
}

export function useUpdateHoldingMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holding: Partial<HoldingEntity> & { id: string }) =>
      send('holdings-update', holding),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: holdingQueryKey(accountId),
      });
    },
  });
}

export function useDeleteHoldingMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => send('holdings-delete', { id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: holdingQueryKey(accountId),
      });
    },
  });
}

export function useRefreshPricesMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => send('prices-refresh', { accountId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: holdingQueryKey(accountId),
      });
    },
  });
}

export function useRefreshAllPricesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => send('prices-refresh-all', undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['holdings'] });
      void queryClient.invalidateQueries({ queryKey: ['balance-history'] });
    },
  });
}
