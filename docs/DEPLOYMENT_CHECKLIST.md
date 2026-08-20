# Deployment and staging checklist

## Infrastructure

- [ ] Separate staging and production hosts configured
- [ ] Separate SQLite databases on persistent encrypted storage
- [ ] Separate persistent upload/object stores
- [ ] Staging and production domains configured
- [ ] HTTPS active; proxy forwards protocol correctly
- [ ] Webhook endpoint publicly reachable over HTTPS
- [ ] Central logs, metrics and alert routing configured

## Environment

- [ ] `APP_ENV` is correct
- [ ] `BASE_URL` is the exact environment HTTPS origin
- [ ] `DATABASE_PATH` and `UPLOAD_DIRECTORY` point to persistent environment-specific storage
- [ ] `PAYMENT_PROVIDER` is correct
- [ ] Simulation is false in production
- [ ] Debug/development shortcuts are disabled
- [ ] Every administrator role secret is unique and at least 16 characters in production

## Security

- [ ] Super Admin provisioned through the secret store; no default credential
- [ ] Provider-dashboard MFA and administrator MFA path reviewed
- [ ] Roles and restricted API URLs tested
- [ ] CSP, frame, MIME, referrer, permissions and HSTS headers verified
- [ ] Login/payment rate limiting and edge limits active
- [ ] Dependency audit and secret scan reviewed
- [ ] Upload malware-scanning/quarantine process active

## Data and recovery

- [ ] Pre-deployment database/media backup created and verified
- [ ] Restore test completed in disposable staging
- [ ] Backup encryption, retention, immutability and access controls configured
- [ ] Payment recovery/reconciliation procedure assigned

## Payments

- [ ] Provider account approved
- [ ] Correct environment credential stored as a secret
- [ ] Ghana Mobile Money enabled
- [ ] Webhook URL and signature verification tested
- [ ] Server-side transaction verification tested
- [ ] Amount, currency, metadata and provider-reference checks pass
- [ ] Duplicate webhook and concurrent verification tests pass
- [ ] Failed/cancelled/pending cases do not credit
- [ ] Refund/reversal record-and-adjust workflow reviewed and tested
- [ ] No critical reconciliation exception exists

## Public smoke test

- [ ] Home, Announcements, Events, Awards, Businesses, Lost & Found, Feedback, Media, Executives and Contact
- [ ] Voting initiation, success, failure, cancel, pending, receipt and safe retry
- [ ] Navigation, keyboard access and responsive widths 375/430/768/1024/1440

## Admin smoke test

- [ ] Login/logout/session expiration
- [ ] Role denial for direct restricted URLs and APIs
- [ ] Dashboard, publicity, Awards, transactions, feedback, businesses, Lost & Found, media, executives, settings and audit logs
- [ ] Voting pause/resume is server enforced and audited

## Controlled launch

- [ ] Internal technical/admin test completed
- [ ] Small trusted-student pilot completed
- [ ] SRC leadership verified executives, contacts, categories, nominees, price, dates and result visibility
- [ ] Authorized controlled live transaction completed and reconciled
- [ ] Short launch freeze active; only launch-blocking fixes allowed
- [ ] Public launch approved by named owners
