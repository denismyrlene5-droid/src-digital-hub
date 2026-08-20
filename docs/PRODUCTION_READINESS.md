# Production readiness and controlled launch

## Environment model

| Environment | Purpose | Data/storage | Payment mode |
|---|---|---|---|
| Development | Local implementation and automated tests | Local disposable/developer SQLite and uploads | Simulation |
| Staging | Production-like acceptance, restore drills, role and webhook testing | Separate persistent staging database/uploads | Paystack test/sandbox |
| Production | Approved public service | Dedicated encrypted persistent database/uploads | Disabled until controlled Paystack live authorization |

Never copy private production feedback into staging. If realistic data is needed, use anonymized fixtures. Staging callback/webhook URLs and credentials must be separate.

## Actual hosting requirements

- Node.js 22.5+ process hosting with `npm ci --omit=dev` and `npm start`.
- Persistent SQLite volume supporting WAL and reliable locking; one application writer node unless the database architecture is deliberately changed.
- Persistent private upload storage; object storage is preferred for production.
- HTTPS reverse proxy, environment-specific hostname, process supervision, centralized logs, backup scheduler and external health monitoring.
- Webhook: `https://<host>/api/paystack/webhook`.
- Health: `https://<host>/health`.

No domain is hardcoded. Use `BASE_URL=https://<environment-host>`.

## Administrator identity

The current stack uses distinct high-entropy environment secrets per role, hashes them in process with scrypt for comparison, rate-limits login, rotates to a new 256-bit session token on login, uses HttpOnly/SameSite=Strict cookies, Secure cookies in production, 30-minute idle timeout, 8-hour absolute timeout, same-origin mutation checks, and server-side RBAC.

Production first-admin provisioning: generate a unique 16+ character secret with an approved password manager, store it as `ADMIN_PASSWORD` in the deployment secret store, start the app, test Super Admin access, and restrict secret-store access. No default or seeded universal credential exists.

Remaining blocker: roles are shared credentials, not named/deactivatable administrator identities. There is no safe account-level password reset, individual role-change history, or built-in MFA. Before a broad public financial launch, integrate an institution-approved identity provider or a reviewed account system with WebAuthn/TOTP and recovery codes. Do not build homemade OTP. Provider-dashboard MFA is mandatory now for financial operators.

## Security review summary

- SQL uses prepared statements for user values; dynamic table names are internal allowlisted code paths.
- Output encoding is present for new receipt/admin values; CSP blocks inline/untrusted scripts.
- SameSite cookies, no permissive CORS and same-origin admin mutations reduce CSRF risk.
- Public references are random; public receipt/status responses omit internal IDs, secrets and payer details.
- Server-side RBAC, nominee/category checks, upload token validation, MIME/signature checks, rate limits, generic errors, payment verification and idempotent transactions are present.
- Local upload malware scanning, distributed rate limiting, named admin identities/MFA and managed production persistence remain operational blockers.

## Controlled launch order

1. Internal technical/admin test.
2. Small trusted student pilot with simulation or Paystack test.
3. Staging sign-off by SRC leadership on content, contacts, nominees, price, dates and visibility.
4. Separately authorized controlled production transaction after every payment checklist item passes.
5. Public launch after reconciliation and a short feature freeze.

If any critical payment, backup, security, or reconciliation check fails, keep `PAYMENT_PROVIDER=disabled` and do not accept real money.
