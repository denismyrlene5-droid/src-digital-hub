-- Prompt 6 Awards hardening migration (SQLite).
-- server/awards.js applies the compatible column-by-column migration because
-- SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS awards_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  awards_title TEXT NOT NULL DEFAULT 'SRC Awards 2026',
  event_active INTEGER NOT NULL DEFAULT 1,
  voting_state TEXT NOT NULL DEFAULT 'open',
  opens_at TEXT,
  closes_at TEXT,
  price_per_vote INTEGER NOT NULL DEFAULT 100 CHECK (price_per_vote BETWEEN 1 AND 1000000),
  currency TEXT NOT NULL DEFAULT 'GHS',
  public_results_visible INTEGER NOT NULL DEFAULT 1,
  max_votes INTEGER NOT NULL DEFAULT 10000 CHECK (max_votes BETWEEN 1 AND 100000),
  ledger_migrated INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_public_id
ON payments(public_id) WHERE public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_internal_id
ON payments(internal_id) WHERE internal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference
ON payments(provider_reference) WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_status_created
ON payments(payment_status, created_at);

CREATE INDEX IF NOT EXISTS idx_payments_nominee_created
ON payments(nominee_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vote_transactions_nominee
ON vote_transactions(nominee_id);
