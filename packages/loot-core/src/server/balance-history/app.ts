// @ts-strict-ignore
import { stringify as csvStringify } from 'csv-stringify/sync';

import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import type { BalanceHistoryEntity } from '#types/models';

export type BalanceHistoryHandlers = {
  'balance-history-get': typeof getBalanceHistory;
  'balance-history-create': typeof createSnapshot;
  'balance-history-update': typeof updateSnapshot;
  'balance-history-delete': typeof deleteSnapshot;
  'balance-history-import': typeof importSnapshots;
  'balance-history-export': typeof exportSnapshots;
};

export const app = createApp<BalanceHistoryHandlers>();
app.method('balance-history-get', getBalanceHistory);
app.method('balance-history-create', mutator(createSnapshot));
app.method('balance-history-update', mutator(updateSnapshot));
app.method('balance-history-delete', mutator(deleteSnapshot));
app.method('balance-history-import', mutator(importSnapshots));
app.method('balance-history-export', exportSnapshots);

async function getBalanceHistory({
  accountId,
  startDate,
  endDate,
}: {
  accountId: string;
  startDate?: string;
  endDate?: string;
}): Promise<BalanceHistoryEntity[]> {
  let sql =
    'SELECT * FROM balance_history WHERE account_id = ? AND tombstone = 0';
  const params: (string | number)[] = [accountId];

  if (startDate) {
    sql += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date <= ?';
    params.push(endDate);
  }

  sql += ' ORDER BY date ASC';
  return db.all<BalanceHistoryEntity>(sql, params);
}

async function createSnapshot(
  snapshot: Omit<BalanceHistoryEntity, 'id'>,
): Promise<string> {
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM balance_history WHERE account_id = ? AND date = ? AND tombstone = 0',
    [snapshot.account_id, snapshot.date],
  );

  if (existing) {
    await db.update('balance_history', {
      id: existing.id,
      balance: snapshot.balance,
    });
    return existing.id;
  }

  return db.insertWithUUID('balance_history', {
    account_id: snapshot.account_id,
    date: snapshot.date,
    balance: snapshot.balance,
    tombstone: 0,
  });
}

async function updateSnapshot(
  snapshot: Partial<BalanceHistoryEntity> & { id: string },
): Promise<void> {
  const fields: string[] = [];
  const params: (string | number)[] = [];

  if (snapshot.date !== undefined) {
    fields.push('date = ?');
    params.push(snapshot.date);
  }
  if (snapshot.balance !== undefined) {
    fields.push('balance = ?');
    params.push(snapshot.balance);
  }

  if (fields.length === 0) return;

  const patch: Record<string, string | number> = { id: snapshot.id };
  if (snapshot.date !== undefined) patch.date = snapshot.date;
  if (snapshot.balance !== undefined) patch.balance = snapshot.balance;
  await db.update('balance_history', patch);
}

async function deleteSnapshot({ id }: { id: string }): Promise<void> {
  await db.delete_('balance_history', id);
}

async function importSnapshots({
  accountId,
  rows,
}: {
  accountId: string;
  rows: Array<{ date: string; balance: number }>;
}): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  await batchMessages(async () => {
    for (const row of rows) {
      const existing = await db.first<{ id: string }>(
        'SELECT id FROM balance_history WHERE account_id = ? AND date = ? AND tombstone = 0',
        [accountId, row.date],
      );

      if (existing) {
        await db.update('balance_history', {
          id: existing.id,
          balance: row.balance,
        });
        updated++;
      } else {
        await db.insertWithUUID('balance_history', {
          account_id: accountId,
          date: row.date,
          balance: row.balance,
          tombstone: 0,
        });
        inserted++;
      }
    }
  });

  return { inserted, updated };
}

async function exportSnapshots({
  accountId,
}: {
  accountId: string;
}): Promise<string> {
  const snapshots = await db.all<BalanceHistoryEntity>(
    'SELECT * FROM balance_history WHERE account_id = ? AND tombstone = 0 ORDER BY date ASC',
    [accountId],
  );

  const account = await db.first<{ name: string }>(
    'SELECT name FROM accounts WHERE id = ?',
    [accountId],
  );

  const accountName = account?.name ?? accountId;

  const rows = snapshots.map(s => [
    s.date,
    (s.balance / 100).toFixed(2),
    accountName,
  ]);

  return csvStringify([['Date', 'Balance', 'Account'], ...rows]);
}
