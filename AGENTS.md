# SRC Digital Hub Development Rules

## Technology and commands

- Frontend: semantic HTML, CSS, and vanilla browser JavaScript.
- Backend: Node.js 22.5+ and Express 4.
- Storage: Node built-in SQLite (`node:sqlite`) with the database at `data/src-awards.sqlite` by default.
- Start/development command: `npm start`.
- Test command: `npm test`.
- Build command: none; static frontend assets are served directly by Express.
- Lint/type-check commands: none currently. Use `node --check` for JavaScript syntax checks.

## Project structure

- `public/`: browser-visible HTML, CSS, JavaScript, and future local assets.
- `public/index.html`, `public/app.js`, `public/styles.css`: existing SRC Awards experience; modify with extra care.
- `public/hub.html`, `public/hub-data.js`, `public/hub-shell.js`, `public/hub.js`, `public/hub.css`: shared SRC Digital Hub shell and public pages.
- `public/publicity.js`: announcement/event pages and the shared role-aware admin shell.
- `public/services.js`: Student Voice, Lost & Found, Student Businesses, and service moderation UI.
- `public/content.js`: Media Gallery, executive profiles, public settings, and content administration UI.
- `server/app.js`: Express routes, Paystack test endpoints, admin APIs, and static serving.
- `server/database.js`: Awards schema, seed data, result privacy, payment records, and vote ledger.
- `server/publicity.js`, `server/publicity-routes.js`: announcements/events persistence and APIs.
- `server/services.js`, `server/services-routes.js`: service persistence, moderation APIs, validation, and local development uploads.
- `server/content.js`, `server/content-routes.js`: media/executive persistence, settings, audit logging, and content APIs.
- `server/uploads.js`: shared server-side upload validation and storage helper.
- `server/security.js`: admin sessions, rate limiting, and security headers.
- `server.js`: application entry point.
- `test/`: regression tests.
- `data/`: ignored runtime SQLite files; never serve this folder publicly.

## Awards protection

- Preserve the existing Awards page, nominee categories, voting modal, leaderboard, payment simulation, and admin workflow unless the user explicitly requests a change.
- Treat `public/index.html`, `public/app.js`, `public/styles.css`, `server/app.js`, and `server/database.js` as Awards-critical files.
- Preserve `/awards`, `/api/awards`, `/api/config`, `/api/simulated-votes`, `/api/mobile-money-charge`, `/api/verify/:reference`, and the protected `/api/admin/*` endpoints.
- Test existing Awards functionality whenever shared navigation, styling, APIs, voting, payment, storage, or admin code changes.

## Storage, voting, payments, and admin

- SQLite is the server-owned source of truth. Public clients receive ranks and percentages, never exact vote totals.
- Development payment simulation is available only outside production and only when Paystack test mode is not configured. It must credit through the server-side ledger and use an idempotency key.
- Do not integrate production payments unless explicitly requested. Paystack code must remain test-mode only until a production security review.
- Any voting or payment calculation must be validated server-side.
- Never trust nominee IDs, quantities, prices, totals, payment state, roles, or authorization claims sent by the browser.
- Admin data and mutations must require server-side authorization. UI hiding is not authorization.
- Feedback is private. Never expose identity, internal notes, priority, attachments, or internal IDs through the public status endpoint.
- Pending Lost & Found and Business submissions must remain private until server-side approval rules are satisfied.
- Draft/archived media and inactive executive profiles must not be available through public APIs or file routes.
- Audit summaries must never contain full feedback text, passwords, secrets, or sensitive internal notes.
- Preserve unique transaction references and idempotent vote crediting.

## Environment and security

- Keep supported variables documented in `.env.example`; keep real values only in ignored `.env` or the deployment secret store.
- Never hardcode passwords, API keys, payment secret keys, tokens, or other credentials.
- Never expose backend secrets to frontend code or public API responses.
- Validate environment settings at startup and fail safely when privileged features are unconfigured.
- Keep backend source, database files, logs, and environment files outside the static public directory.
- Retain security headers, request limits, rate limiting, safe cookies, generic production errors, and webhook signature verification.

## Coding and component conventions

- Use CommonJS on the backend and plain browser JavaScript on the frontend.
- Prefer small named functions, early validation, immutable shared configuration, and centralized structured sample data.
- Reuse shared header, footer, buttons, cards, containers, headings, badges, and form styles before creating duplicates.
- Keep official SRC contact/social placeholders in `public/hub-data.js`; do not scatter or invent institutional information.
- Do not introduce major dependencies when the existing stack can accomplish the task.
- Make changes incrementally rather than rewriting the application.

## Accessibility and responsive behavior

- Use semantic landmarks and correct button/link behavior, labels for controls, visible focus states, useful alt text, and logical heading order.
- Maintain strong contrast and keyboard-operable navigation, menus, modals, and forms.
- Maintain good mobile responsiveness with no horizontal overflow and tap targets of approximately 44px.
- Check layouts around 375px, 430px, 768px, 1024px, and 1440px after shared layout changes.

## Permanent rules

1. Never hardcode passwords, API keys, payment secret keys or tokens.
2. Never expose backend secrets to frontend code.
3. Never trust sensitive values sent from the browser.
4. Reuse existing components before creating duplicate components.
5. Preserve existing working SRC Awards functionality unless explicitly instructed otherwise.
6. Any future voting or payment calculations must be validated server-side.
7. Test related existing functionality whenever a feature is modified.
8. Do not introduce major dependencies when the existing stack can already accomplish the task.
9. Maintain good mobile responsiveness.
10. Make changes incrementally rather than rewriting the entire application.
