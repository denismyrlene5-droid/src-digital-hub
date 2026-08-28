# SRC Digital Hub

This project extends the original SRC Awards localhost application into one Digital Hub while preserving the existing Awards categories, nominees, voting modal, leaderboard, Paystack test flow, and development payment simulation.

## Requirements and local start

- Node.js 22.5+ (the project uses built-in `node:sqlite`)
- npm

Run `npm install`, then `npm start`, and open `http://localhost:8000`.

## Public routes

- `/` — homepage with live publicity and featured-business feeds
- `/announcements` and `/announcements/:slug`
- `/events` and `/events/:slug`
- `/feedback` and `/feedback/status`
- `/lost-found` and `/lost-found/:slug`
- `/businesses` and `/businesses/:slug`
- `/media` and `/media/:slug`
- `/executives` and `/executives/:slug`
- `/awards` — preserved Awards experience
- `/media`, `/executives`, `/contact`
- `/admin` — shared, role-aware administration dashboard

## Configuration and roles

Copy `.env.example` to `.env` and use long, distinct passwords:

- `ADMIN_PASSWORD` — Super Admin; all Hub modules and Awards
- `PUBLICITY_ADMIN_PASSWORD` — announcements, events, businesses, and Lost & Found moderation
- `STUDENT_AFFAIRS_ADMIN_PASSWORD` — private feedback and Lost & Found moderation
- `AWARDS_ADMIN_PASSWORD` — Awards administration only
- `CONTENT_EDITOR_PASSWORD` — draft content, media, and executive editing without publish/delete authority
- `ADMIN_USERS_JSON` — optional individual username accounts, for example an array of `{ "username": "name", "password": "<deployment-secret>", "role": "publicity_admin" }` records. Supported roles match the five roles above. Keep the value only in the deployment secret store and include the full active account list on every restart.
- `DATABASE_PATH` — SQLite path; default `data/src-awards.sqlite`
- `PAYSTACK_SECRET_KEY` — optional Paystack test secret only
- `PORT`, `NODE_ENV`

Authorization is checked on the server for every protected endpoint. Hiding a dashboard tab is not used as authorization. Never place secrets in `public/`.

## Student services

Student Voice supports anonymous submissions, high-entropy case references, safe public status checks, admin-controlled priority/status, public responses, private notes, and optional restricted documents.

Lost & Found submissions begin as `pending`. Only `approved` listings are public. Private contact values and moderation notes are never included in public APIs. Images are limited to JPG, PNG, and WebP and are not publicly served until the listing is approved.

Student Businesses also begin as `pending`. A business must be both approved and published to appear publicly; featured approved businesses populate the homepage spotlight.

Media albums and photos are stored as database metadata plus files outside the public directory. Only published albums are public. The gallery supports category/search filters, accessible album pages, keyboard lightbox controls, captions, alt text, ordering, and featured homepage content.

Executive profiles support terms, display order, active/inactive history, responsibilities, optional public contact details, and server-controlled administration. No real office-holder data is seeded.

## Academics

The public `/academics` and `/academics/course-structure` pages expose the currently published UCC Institute of Education B.Ed. five-semester structure. Programme combinations, reusable courses, semester assignments, credit hours, remarks, version status, and source-document history are stored in SQLite. The supplied official 14-page PDF is retained as the import source and copied to `UPLOAD_DIRECTORY` on first initialization.

Super Admin and Publicity Admin accounts manage Academics inside the existing `/admin` dashboard. Create a new draft by cloning the current structure, make programme/course/document changes, verify the draft, and publish it. Publishing archives the previous version atomically; published and archived versions cannot be edited or permanently deleted through the normal interface.

The unified admin dashboard exposes only role-authorized navigation and APIs. Individual accounts record the username and role in `audit_log`; legacy role-password login remains available during migration. Important changes record the action, resource identifier, timestamp, and a short safe summary. Feedback messages, internal notes, passwords, and secrets are excluded.

Uploads are stored outside the public directory in `data/uploads` with random filenames. Announcement and event images use multipart disk-streamed uploads, are decoded by Sharp, auto-oriented, resized, compressed to WebP, and receive a card thumbnail. Legacy upload callers remain backward compatible. This local storage is suitable for a single persistent-volume deployment; larger deployments should use managed object storage, malware scanning, retention rules, backups, and image redaction/moderation workflows.

## Awards and payments

- SQLite is the source of truth for categories, nominees, configuration, payment records, verification state, and the idempotent vote ledger.
- On the one-time hardening migration, pre-existing aggregate-only nominee totals are preserved in `legacy_unverified_votes` but excluded from live verified totals because they cannot be tied to a trusted transaction. Existing ledger-backed votes remain counted.
- The browser submits only a nominee and whole-number vote quantity. The backend validates voting state and eligibility, reads the trusted price, and calculates the amount in pesewas.
- Every attempt receives a cryptographically random `SRCVOTE-…` reference and begins as `pending / unverified / not_credited`.
- Payment initialization never credits votes. A trusted provider verification result must match the stored amount, currency, transaction reference, and provider reference before crediting is allowed.
- Verification and vote credit use one SQLite `BEGIN IMMEDIATE` transaction. The unique vote-ledger reference plus the transaction's credit state make browser refreshes, callback retries, and concurrent verification idempotent.
- The safe receipt route is `/awards/payment/:reference`; its lookup exposes no payer details, provider secrets, internal IDs, or failure notes and performs no credit action.
- Public rankings/percentages can be disabled. When disabled, the public Awards API omits them rather than merely hiding them with CSS.
- Awards and Super Admin roles can manage voting state, price, result visibility, nominee/category eligibility, and reconciliation. Other roles are rejected server-side.
- Pending transactions older than 30 minutes are marked expired during reconciliation. A later real-provider success must still pass trusted verification before recovery.

