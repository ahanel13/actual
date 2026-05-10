// @ts-strict-ignore
import { stringify as csvStringify } from 'csv-stringify/sync';
import { v4 as uuidv4 } from 'uuid';

import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
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
    await db.run(
      'UPDATE balance_history SET balance = ? WHERE id = ?',
      [snapshot.balance, existing.id],
    );
    return existing.id;
  }

  const id = uuidv4();
  await db.run(
    'INSERT INTO balance_history (id, account_id, date, balance, tombstone) VALUES (?, ?, ?, ?, 0)',
    [id, snapshot.account_id, snapshot.date, snapshot.balance],
  );
  return id;
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

  params.push(snapshot.id);
  await db.run(
    `UPDATE balance_history SET ${fields.join(', ')} WHERE id = ?`,
    params,
  );
}

async function deleteSnapshot({ id }: { id: string }): Promise<void> {
  await db.run('UPDATE balance_history SET tombstone = 1 WHERE id = ?', [id]);
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

  for (const row of rows) {
    const existing = await db.first<{ id: string }>(
      'SELECT id FROM balance_history WHERE account_id = ? AND date = ? AND tombstone = 0',
      [accountId, row.date],
    );

    if (existing) {
      await db.run(
        'UPDATE balance_history SET balance = ? WHERE id = ?',
        [row.balance, existing.id],
      );
      updated++;
    } else {
      const id = uuidv4();
      await db.run(
        'INSERT INTO balance_history (id, account_id, date, balance, tombstone) VALUES (?, ?, ?, ?, 0)',
        [id, accountId, row.date, row.balance],
      );
      inserted++;
    }
  }

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
