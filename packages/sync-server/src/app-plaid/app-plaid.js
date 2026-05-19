import express from 'express';

import { getAccountDb } from '#account-db';
import { handleError } from '#app-gocardless/util/handle-error';
import {
  decryptValue,
  encryptedSecretsService,
  encryptValue,
} from '#services/encrypted-secrets-service';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

import { runSyncForAllItems, runSyncForItem } from './plaid-scheduled-sync.js';
import { plaidService } from './plaid-service.js';

const app = express();
export { app as handlers };
app.use(requestLoggerMiddleware);
app.use(express.json());
app.use(validateSessionMiddleware);

function extractPlaidError(err) {
  const data = err?.response?.data;
  if (data) {
    return {
      error_code: data.error_code ?? null,
      error_type: data.error_type ?? null,
      error_message: data.error_message ?? data.display_message ?? null,
      request_id: data.request_id ?? null,
    };
  }
  return { error_message: err?.message || String(err) };
}

function scrubError(err) {
  if (!err) return 'unknown error';
  const plaid = extractPlaidError(err);
  return plaid.error_message || 'unknown error';
}

function sendPlaidError(res, err, fallbackStatus = 500) {
  const plaid = extractPlaidError(err);
  const status =
    plaid.error_code === 'INVALID_API_KEYS'
      ? 401
      : plaid.error_code === 'ITEM_LOGIN_REQUIRED'
        ? 409
        : plaid.error_code === 'RATE_LIMIT_EXCEEDED'
          ? 429
          : fallbackStatus;
  res.status(status).send({
    status: 'error',
    reason: plaid.error_message || 'Plaid request failed',
    error_code: plaid.error_code,
    error_type: plaid.error_type,
    request_id: plaid.request_id,
  });
}

