import { getAccountDb } from '../src/account-db';

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS plaid_pending_transactions (
      transaction_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      is_removed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plaid_pending_account
      ON plaid_pending_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_plaid_pending_item
      ON plaid_pending_transactions(item_id);
  `);
};

export const down = async function () {
  await getAccountDb().exec(`
    DROP INDEX IF EXISTS idx_plaid_pending_item;
    DROP INDEX IF EXISTS idx_plaid_pending_account;
    DROP TABLE IF EXISTS plaid_pending_transactions;
  `);
};
