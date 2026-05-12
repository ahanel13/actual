BEGIN TRANSACTION;

-- CRDT sync inserts column-by-column: the first message for a new row creates
-- it with only (id, X). NOT NULL columns without DEFAULT reject that insert.
-- account_id and symbol must be nullable so CRDT row creation can stage across
-- messages; FOREIGN KEY dropped to match the soft-reference convention used
-- by other CRDT-synced tables (e.g. balance_history.account_id).
CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  symbol TEXT,
  name TEXT,
  shares REAL DEFAULT 0,
  cost_basis_per_share REAL,
  currency TEXT DEFAULT 'USD',
  tombstone INTEGER DEFAULT 0
);

-- price_cache is device-local (not CRDT-synced), so NOT NULL is fine here.
CREATE TABLE price_cache (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fetched_at TEXT NOT NULL
);

COMMIT;