### Trusted transaction flow

```text
Student
  ↓
Select nominee + vote quantity
  ↓
Backend validates event, voting state, category, nominee and quantity
  ↓
Backend reads price and calculates the amount in minor units
  ↓
Pending transaction + secure reference created
  ↓
Configured payment provider initializes payment
  ↓
Server verifies provider status, amount, currency and reference
  ↓
Atomic ledger insert + nominee total update + credited state
  ↓
Safe receipt / confirmation
```

### Provider modes

The rest of Awards uses the common provider interface in `server/payment-providers.js`: initialization and trusted verification. Development simulation and Paystack test mode feed the same `verifyAndCredit` core; they do not maintain separate vote-credit logic.

- `simulation` supports pending, successful, failed, cancelled, duplicate, repeated-verification, and amount-mismatch test cases. It is unavailable in production. If simulation is requested with `NODE_ENV=production`, startup fails safely.
- `paystack_test` uses the existing documented charge and transaction-verification calls. The webhook validates the existing Paystack HMAC signature and then re-verifies the transaction server-side before crediting.
- No production provider mode or production credential is enabled. Provider production credentials, live API behavior, webhook delivery, operational monitoring, refund/reversal policy, and a real-provider acceptance test remain required.

### Reconciliation

Awards admins can filter recent transactions by status and public reference. The dashboard shows pending payments, successful/failed states, verification failures, credited state, amount, nominee, and category. It does not provide an arbitrary credit button. Development-only vote seeding remains unavailable in production; resets are audited and should be disabled or separately protected before a live launch.

Safe server logs use the public transaction reference for creation, initialization, verification, credit, mismatch, and duplicate diagnostics. Passwords, secrets, PINs, and private payer data are not logged.

### Payment configuration

- `PAYMENT_PROVIDER` — reserved provider selection (`simulation` locally; production mode is not enabled yet)
- `PAYSTACK_SECRET_KEY` — optional Paystack **test** secret, server-side only
- `SIMULATED_PAYMENTS_ENABLED` — local/test simulation switch; must be `false` in production

Do not place any payment credential in `public/`, the database settings table, logs, or admin UI.

**REAL PAYMENTS: NOT YET ENABLED**

## Validation

Run `npm test` for API/regression tests, `npm run lint` for JavaScript quality checks, and `npm run test:browser` for desktop/mobile Chromium checks. There is no compile/build step because the frontend is served as plain HTML/CSS/JavaScript.

## Production-readiness documentation

- `docs/PRODUCTION_READINESS.md` — environments, hosting requirements, administrator security, review findings, and controlled launch
- `docs/PAYMENT_PROVIDER_SETUP.md` — Paystack test/live requirements and payment acceptance gates
- `docs/BACKUP_AND_RECOVERY.md` — SQLite/media backup, verification, restore testing, and payment reconciliation
- `docs/DEPLOYMENT_CHECKLIST.md` — staging, production, smoke-test, and launch checklists
- `docs/OPERATIONS_RUNBOOK.md` — health, reconciliation, pause/resume, outages, credentials, and monitoring
- `docs/INCIDENT_RESPONSE.md` — containment and recovery scenarios
- `docs/ROLLBACK_PLAN.md` — application rollback separated from payment data recovery

Prompt 7 adds `APP_ENV`, `BASE_URL`, `UPLOAD_DIRECTORY`, and `MAINTENANCE_MODE`. `.env.example` intentionally contains variable names only. Production requires an HTTPS `BASE_URL`, a unique 16+ character Super Admin secret, simulation disabled, and either a complete live-provider configuration or `PAYMENT_PROVIDER=disabled`.

## Important files

- `public/index.html`, `public/app.js`, `public/styles.css` — Awards-critical frontend
- `public/hub.html`, `public/hub.js`, `public/hub-shell.js`, `public/hub.css` — shared Hub shell and design system
- `public/publicity.js` — publicity pages and shared administration shell
- `public/services.js` — Student Voice, Lost & Found, Businesses, and moderation UI
- `public/content.js` — Media Gallery, accessible lightbox, executive profiles, settings, and content administration
- `server/database.js` — Awards data and vote/payment ledger
- `server/publicity.js`, `server/publicity-routes.js` — announcements and events
- `server/services.js`, `server/services-routes.js` — student-service schema, validation, APIs, moderation, and uploads
- `server/content.js`, `server/content-routes.js` — media, executives, settings, audit logging, and content APIs
- `server/uploads.js` — shared restricted local upload storage
- `server/security.js` — sessions, roles, rate limits, and security headers
- `server/app.js` — application composition and route serving
- `test/app.test.js` — Awards, publicity, service, privacy, and role regressions
