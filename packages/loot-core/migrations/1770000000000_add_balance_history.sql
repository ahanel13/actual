BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS balance_history (
  id         TEXT    NOT NULL PRIMARY KEY,
  account_id TEXT    NOT NULL,
  date       TEXT    NOT NULL,
  balance    INTEGER NOT NULL,
  tombstone  INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_history_account_date
  ON balance_history(account_id, date)
  WHERE tombstone = 0;

COMMIT;
