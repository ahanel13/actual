import createDebug from 'debug';

import { getAccountDb } from '#account-db';
import {
  decryptValue,
  encryptedSecretsService,
} from '#services/encrypted-secrets-service';

import { plaidService } from './plaid-service.js';

const debug = createDebug('actual:plaid-scheduled-sync');

const DEFAULT_INTERVAL_HOURS = 6;

export const ITEM_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'ITEM_LOCKED',
  'PENDING_EXPIRATION',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'USER_SETUP_REQUIRED',
  'INSUFFICIENT_CREDENTIALS',
  'NO_AUTH_ACCOUNTS',
  'INSTITUTION_DOWN',
]);

export function extractPlaidErrorCode(err) {
  return err?.response?.data?.error_code ?? null;
}

/**
 * Pull deltas from Plaid for the given item and enqueue them in
 * plaid_pending_transactions. Advances the cursor and clears stored error
 * state on success; records the error_code on failure.
 */
export async function runSyncForItem(itemId) {
  const db = getAccountDb();
  const row = db.first(
    `SELECT access_token_encrypted, cursor FROM plaid_items WHERE item_id = ?`,
    [itemId],
  );
  if (!row?.access_token_encrypted) {
    return { ok: false, reason: 'unknown item_id' };
  }

  let accessToken;
  try {
    accessToken = decryptValue(row.access_token_encrypted);
  } catch (e) {
    return { ok: false, reason: 'decryption failed: ' + (e?.message ?? e) };
  }

  let result;
  try {
    result = await plaidService.syncTransactions(accessToken, row.cursor);
  } catch (e) {
    const code = extractPlaidErrorCode(e);
    if (code && ITEM_ERROR_CODES.has(code)) {
      db.mutate(`UPDATE plaid_items SET error_code = ? WHERE item_id = ?`, [
        code,
        itemId,
      ]);
    }
    return { ok: false, reason: e?.message ?? String(e), error_code: code };
  }

  const now = Date.now();

  // Enqueue added + modified
  for (const tx of result.added.concat(result.modified)) {
    db.mutate(
      `INSERT OR REPLACE INTO plaid_pending_transactions
         (transaction_id, item_id, account_id, payload, is_removed, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [tx.transaction_id, itemId, tx.account_id, JSON.stringify(tx), now],
    );
  }
  // Enqueue removed (account_id unknown for removed; we still record)
  for (const r of result.removed) {
    db.mutate(
      `INSERT OR REPLACE INTO plaid_pending_transactions
         (transaction_id, item_id, account_id, payload, is_removed, created_at)
       VALUES (?, ?, '', ?, 1, ?)`,
      [r.transaction_id, itemId, JSON.stringify(r), now],
    );
  }

  db.mutate(
    `UPDATE plaid_items SET cursor = ?, last_synced_at = ?, error_code = NULL WHERE item_id = ?`,
    [result.next_cursor, now, itemId],
  );

  return {
    ok: true,
    added: result.added.length,
    modified: result.modified.length,
    removed: result.removed.length,
  };
}

export async function runSyncForAllItems() {
  const db = getAccountDb();
  const rows = db.all(`SELECT item_id FROM plaid_items`);
  const results = [];
  for (const row of rows) {
    try {
      const res = await runSyncForItem(row.item_id);
      results.push({ item_id: row.item_id, ...res });
    } catch (e) {
      results.push({
        item_id: row.item_id,
        ok: false,
        reason: e?.message ?? String(e),
      });
    }
  }
  return results;
}

let _scheduleHandle = null;

export function startScheduledSync() {
  if (_scheduleHandle) return; // idempotent

  // Skip if Plaid is not configured — avoids constructing the client and
  // throwing on every tick.
  function isConfigured() {
    try {
      return (
        encryptedSecretsService.exists('plaid_clientId') &&
        encryptedSecretsService.exists('plaid_clientSecret')
      );
    } catch {
      return false;
    }
  }

  const hoursRaw = process.env.ACTUAL_PLAID_SYNC_INTERVAL_HOURS;
  const hours =
    hoursRaw != null ? parseFloat(hoursRaw) : DEFAULT_INTERVAL_HOURS;
  if (!Number.isFinite(hours) || hours <= 0) {
    debug(
      'Scheduled Plaid sync disabled (ACTUAL_PLAID_SYNC_INTERVAL_HOURS=' +
        hoursRaw +
        ')',
    );
    return;
  }

  const intervalMs = Math.floor(hours * 60 * 60 * 1000);
  debug('Scheduling Plaid sync every ' + hours + ' hours');

  async function tick() {
    if (!isConfigured()) {
      debug('Plaid not configured — skipping tick');
      return;
    }
    try {
      const results = await runSyncForAllItems();
      debug('Plaid scheduled tick complete: ' + JSON.stringify(results));
    } catch (e) {
      debug('Plaid scheduled tick failed: ' + (e?.message ?? e));
    }
  }

  _scheduleHandle = setInterval(() => {
    void tick();
  }, intervalMs);
  // Don't keep the process alive just for this.
  if (typeof _scheduleHandle.unref === 'function') _scheduleHandle.unref();
}

export function stopScheduledSync() {
  if (_scheduleHandle) {
    clearInterval(_scheduleHandle);
    _scheduleHandle = null;
  }
}
