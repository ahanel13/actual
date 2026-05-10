import { send } from '@actual-app/core/platform/client/connection';
import type { BalanceHistoryEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { balanceHistoryQueryKey } from '../hooks/useBalanceHistory';

function invalidate(queryClient: ReturnType<typeof useQueryClient>, accountId: string) {
  void queryClient.invalidateQueries({
    queryKey: balanceHistoryQueryKey(accountId),
  });
}

export function useCreateSnapshotMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshot: Omit<BalanceHistoryEntity, 'id'>) =>
      send('balance-history-create', snapshot),
    onSuccess: () => invalidate(queryClient, accountId),
  });
}

export function useUpdateSnapshotMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshot: Partial<BalanceHistoryEntity> & { id: string }) =>
      send('balance-history-update', snapshot),
    onSuccess: () => invalidate(queryClient, accountId),
  });
}

export function useDeleteSnapshotMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      send('balance-history-delete', { id }),
    onSuccess: () => invalidate(queryClient, accountId),
  });
}

export function useImportSnapshotsMutation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: Array<{ date: string; balance: number }>) =>
      send('balance-history-import', { accountId, rows }),
    onSuccess: () => invalidate(queryClient, accountId),
  });
}

export function useExportSnapshotsMutation() {
  return useMutation({
    mutationFn: (accountId: string) =>
      send('balance-history-export', { accountId }),
  });
}
