import { useEffect, useState } from 'react';

import { send } from '@actual-app/core/platform/client/connection';

import { useSyncServerStatus } from './useSyncServerStatus';

export function usePlaidStatus() {
  const [configuredPlaid, setConfiguredPlaid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const status = useSyncServerStatus();

  useEffect(() => {
    async function fetch() {
      setIsLoading(true);
      try {
        const result = (await send('plaid-status')) as
          | { configured?: boolean }
          | undefined;
        setConfiguredPlaid(Boolean(result?.configured));
      } catch {
        setConfiguredPlaid(false);
      } finally {
        setIsLoading(false);
      }
    }

    if (status === 'online') {
      void fetch();
    }
  }, [status]);

  return {
    configuredPlaid,
    isLoading,
  };
}
