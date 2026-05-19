import { send } from '@actual-app/core/platform/client/connection';
import { queryOptions } from '@tanstack/react-query';

export type PlaidItem = {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  institution_logo: string | null;
  institution_url: string | null;
  cursor: string | null;
  last_synced_at: number | null;
  error_code: string | null;
};

export const plaidQueries = {
  all: () => ['plaid'] as const,
  items: () => [...plaidQueries.all(), 'items'] as const,
  itemsList: () =>
    queryOptions<PlaidItem[]>({
      queryKey: [...plaidQueries.items()],
      queryFn: async () => {
        const result = (await send('plaid-get-items')) as
          | { items?: PlaidItem[] }
          | undefined;
        return result?.items || [];
      },
      placeholderData: [],
      staleTime: 30_000,
    }),
};
