import { getAccountDb } from '../src/account-db';

export const up = async function () {
  const db = getAccountDb();
  const cols = db.all(`PRAGMA table_info(plaid_items)`).map(c => c.name);
  if (!cols.includes('institution_logo')) {
    db.exec(`ALTER TABLE plaid_items ADD COLUMN institution_logo TEXT`);
  }
  if (!cols.includes('institution_url')) {
    db.exec(`ALTER TABLE plaid_items ADD COLUMN institution_url TEXT`);
  }
};

export const down = async function () {
  // SQLite doesn't support DROP COLUMN easily; leave columns in place
};
