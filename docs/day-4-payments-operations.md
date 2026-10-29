# Day 4 payment and notification operations

Day 4 adds INR Razorpay payments, policy-based refunds, payment-aware appointment
state, and a durable notification outbox. The application remains provider-neutral
at the domain boundary, but Razorpay is the only enabled provider in this release.

## Secrets

Configure these values only in `frontend/.env.local`, Vercel, or another secret
manager. Never commit them or place them in browser code:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`
- `DATABASE_URL`
- `JOB_RUNNER_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` when email delivery is enabled

`RAZORPAY_KEY_ID` is returned to the Checkout client only by the server-side
checkout-start action. The API secret and webhook secret are never returned.

## Razorpay setup

1. Enable Orders API and automatic capture in Razorpay Test mode.
2. Configure the webhook URL as:
   `https://<host>/api/payments/razorpay/webhook`.
3. Subscribe to payment captured/failed, order paid, and refund created/processed/
   failed events.
4. Use the same webhook secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.
5. Verify the checkout flow with test credentials before enabling live keys.

The webhook stores a verified event before returning success. Duplicate event IDs
are safe to acknowledge, and event processing is state-aware so an older event
cannot overwrite a captured or processed state. If an event is missed, reconcile
the provider payment or refund from the protected dispatcher rather than creating
a second order or refund.

## Supabase Cron dispatcher

The protected endpoint is:

```text
POST /api/internal/jobs/dispatch
Authorization: Bearer <JOB_RUNNER_SECRET>
```

Configure a Supabase Cron job to invoke it every minute. Keep the endpoint URL and
secret in Supabase Vault/hosting secrets; do not put either value in a migration or
the repository. The dispatcher expires unpaid reservations, reconciles delayed
payments and refunds, claims notification rows, and retries transient delivery
failures.

The dispatcher is idempotent. Database dedupe keys and guarded state transitions make
repeated invocation safe. Inspect the outbox and provider event rows before retrying
an operational failure manually.

## Refund policy

The seeded global policy is:

- 100% refund at least 24 hours before the appointment.
- 50% refund from 2 hours up to (but not including) 24 hours.
- No refund inside 2 hours.

Cancellation changes the appointment immediately; a refund remains `requested` or
`pending` until the provider confirms it. Patients should never see cancellation
as proof that money has already returned.

## Local and staging validation

Use Razorpay Test mode and never commit test credentials. A local server cannot
receive Razorpay webhooks directly; use a public staging endpoint or a supported
secure tunnel for webhook delivery tests. Unit and integration tests use the
test-only fake provider and do not contact Razorpay.

Before handoff, run `pnpm release:check`, then the Docker-backed integration and
E2E suites when Docker is available. Confirm that no `.env.local`, provider key,
patient data, or generated build output is tracked.
