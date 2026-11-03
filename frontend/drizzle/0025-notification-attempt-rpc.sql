-- Keep attempt history behind a definer function. The protected dispatcher uses
-- DATABASE_URL, while the history table intentionally has no client insert policy.
CREATE OR REPLACE FUNCTION public.record_notification_attempt(
  p_delivery_id uuid,
  p_attempt_number integer,
  p_provider text,
  p_outcome text,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.notification_attempts(
    delivery_id,
    attempt_number,
    provider,
    outcome,
    provider_message_id,
    error_code
  )
  VALUES (
    p_delivery_id,
    p_attempt_number,
    p_provider,
    p_outcome,
    p_provider_message_id,
    p_error_code
  )
  ON CONFLICT (delivery_id, attempt_number) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.record_notification_attempt(uuid, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_notification_attempt(uuid, integer, text, text, text, text) TO public;

NOTIFY pgrst, 'reload schema';
