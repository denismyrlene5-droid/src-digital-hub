# Backup and recovery

## Scope and policy

Back up the SQLite database and persistent upload store together. The database includes roles/configuration, Awards settings, categories, nominees, transactions, vote ledger, adjustments, announcements, events, feedback, businesses, Lost & Found, media metadata, executives, site settings, and audit logs. The upload store contains approved and restricted files referenced by those records.

Recommended production schedule:

- Encrypted database backup every 15 minutes while paid voting is open.
- Daily complete database-and-media recovery point.
- Retain 48 hours of 15-minute points, 30 daily points, and 12 monthly points.
- Store encrypted copies in a separate account/location with least-privilege access, immutability/versioning, and access logging.
- Never write backups under `public/` or a web-served directory.

The included local tool creates a consistent SQLite backup and media copy, checksum manifest, integrity check, and restrictive local permissions. It does not encrypt; production automation must encrypt before off-site transfer.

## Create and verify a backup

```powershell
npm run backup -- C:\secure-backups\src-hub-YYYYMMDD-HHMM
npm run verify-backup -- C:\secure-backups\src-hub-YYYYMMDD-HHMM
```

For Linux hosting, use an equivalent protected absolute directory. Supply `DATABASE_PATH` and `UPLOAD_DIRECTORY` for the target environment. Never back up staging into the production backup set.

## Staged restore test

1. Stop or isolate a staging instance; never overwrite the active production database.
2. Copy the selected backup into a new temporary restore directory.
3. Run `npm run verify-backup -- <backup-directory>`.
4. Set staging-only `DATABASE_PATH` to the restored SQLite file and `UPLOAD_DIRECTORY` to its restored upload folder.
5. Start a disposable staging instance on a non-production URL/port.
6. Verify `/health`, administrator role access, public records, uploaded files, Awards settings, transaction counts, vote-ledger totals, and adjustment history.
7. Compare `nominees.vote_total` with credited ledger votes minus recorded adjustments.
8. Record the restore-test date, backup ID/checksum, operator, results, and deletion of the disposable copy.

## Payment recovery after restore

Never blindly replace newer payment data with an older database. Pause new voting first. Determine the backup timestamp, then reconcile every provider transaction created or updated after it using Paystack's transaction records. Signed provider retries remain idempotent, but a restored database may not know about post-backup references.

For each missing provider-confirmed payment, use a reviewed recovery procedure that reconstructs the original server reference, nominee, vote quantity, stored expected amount, currency, and provider ID before verification. Do not credit based on screenshots or webhook payload alone. Re-run trusted server verification, confirm unique provider reference constraints, and audit every recovery. Reconcile reversals/refunds after successful payments before reopening voting.

## Media storage

Local uploads are suitable only when the host guarantees persistent disks and backups. Ephemeral/container filesystems require managed object storage before production. Preserve random object names, private access for feedback attachments/pending records, content-type validation, retention rules, malware scanning, encryption, and database-to-object consistency.
