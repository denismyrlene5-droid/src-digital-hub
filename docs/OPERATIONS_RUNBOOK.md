# Operations runbook

## Start, restart and health

```powershell
npm ci --omit=dev
npm start
Invoke-RestMethod https://<environment-host>/health
```

Run behind an HTTPS reverse proxy/process supervisor. A healthy response reports only application, database and storage status. Restarting invalidates in-memory administrator sessions; communicate planned restarts.

## Daily checks

1. Check health, HTTP error rate, response latency, disk/object-storage capacity and upload failures.
2. Review failed admin logins, permission denials and critical audit actions.
3. Review Awards reconciliation: pending, failed, cancelled, expired, reversed/refunded, verification failures, amount mismatches and verified-uncredited records.
4. Confirm the latest database/media backup and scheduled restore-test status.

## Pause and resume voting

Use Awards administration to set voting state to `paused`. This rejects new initiation server-side without deleting existing votes or transactions. Keep signed webhooks and verification available for already-started payments. Record the incident/change reference in the operational log. Resume only after reconciling pending payments; the state change is audit-logged.

`MAINTENANCE_MODE=true` is the deployment-level emergency guard for new payment initiation. It requires a restart and should not replace the audited voting-state control for ordinary operations.

## Payment failure/uncredited workflow

Search by public reference. Check local expected amount/currency/provider state. Query Paystack through the existing server verification path. Never credit from a screenshot, redirect, or webhook body alone. Escalate amount mismatches, duplicate provider references and verified-uncredited records to the financial owner.

## Refund/reversal workflow

The application does not initiate Paystack refunds. First complete and verify the external action in the provider dashboard under approved institutional policy. A Super Admin may then call the protected adjustment workflow with exact local reference, provider reference, action, confirmation, and a meaningful reason. The database atomically removes the original transaction's votes once, prevents negative totals/double adjustment, retains history, and writes an audit record.

## Backup and restore

```powershell
npm run backup -- <protected-backup-directory>
npm run verify-backup -- <protected-backup-directory>
```

Follow `BACKUP_AND_RECOVERY.md`; never restore directly over active payment data.

## Provider outage

Pause new voting, retain transaction references, keep webhook/verification endpoints available, show students a pending/retry message, monitor official provider status, and reconcile before reopening. Never mark a payment successful locally to work around an outage.

## Suspicious login or credential rotation

Pause affected operations, rotate the role secret in the environment secret store, restart to invalidate sessions, review audit/security logs, verify content and payment changes, then document the incident. Rotate Paystack credentials in the provider dashboard and secret store together; keep payment mode disabled until a signed webhook and verification test pass.

## Monitoring thresholds

- Page immediately: health failure for 2 minutes, database errors, any verified-uncredited payment, amount mismatch, live secret exposure, or vote-ledger integrity mismatch.
- Warn: HTTP 5xx above 2% for 5 minutes, p95 response time above 2 seconds for 10 minutes, more than 5 webhook signature failures in 5 minutes, more than 10 admin login failures per IP in 15 minutes, more than 20 pending payments older than 10 minutes, or storage above 80%.
- Critical: storage above 90%, backup older than 30 minutes during paid voting, or no successful daily complete backup.

Integrate any reputable error-monitoring vendor at the Express error middleware. Redact passwords, secrets, cookies, authorization headers, payer details, private feedback text/attachments and internal notes before export.
