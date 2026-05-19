// @ts-strict-ignore
import * as asyncStorage from '#platform/server/asyncStorage';
import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { post } from '#server/post';
import { getServer } from '#server/server-config';
import { batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';
import type {
  HoldingEntity,
  HoldingWithPrice,
  PriceCacheEntry,
} from '#types/models';

export type InvestmentsHandlers = {
  'holdings-get': typeof getHoldings;
  'holdings-create': typeof createHolding;
  'holdings-update': typeof updateHolding;
  'holdings-delete': typeof deleteHolding;
  'prices-refresh': typeof refreshPrices;
  'prices-refresh-all': typeof refreshAllPrices;
  'yahoo-chart': typeof fetchYahooChart;
};

export const app = createApp<InvestmentsHandlers>();
app.method('holdings-get', getHoldings);
app.method('holdings-create', mutator(createHolding));
app.method('holdings-update', mutator(updateHolding));
app.method('holdings-delete', mutator(deleteHolding));
app.method('prices-refresh', mutator(refreshPrices));
app.method('prices-refresh-all', mutator(refreshAllPrices));
app.method('yahoo-chart', fetchYahooChart);

async function getHoldings({
  accountId,
}: {
  accountId: string;
}): Promise<HoldingWithPrice[]> {
  return db.all<HoldingWithPrice>(
    `SELECT h.*, p.price as current_price, p.fetched_at as price_fetched_at
     FROM holdings h
     LEFT JOIN price_cache p ON h.symbol = p.symbol
     WHERE h.account_id = ? AND h.tombstone = 0
     ORDER BY h.symbol`,
    [accountId],
  );
}

async function createHolding(
  holding: Omit<HoldingEntity, 'id'>,
): Promise<string> {
  return db.insertWithUUID('holdings', {
    account_id: holding.account_id,
    symbol: holding.symbol.toUpperCase(),
    name: holding.name ?? null,
    shares: holding.shares,
    cost_basis_per_share: holding.cost_basis_per_share ?? null,
    currency: holding.currency ?? 'USD',
    tombstone: 0,
  });
}

async function updateHolding(
  holding: Partial<HoldingEntity> & { id: string },
): Promise<void> {
  const patch: Record<string, string | number | null> = { id: holding.id };

  if (holding.symbol !== undefined) patch.symbol = holding.symbol.toUpperCase();
  if (holding.name !== undefined) patch.name = holding.name ?? null;
  if (holding.shares !== undefined) patch.shares = holding.shares;
  if (holding.cost_basis_per_share !== undefined) {
    patch.cost_basis_per_share = holding.cost_basis_per_share ?? null;
  }
  if (holding.currency !== undefined) patch.currency = holding.currency;

  if (Object.keys(patch).length === 1) return; // only id — nothing to update

  await db.update('holdings', patch);
}

async function deleteHolding({ id }: { id: string }): Promise<void> {
  await db.delete_('holdings', id);
}

async function refreshPrices({
  accountId,
}: {
  accountId: string;
}): Promise<HoldingWithPrice[] | { error: string }> {
  const holdings = await db.all<HoldingEntity>(
    'SELECT * FROM holdings WHERE account_id = ? AND tombstone = 0',
    [accountId],
  );

  if (holdings.length === 0) return [];

  const symbols = [...new Set(holdings.map(h => h.symbol))];

  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) return { error: 'no-server' };

  let quotes: Array<{
    symbol: string;
    price: number;
    currency: string;
    name: string;
  }> = [];

  try {
    const result = await post(
      serverConfig.YAHOO_SERVER + '/quote',
      { symbols },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    quotes = result?.quotes ?? [];
  } catch {
    return { error: 'fetch-failed' };
  }

  const now = new Date().toISOString();
  const priceMap = new Map<string, number>();

  for (const q of quotes) {
    await db.run(
      'INSERT OR REPLACE INTO price_cache (symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?)',
      [q.symbol, q.price, q.currency ?? 'USD', now],
    );
    priceMap.set(q.symbol, q.price);
  }

  const portfolioValueFloat = holdings.reduce((sum, h) => {
    const price = priceMap.get(h.symbol) ?? 0;
    return sum + h.shares * price;
  }, 0);
  const portfolioValueInt = Math.round(portfolioValueFloat * 100);

  const nonAdjResult = await db.first<{ total: number | null }>(
    `SELECT sum(amount) as total FROM transactions
     WHERE acct = ? AND tombstone = 0 AND (notes IS NULL OR notes != '__investment_value_adjustment__')`,
    [accountId],
  );
  const nonAdjTotal = nonAdjResult?.total ?? 0;

  const existingAdj = await db.first<{ id: string; amount: number }>(
    `SELECT id, amount FROM transactions
     WHERE acct = ? AND tombstone = 0 AND notes = '__investment_value_adjustment__'`,
    [accountId],
  );

  const newAdjAmount = portfolioValueInt - nonAdjTotal;

  if (existingAdj) {
    if (existingAdj.amount !== newAdjAmount) {
      await db.updateTransaction({ id: existingAdj.id, amount: newAdjAmount });
    }
  } else if (newAdjAmount !== 0) {
    await db.insertTransaction({
      account: accountId,
      amount: newAdjAmount,
      date: monthUtils.currentDay(),
      notes: '__investment_value_adjustment__',
      cleared: true,
    });
  }

  return holdings.map(h => ({
    ...h,
    current_price: priceMap.get(h.symbol) ?? null,
    price_fetched_at: priceMap.has(h.symbol) ? now : null,
  }));
}

async function refreshAllPrices(): Promise<{
  fetched_at: string;
  symbols_updated: number;
  snapshots_updated: number;
  error?: string;
}> {
  const accounts = await db.all<{ id: string }>(
    `SELECT id FROM accounts WHERE type = 'investment' AND tombstone = 0 AND closed = 0`,
  );
  if (accounts.length === 0) {
    return {
      fetched_at: new Date().toISOString(),
      symbols_updated: 0,
      snapshots_updated: 0,
    };
  }

  const holdings = await db.all<HoldingEntity>(
    `SELECT * FROM holdings
     WHERE tombstone = 0
       AND account_id IN (${accounts.map(() => '?').join(',')})`,
    accounts.map(a => a.id),
  );

  if (holdings.length === 0) {
    return {
      fetched_at: new Date().toISOString(),
      symbols_updated: 0,
      snapshots_updated: 0,
    };
  }

  const symbols = [...new Set(holdings.map(h => h.symbol))];

  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return {
      fetched_at: new Date().toISOString(),
      symbols_updated: 0,
      snapshots_updated: 0,
      error: 'unauthorized',
    };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    return {
      fetched_at: new Date().toISOString(),
      symbols_updated: 0,
      snapshots_updated: 0,
      error: 'no-server',
    };
  }

  let quotes: Array<{
    symbol: string;
    price: number;
    currency: string;
    name: string;
  }> = [];

  try {
    const result = await post(
      serverConfig.YAHOO_SERVER + '/quote',
      { symbols },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    quotes = result?.quotes ?? [];
  } catch {
    return {
      fetched_at: new Date().toISOString(),
      symbols_updated: 0,
      snapshots_updated: 0,
      error: 'fetch-failed',
    };
  }

  const now = new Date().toISOString();
  const today = monthUtils.currentDay();
  const priceMap = new Map<string, number>();

  for (const q of quotes) {
    await db.run(
      'INSERT OR REPLACE INTO price_cache (symbol, price, currency, fetched_at) VALUES (?, ?, ?, ?)',
      [q.symbol, q.price, q.currency ?? 'USD', now],
    );
    priceMap.set(q.symbol, q.price);
  }

  let snapshotsUpdated = 0;
  await batchMessages(async () => {
    for (const account of accounts) {
      const accountHoldings = holdings.filter(h => h.account_id === account.id);
      if (accountHoldings.length === 0) continue;

      const valueFloat = accountHoldings.reduce((sum, h) => {
        const price = priceMap.get(h.symbol) ?? 0;
        return sum + h.shares * price;
      }, 0);
      const valueInt = Math.round(valueFloat * 100);

      const existing = await db.first<{ id: string; balance: number }>(
        'SELECT id, balance FROM balance_history WHERE account_id = ? AND date = ? AND tombstone = 0',
        [account.id, today],
      );

      if (existing) {
        if (existing.balance !== valueInt) {
          await db.update('balance_history', {
            id: existing.id,
            balance: valueInt,
          });
          snapshotsUpdated++;
        }
      } else {
        await db.insertWithUUID('balance_history', {
          account_id: account.id,
          date: today,
          balance: valueInt,
          tombstone: 0,
        });
        snapshotsUpdated++;
      }
    }
  });

  return {
    fetched_at: now,
    symbols_updated: priceMap.size,
    snapshots_updated: snapshotsUpdated,
  };
}

const DAILY_SNAPSHOT_KEY = 'investments-last-snapshot-date';

/**
 * Called once per budget load. If we haven't taken a price snapshot today,
 * refresh all investment prices (which writes balance_history). Fire-and-forget
 * so it never blocks app startup.
 */
export async function maybeDailySnapshot(): Promise<void> {
  const today = monthUtils.currentDay();
  const last = await asyncStorage.getItem(DAILY_SNAPSHOT_KEY);
  if (last === today) return;

  const result = await refreshAllPrices();
  if (!('error' in result) || result.error === undefined) {
    await asyncStorage.setItem(DAILY_SNAPSHOT_KEY, today);
  }
}

async function fetchYahooChart({
  symbol,
  range = '1y',
}: {
  symbol: string;
  range?: string;
}): Promise<{ timestamps: number[]; closes: number[] } | null> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return null;

  const serverConfig = getServer();
  if (!serverConfig) return null;

  try {
    const result = await post(
      serverConfig.YAHOO_SERVER + '/chart',
      { symbol, range },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result ?? null;
  } catch {
    return null;
  }
}
