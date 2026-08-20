# Rollback plan

## Principle

Application rollback and data rollback are separate decisions. Never casually roll back SQLite transaction/voting data. Preserve verified payments, vote ledger entries, adjustments, refunds/reversals, and audit logs.

## Application rollback

1. Pause new voting through the audited Awards setting; keep webhook and verification processing available.
2. Create and verify a current database/media backup.
3. Identify the last signed-off application version and its compatible migration level.
4. Deploy the previous application artifact without replacing the current database.
5. Run `/health`, role checks, public smoke tests, and payment reconciliation.
6. If the old application cannot understand the current schema/statuses, do not proceed; deploy a forward fix instead.

## Database rollback

Database rollback requires incident-lead, database-owner, and financial-owner approval. Restore only to a new path first. Compare the restore timestamp with provider transactions and current audit/adjustment records. Reconstruct and verify any later payment events before switching. Keep the original database and WAL files read-only for investigation.

The additive Prompt 6 and Prompt 7 migrations do not drop columns or transaction history. SQLite cannot remove these additions safely with a casual down migration; rollback is therefore application-forward or restore-and-reconcile, not destructive schema reversal.
