# Paystack payment-provider setup

## Current status

The repository implements server-side Ghana Mobile Money charges, transaction verification, HMAC-SHA512 webhook authentication, amount/currency/metadata checks, and atomic idempotent vote crediting. Development uses `simulation`; staging may use `paystack_test`; production may select `paystack_live` only when all launch gates are satisfied.

This document does not authorize real payments. Live credentials and an approved Paystack business account are still external requirements.

Official references:

- [Paystack payment channels and Ghana Mobile Money](https://paystack.com/docs/payments/payment-channels/)
- [Paystack transaction verification API](https://paystack.com/docs/api/transaction/)
- [Paystack webhook signature verification](https://paystack.com/docs/payments/webhooks/)
- [Paystack refunds](https://paystack.com/docs/payments/refunds/)

## Credentials and configuration

| Name | Classification | Purpose |
|---|---|---|
| `BASE_URL` | Public, required in staging/production | Canonical HTTPS application origin; do not append a path |
| `PAYMENT_PROVIDER` | Public server config, required | `simulation`, `paystack_test`, `paystack_live`, or `disabled` |
| `PAYSTACK_SECRET_KEY` | Secret, required for either Paystack mode | Server authentication and webhook HMAC verification |
| `SIMULATED_PAYMENTS_ENABLED` | Public server config | Local/testing switch; must be false in production |

The current server-to-server Charge API flow does not use a public key in the browser. Do not add a public key unless the implementation changes to an official client checkout flow. Paystack signs webhooks with the account secret key; there is no separate webhook-secret variable in the present implementation.

## Provider account preparation

1. Create the organization-owned Paystack account using official SRC/institution details.
2. Complete Paystack's current Ghana business verification and settlement requirements in the provider dashboard. The institution must confirm requirements directly with Paystack; the application cannot determine account approval.
3. Restrict provider-dashboard access to named authorized operators and enable provider-supported MFA.
4. Obtain test credentials for staging. Never reuse production credentials in development or ordinary staging.
5. Configure the staging webhook as `https://<staging-host>/api/paystack/webhook`.
6. Confirm Ghana Mobile Money is enabled for the account. The implemented provider codes are `mtn`, `atl`, and `vod`, matching Paystack's documented Ghana codes.

## Development

Use `APP_ENV=development`, `PAYMENT_PROVIDER=simulation`, and `SIMULATED_PAYMENTS_ENABLED=true`. No provider credential is needed. Simulation must never be used to demonstrate a real financial settlement.

## Staging

Use a separate database, upload location, administrator passwords, and Paystack test secret:

```text
APP_ENV=staging
BASE_URL=https://<staging-host>
PAYMENT_PROVIDER=paystack_test
SIMULATED_PAYMENTS_ENABLED=false
PAYSTACK_SECRET_KEY=<staging secret store value>
```

Configure the provider dashboard's test webhook to the staging URL. The Mobile Money Charge API may return an offline/pending state; the system waits for a signed `charge.success` webhook or calls Verify Transaction. Initialization never credits votes.

## Staging acceptance tests

1. Initiate a one-vote payment and confirm the stored amount was calculated by the backend.
2. Complete a successful test payment and confirm exactly one ledger entry and one vote credit.
3. Exercise failed, cancelled, and pending cases supported by the provider test environment.
4. replay the same signed webhook and verify no extra vote is added.
5. trigger repeated verification requests and confirm idempotency.
6. test an amount/currency mismatch using the automated test harness, not by altering provider data.
7. confirm an invalid signature is rejected.
8. confirm a success redirect or receipt refresh does not credit votes.
9. confirm transaction reconciliation shows the correct state without payer secrets.
10. record a test refund/reversal internally only after the provider dashboard confirms it; confirm votes are removed once.

## Live-mode gate

Before setting `PAYMENT_PROVIDER=paystack_live`:

- Provider account is approved and live Mobile Money is enabled.
- `BASE_URL` is the final HTTPS origin.
- Live webhook URL is configured and a signed delivery has been tested.
- Live secret is in the hosting secret store, never a file or database setting.
- Database and media backups plus restore testing are complete.
- Monitoring and on-call ownership are active.
- Refund/reversal policy is signed off.
- A separately authorized, small controlled live transaction is scheduled.

Production refuses simulation, refuses Paystack test mode, and refuses live mode without a live-key prefix. There is no silent fallback.

## Refund limitation

Paystack documents a Refund API, but this application intentionally does not call it yet. The internal protected adjustment endpoint records a refund/reversal only after an authorized operator confirms the external provider outcome and supplies the exact transaction and provider references. Provider-side refund initiation and refund-webhook mapping require a separately reviewed implementation and test credentials.

**REAL PAYMENTS: NOT YET ENABLED**
