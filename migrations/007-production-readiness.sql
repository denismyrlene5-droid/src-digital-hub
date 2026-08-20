-- Prompt 7 production-readiness migration.
-- server/awards.js remains the executable idempotent migration source.

CREATE TABLE IF NOT EXISTS payment_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_reference TEXT NOT NULL UNIQUE REFERENCES payments(reference),
  action TEXT NOT NULL CHECK (action IN ('reversed', 'refunded')),
  votes_removed INTEGER NOT NULL CHECK (votes_removed > 0),
  reason TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  source TEXT NOT NULL,
  admin_role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_adjustments_action_created
ON payment_adjustments(action, created_at);
