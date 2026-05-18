import { getAccountDb } from '../src/account-db';

export const up = async function () {
  await getAccountDb().exec(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      item_id TEXT PRIMARY KEY,
      access_token_encrypted TEXT NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      cursor TEXT,
      last_synced_at INTEGER,
      error_code TEXT
    );
  `);
};

export const down = async function () {
  await getAccountDb().exec(`
    DROP TABLE plaid_items;
  `);
};
