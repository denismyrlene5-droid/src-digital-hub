# Moolre payment-provider setup

## Current status

New Awards payments use Moolre hosted checkout. The server creates a unique pending transaction and calculates its amount before requesting a single-use hosted link. A callback or payment return only triggers a server-to-server status query; neither is trusted as proof of payment. The existing SQLite transaction and vote ledgers provide atomic, idempotent fulfillment.

The previous Paystack verifier and signed webhook remain available only to reconcile Paystack transactions already stored before this migration. The retired `/api/mobile-money-charge` endpoint cannot create new Paystack charges.

Official references:

- [Generate Payment Link](https://docs.moolre.com/ai/generate-payment-link.html)
- [Payment Status](https://docs.moolre.com/ai/live/payment-status.html)
- [Webhooks and Callbacks](https://docs.moolre.com/ai/guides/webhooks-and-callbacks.html)
- [Authentication](https://docs.moolre.com/ai/guides/authentication.html)
- [Idempotency and References](https://docs.moolre.com/ai/guides/idempotency-and-references.html)

## Railway variables

| Railway variable | Moolre dashboard/account field | Purpose |
|---|---|---|
| `PAYMENT_PROVIDER` | Not a credential | Use `moolre_sandbox` for staging or `moolre_live` for production |
| `MOOLRE_API_USER` | API Username | Sent only in the server-side `X-API-USER` header |
| `MOOLRE_PUBLIC_KEY` | Public API Key | Sent only in the server-side `X-API-PUBKEY` header |
| `MOOLRE_ACCOUNT_NUMBER` | Moolre Account Number | Intended recipient account and status-query scope |
| `MOOLRE_BUSINESS_EMAIL` | Business/Merchant Email | Required by hosted payment-link creation |
| `MOOLRE_LINK_EXPIRATION_MINUTES` | Not a credential | Optional single-use link lifetime; defaults to 15 |
| `BASE_URL` | Public site origin | `https://uccwisesrc.com` in production |
| `SIMULATED_PAYMENTS_ENABLED` | Not a credential | Must be `false` in production |
| `PAYSTACK_SECRET_KEY` | Legacy Paystack secret key | Optional; retain temporarily only while old pending Paystack transactions need reconciliation |

The selected hosted-link/status integration does **not** use Moolre's private key. Moolre's published callback documentation does not define a callback HMAC secret or signature header, so no callback-secret variable is invented. Callbacks are untrusted notifications and are independently verified through Payment Status before votes can be credited.

## Callback and return settings

- Payment callback URL: `https://uccwisesrc.com/api/moolre/callback`
- Payment return URL: generated per transaction as `https://uccwisesrc.com/awards/payment/<SRCVOTE-reference>`
- Settlement Callback URL: not implemented or required for vote fulfillment. Settlement tracking is separate from confirming a customer payment.

If the Moolre dashboard requires an account-level payment callback, enter the payment callback URL above. The application also sends the same callback and the transaction-specific return URL when it creates each hosted link.

## Staging

Use a separate database and Moolre sandbox credentials:

```text
APP_ENV=staging
BASE_URL=https://<staging-host>
PAYMENT_PROVIDER=moolre_sandbox
SIMULATED_PAYMENTS_ENABLED=false
MOOLRE_API_USER=<Railway secret value>
MOOLRE_PUBLIC_KEY=<Railway secret value>
MOOLRE_ACCOUNT_NUMBER=<Railway secret value>
MOOLRE_BUSINESS_EMAIL=<Railway secret value>
```

Confirm with Moolre that the account is enabled for API access and hosted payment links and that the account number accepts the intended GHS payment channels. API username, public key, private key, account number, and callback configuration are distinct values and must not be substituted for one another.

## Acceptance checks before live mode

1. Keep production at `PAYMENT_PROVIDER=disabled` while validating sandbox on staging.
2. Initiate one vote and confirm the link request sends the server-calculated GHS amount.
3. Complete a sandbox payment and confirm exactly one payment ledger entry and one vote credit.
4. Replay its callback and refresh the return page repeatedly; confirm no extra votes are added.
5. Leave a payment pending/interrupted and confirm **Check Payment Again** safely re-queries Moolre.
6. Test failed and cancelled payment experiences supported by the Moolre account.
7. Confirm invalid, unknown, amount-mismatched, and recipient-mismatched responses never credit votes.
8. Confirm old pending Paystack references can still be reconciled before removing `PAYSTACK_SECRET_KEY`.
9. Obtain explicit financial approval before changing production to `moolre_live` and conducting a separately authorized small live transaction.

No live charge is initiated by repository tests.
