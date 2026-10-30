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
- `RESEND_WEBHOOK_SECRET` when Resend delivery-status callbacks are enabled
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` when SMS is enabled
- `APPOINTMENT_REMINDER_INTERVALS_MINUTES` for comma-separated reminder lead times (default `1440,120`)

## Email verification

Enable Supabase Auth's **Confirm email** setting in local, preview, and production
projects. Configure the exact redirect URL
`https://<host>/auth/confirm?next=/onboarding` (and the local equivalent) in the
Supabase Auth URL configuration. Local confirmation messages are available in
Mailpit at `http://127.0.0.1:54324`.

Email verification is required before onboarding, profile edits, booking,
scheduling, payments, notifications, or appointment management. Public discovery,
sign-in, sign-up, sign-out, and the verification-help page remain available.
Users can request another signup email from signup success, the unverified-login
message, or `/auth/verify-email`. Resend responses are intentionally generic to
avoid account enumeration; rate limits are surfaced as a wait-and-retry message.
If a link expires, request the newest email and use only that link. Never log
verification tokens or full email addresses.

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

## Email and SMS notifications

External delivery is opt-in per channel from each user's Notifications page. In-app
operational notifications remain enabled. SMS numbers must be stored in E.164 format;
doctor numbers are required for completed doctor profiles and are collected during onboarding. Visit reasons
and other medical details are never included in external templates.

## Profile completeness and scheduling access

Patients must have a name, authenticated email, E.164 phone, and valid date of birth.
Doctors must additionally have an E.164 phone, specialty, clinic, experience, biography,
IANA timezone, and positive INR consultation fee. Existing legacy rows are not deleted;
they are marked incomplete until the user repairs the missing fields through onboarding.
Incomplete users are shown a completion notice and cannot create bookings, availability,
or reschedules. Profile updates and cancellation of existing commitments remain allowed.
The same rules are enforced by PostgreSQL scheduling triggers, so direct RPC calls cannot
bypass the UI gate.

The dispatcher claims notification rows with row-level locks, records every attempt,
retries transient failures with bounded backoff, and rechecks appointment eligibility
before sending. Rescheduled, cancelled, expired, and past appointments cannot produce
stale reminders. Provider failures are asynchronous and do not roll back booking.

Configure Resend's signed webhook URL as `/api/webhooks/resend` and Twilio's status
callback URL as `/api/webhooks/twilio/status`. Keep both signing secrets in the hosting
secret manager. Twilio trial accounts are limited to test recipients and expire; India
production SMS also requires the applicable sender-registration/DLT process and is
usage-priced. A Twilio network timeout is marked ambiguous rather than blindly retried
to reduce duplicate SMS risk; inspect the provider message log before requeueing it.

Doctor leave is a one-date occurrence cancellation. It cancels affected appointments,
cancels reminders, and creates idempotent full-refund requests for captured payments.

For Preview, use a stable branch Preview URL and Razorpay Test Mode credentials.
Create the matching `JOB_RUNNER_SECRET` in Vercel Preview and Supabase Vault, then
schedule the request with `pg_net`. A `requested` refund is only queued. The
dispatcher claims it before calling Razorpay, marks it `pending` after Razorpay
accepts it, and retries only transient provider errors. A `processed` webhook is
the source of truth for a completed refund.

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
