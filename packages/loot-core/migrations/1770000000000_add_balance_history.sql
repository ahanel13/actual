BEGIN TRANSACTION;

-- CRDT sync inserts column-by-column: the first message for a new row creates
-- it with only (id, X). NOT NULL columns without DEFAULT reject that insert.
-- account_id, date and balance must be nullable so CRDT row creation can
-- stage across messages.
CREATE TABLE IF NOT EXISTS balance_history (
  id         TEXT    NOT NULL PRIMARY KEY,
  account_id TEXT,
  date       TEXT,
  balance    INTEGER,
  tombstone  INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_balance_history_account_date
  ON balance_history(account_id, date)
  WHERE tombstone = 0;

COMMIT;
