BEGIN TRANSACTION;

CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  shares REAL NOT NULL DEFAULT 0,
  cost_basis_per_share REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  tombstone INTEGER DEFAULT 0,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE TABLE price_cache (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fetched_at TEXT NOT NULL
);

COMMIT;