const ITEM_ERROR_CODES = new Set([
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

function persistItemErrorIfRelevant(itemId, err) {
  if (!itemId) return;
  const plaid = extractPlaidError(err);
  if (!plaid.error_code) return;
  if (!ITEM_ERROR_CODES.has(plaid.error_code)) return;
  try {
    getAccountDb().mutate(
      `UPDATE plaid_items SET error_code = ? WHERE item_id = ?`,
      [plaid.error_code, itemId],
    );
  } catch {
    // best-effort
  }
}

function clearItemError(itemId) {
  if (!itemId) return;
  try {
    getAccountDb().mutate(
      `UPDATE plaid_items SET error_code = NULL WHERE item_id = ?`,
      [itemId],
    );
  } catch {
    // best-effort
  }
}


app.post(
  '/status',
  handleError(async (req, res) => {
    let configured = false;
    try {
      configured =
        encryptedSecretsService.exists('plaid_clientId') &&
        encryptedSecretsService.exists('plaid_clientSecret');
    } catch {
      configured = false;
    }
    res.send({ status: 'ok', data: { configured } });
  }),
);

app.post(
  '/set-credentials',
  handleError(async (req, res) => {
    const { clientId, secret } = req.body || {};
    if (!clientId || !secret) {
      res.status(400).send({
        status: 'error',
        reason: 'clientId and secret are required',
      });
      return;
    }
    try {
      encryptedSecretsService.set('plaid_clientId', clientId);
      encryptedSecretsService.set('plaid_clientSecret', secret);
      res.send({ status: 'ok' });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

app.post(
  '/create-link-token',
  handleError(async (req, res) => {
    const { userId, item_id } = req.body || {};
    try {
      let accessToken;
      if (item_id) {
        accessToken = loadAccessToken(item_id);
        if (!accessToken) {
          res
            .status(404)
            .send({ status: 'error', reason: 'Unknown Plaid item_id' });
          return;
        }
      }
      const linkToken = await plaidService.createLinkToken({
        userId,
        accessToken,
      });
      res.send({ status: 'ok', data: { link_token: linkToken } });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

// In update mode, no public-token exchange happens — the existing access_token
// is silently reused. We just clear any stored error state.
app.post(
  '/mark-item-reauthed',
  handleError(async (req, res) => {
    const { item_id } = req.body || {};
    if (!item_id) {
      res.status(400).send({ status: 'error', reason: 'item_id is required' });
      return;
    }
    clearItemError(item_id);
    res.send({ status: 'ok' });
  }),
);

// Lookup for the UI — never returns access_token.
app.post(
  '/get-items',
  handleError(async (req, res) => {
    try {
      const db = getAccountDb();
      const rows = db.all(
        `SELECT item_id, institution_id, institution_name, institution_logo,
                institution_url, cursor, last_synced_at, error_code
         FROM plaid_items`,
      );

      // Backfill logo for any existing rows that don't have one yet
      for (const row of rows) {
        if (!row.institution_logo && row.institution_id) {
          const inst = await plaidService.getInstitution(row.institution_id);
          if (inst?.logo) {
            db.mutate(
              `UPDATE plaid_items SET institution_logo = ?, institution_url = ? WHERE item_id = ?`,
              [inst.logo, inst.url ?? null, row.item_id],
            );
            row.institution_logo = inst.logo;
            row.institution_url = inst.url ?? null;
          }
        }
      }

      res.send({
        status: 'ok',
        data: { items: rows },
      });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

app.post(
  '/exchange-public-token',
  handleError(async (req, res) => {
    const { publicToken } = req.body || {};
    if (!publicToken) {
      res.status(400).send({
        status: 'error',
        reason: 'publicToken is required',
      });
      return;
    }
    try {
      const { access_token, item_id } =
        await plaidService.exchangePublicToken(publicToken);
      const { accounts, item } = await plaidService.getAccounts(access_token);
      const institution = await plaidService.getInstitution(
        item?.institution_id,
      );

      const db = getAccountDb();
      db.mutate(
        `INSERT OR REPLACE INTO plaid_items
           (item_id, access_token_encrypted, institution_id, institution_name,
            institution_logo, institution_url, cursor, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
        [
          item_id,
          encryptValue(access_token),
          institution?.institution_id ?? null,
          institution?.name ?? null,
          institution?.logo ?? null,
          institution?.url ?? null,
        ],
      );

      res.send({
        status: 'ok',
        data: {
          item_id,
          accounts,
          institution: institution ?? { institution_id: null, name: null },
        },
      });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

function loadAccessToken(itemId) {
  const row = getAccountDb().first(
    `SELECT access_token_encrypted FROM plaid_items WHERE item_id = ?`,
    [itemId],
  );
  if (!row?.access_token_encrypted) return null;
  return decryptValue(row.access_token_encrypted);
}

app.post(
  '/accounts',
  handleError(async (req, res) => {
    const { item_id } = req.body || {};
    if (!item_id) {
      res.status(400).send({ status: 'error', reason: 'item_id is required' });
      return;
    }
    try {
      const accessToken = loadAccessToken(item_id);
      if (!accessToken) {
        res
          .status(404)
          .send({ status: 'error', reason: 'Unknown Plaid item_id' });
        return;
      }
      const { accounts } = await plaidService.getAccounts(accessToken);
      clearItemError(item_id);
      res.send({ status: 'ok', data: { accounts } });
    } catch (e) {
      persistItemErrorIfRelevant(item_id, e);
      sendPlaidError(res, e);
    }
  }),
);

function toSimpleFinShape(plaidTx) {
  const dateMs = plaidTx.date ? Date.parse(plaidTx.date) : Date.now();
  return {
    booked: !plaidTx.pending,
    sortOrder: Math.floor(dateMs / 1000),
    date: plaidTx.date,
    payeeName: plaidTx.name,
    notes: plaidTx.name,
    transactionAmount: {
      amount: plaidTx.amount.toFixed(2),
      currency: plaidTx.iso_currency_code || 'USD',
    },
    transactionId: plaidTx.transaction_id,
    postedDate: plaidTx.date,
    valueDate: plaidTx.date,
  };
}

app.post(
  '/transactions',
  handleError(async (req, res) => {
    const { item_id, accountId } = req.body || {};
    if (!item_id) {
      res.status(400).send({ status: 'error', reason: 'item_id is required' });
      return;
    }
    try {
      const db = getAccountDb();

      // Pull anything new from Plaid into the queue (advances cursor).
      // Failure here doesn't abort — we may still have queued data from the
      // scheduled job.
      const syncResult = await runSyncForItem(item_id);
      if (!syncResult.ok && syncResult.error_code) {
        // Surface item-error states (e.g. ITEM_LOGIN_REQUIRED) so the client
        // can prompt re-auth. Persistence already happened in runSyncForItem.
      }

      // Read + drain queued deltas for the requested account.
      const queued = db.all(
        `SELECT transaction_id, payload, is_removed FROM plaid_pending_transactions
         WHERE item_id = ? AND (account_id = ? OR is_removed = 1)`,
        [item_id, accountId ?? ''],
      );
      const ids = queued.map(r => r.transaction_id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        db.mutate(
          `DELETE FROM plaid_pending_transactions WHERE transaction_id IN (${placeholders})`,
          ids,
        );
      }

      const filterByAccount = accountId
        ? t => t.account_id === accountId
        : () => true;

      const added = queued
        .filter(r => r.is_removed === 0)
        .map(r => JSON.parse(r.payload))
        .filter(filterByAccount);

      const sfShape = added.map(toSimpleFinShape);
      const booked = sfShape
        .filter(t => t.booked)
        .sort((a, b) => b.sortOrder - a.sortOrder);
      const pending = sfShape
        .filter(t => !t.booked)
        .sort((a, b) => b.sortOrder - a.sortOrder);
      const all = sfShape.sort((a, b) => b.sortOrder - a.sortOrder);

      let accountBalance = [];
      let startingBalance = 0;
      try {
        const row = db.first(
          `SELECT access_token_encrypted FROM plaid_items WHERE item_id = ?`,
          [item_id],
        );
        if (row?.access_token_encrypted) {
          const { accounts } = await plaidService.getAccounts(
            decryptValue(row.access_token_encrypted),
          );
          const target = accountId
            ? accounts.find(a => a.account_id === accountId)
            : null;
          if (target) {
            startingBalance = Math.round((target.balance_current ?? 0) * 100);
            accountBalance = [
              {
                balanceAmount: {
                  amount: (target.balance_current ?? 0).toFixed(2),
                  currency: target.iso_currency_code || 'USD',
                },
              },
            ];
          }
        }
      } catch {
        // balance fetch is best-effort
      }

      res.send({
        status: 'ok',
        data: {
          balances: accountBalance,
          startingBalance,
          transactions: { all, booked, pending },
        },
      });
    } catch (e) {
      persistItemErrorIfRelevant(item_id, e);
      sendPlaidError(res, e);
    }
  }),
);

app.post(
  '/sync-now',
  handleError(async (req, res) => {
    const { item_id } = req.body || {};
    try {
      const results = item_id
        ? [await runSyncForItem(item_id).then(r => ({ item_id, ...r }))]
        : await runSyncForAllItems();
      res.send({ status: 'ok', data: { results } });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

// Hard reset — releases every Plaid Item upstream and wipes local state.
// Used by the "Disconnect Plaid" affordance in settings.
app.post(
  '/reset',
  handleError(async (req, res) => {
    try {
      const db = getAccountDb();
      const rows = db.all(
        `SELECT item_id, access_token_encrypted FROM plaid_items`,
      );
      for (const row of rows) {
        try {
          const accessToken = decryptValue(row.access_token_encrypted);
          await plaidService.removeItem(accessToken);
        } catch {
          // Continue even if Plaid rejects (already removed, etc.)
        }
      }
      db.mutate(`DELETE FROM plaid_items`);
      encryptedSecretsService.delete('plaid_clientId');
      encryptedSecretsService.delete('plaid_clientSecret');
      res.send({ status: 'ok', data: { removed: rows.length } });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);

app.post(
  '/remove-account',
  handleError(async (req, res) => {
    const { item_id } = req.body || {};
    if (!item_id) {
      res.status(400).send({ status: 'error', reason: 'item_id is required' });
      return;
    }
    try {
      const accessToken = loadAccessToken(item_id);
      if (accessToken) {
        try {
          await plaidService.removeItem(accessToken);
        } catch {
          // Continue with local deletion even if Plaid rejects (e.g. already removed)
        }
      }
      getAccountDb().mutate(`DELETE FROM plaid_items WHERE item_id = ?`, [
        item_id,
      ]);
      res.send({ status: 'ok' });
    } catch (e) {
      sendPlaidError(res, e);
    }
  }),
);
