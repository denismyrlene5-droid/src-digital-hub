# Incident response

## General procedure

For every incident: assign an incident lead, preserve timestamps and transaction references, avoid exposing private feedback/payment data, pause risky operations, maintain an action log, communicate factual status, restore from verified evidence, and complete a post-incident review.

| Scenario | Detection | Immediate containment | Investigation and recovery | Communication/post-review |
|---|---|---|---|---|
| Site unavailable | Health alert or failed synthetic check | Keep payment webhook path reachable if possible; set maintenance mode during controlled restart | Check process, database health, storage, recent release and provider status; roll back application only when safe | Status update without secrets; document duration and cause |
| Database unavailable/corrupt | `/health` degraded, SQLite errors | Pause voting and public mutations; preserve database/WAL files | Take forensic copy, run integrity checks, restore to a separate path, reconcile post-backup payments | Notify leadership and affected operators; record recovery point |
| Provider outage | Initialization/verification failures or pending spike | Stop new payment initiation by pausing voting; keep verification/webhooks available | Monitor official provider status; retain references; re-verify pending payments after recovery | Tell students not to retry repeatedly; reconcile before reopening |
| Paid but votes not credited | Verified-uncredited alert/student reference | Do not manually increment totals | Verify provider server-side, amount, currency, metadata and uniqueness; use reviewed reconciliation | Confirm outcome using public reference only; document action |
| Duplicate webhook storm | Duplicate-callback rate alert | Rate-limit at edge without blocking legitimate signed events | Confirm signature failures versus legitimate retries; verify one ledger row per reference | Escalate to provider if needed; review capacity and thresholds |
| Suspicious admin account | Login/authorization alerts or unusual audit action | Rotate affected role secret, invalidate sessions by restart, pause sensitive mutations | Review access/audit logs and all changes; restore content only from trusted history | Notify authorized leadership; require new unique credential and MFA path |
| Exposed payment credential | Secret scan/provider alert | Revoke/rotate credential immediately, disable provider mode, pause voting | Identify exposure window, Git history and provider activity; replace secret-store value | Treat source deletion as insufficient; document history cleanup |
| Vote integrity concern | Ledger/total mismatch | Pause voting; preserve database and logs | Compare verified payments, ledger, adjustments and nominee totals; avoid arbitrary edits | Publish only verified findings; obtain independent sign-off |
| Malicious upload | Scanner/moderator alert | Quarantine object and revoke public access | Inspect metadata, related account/submission and access logs; scan remaining objects | Notify affected users only when needed; update validation controls |

## Emergency contacts and evidence

Before launch, assign named owners for application, database/backups, Paystack, SRC communications, and data protection. Store contact details outside the repository. Evidence exports must be access-controlled and must exclude passwords, secret keys, session tokens, full private feedback, and unnecessary payer information.
