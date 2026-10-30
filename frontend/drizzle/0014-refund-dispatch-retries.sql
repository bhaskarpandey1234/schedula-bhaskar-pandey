-- Durable claims make concurrent Cron invocations safe and allow only transient failures to retry.
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS refunds_dispatch_due_idx
  ON public.refunds(status, next_attempt_at)
  WHERE status = 'requested';

CREATE OR REPLACE FUNCTION public.claim_pending_refunds(p_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, request_id uuid, amount_minor integer, idempotency_key text, provider_payment_id text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
    FROM refunds r
    JOIN payments p ON p.id = r.payment_id
    WHERE r.status = 'requested'
      AND p.provider_payment_id IS NOT NULL
      AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
      AND (r.processing_started_at IS NULL OR r.processing_started_at < now() - interval '10 minutes')
    ORDER BY r.created_at
    FOR UPDATE OF r SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  ), claimed AS (
    UPDATE refunds r
    SET processing_started_at = now(), attempts = r.attempts + 1, next_attempt_at = NULL, updated_at = now()
    FROM candidates c
    WHERE r.id = c.id
    RETURNING r.id, r.request_id, r.amount_minor, r.idempotency_key, r.payment_id, r.attempts
  )
  SELECT c.id, c.request_id, c.amount_minor, c.idempotency_key, p.provider_payment_id, c.attempts
  FROM claimed c JOIN payments p ON p.id = c.payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pending_refunds(integer) TO service_role;
NOTIFY pgrst, 'reload schema';
