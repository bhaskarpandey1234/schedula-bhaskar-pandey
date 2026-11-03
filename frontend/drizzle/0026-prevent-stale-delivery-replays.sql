-- A provider result can be uncertain if a process stops after the provider call.
-- Do not replay such rows automatically: reconcile them explicitly instead.
UPDATE public.notification_deliveries
SET status = 'failed'::public.notification_delivery_status,
    processing_started_at = NULL,
    next_attempt_at = NULL,
    failed_at = now(),
    last_error = 'delivery_reconciliation_required',
    updated_at = now()
WHERE status = 'processing'::public.notification_delivery_status
  AND processing_started_at < now() - interval '10 minutes'
  AND provider_message_id IS NULL;

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, recipient_id uuid, appointment_id uuid, channel text, template text, dedupe_key text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.notification_deliveries d
    WHERE d.status = 'pending'::public.notification_delivery_status
      AND d.scheduled_at <= now()
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
    ORDER BY d.scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 200))
  ), claimed AS (
    UPDATE public.notification_deliveries d
    SET status = 'processing'::public.notification_delivery_status,
        attempts = d.attempts + 1,
        processing_started_at = now(),
        updated_at = now()
    FROM candidates c WHERE d.id = c.id
    RETURNING d.id, d.recipient_id, d.appointment_id, d.channel::text, d.template, d.dedupe_key, d.attempts
  )
  SELECT * FROM claimed;
END;
$$;

DROP FUNCTION IF EXISTS public.notification_delivery_context(uuid);
CREATE FUNCTION public.notification_delivery_context(p_delivery_id uuid)
RETURNS TABLE(
  email text,
  phone text,
  recipient_name text,
  recipient_role text,
  patient_name text,
  doctor_name text,
  clinic_name text,
  timezone text,
  slot_start_at timestamptz,
  slot_end_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.email,
         COALESCE(recipient_patient.phone, recipient_doctor.phone) AS phone,
         COALESCE(recipient_profile.full_name, 'Schedula user') AS recipient_name,
         recipient_profile.role::text AS recipient_role,
         COALESCE(patient_profile.full_name, 'Patient') AS patient_name,
         doctor_profile.full_name AS doctor_name,
         doctor.clinic_name,
         doctor.timezone,
         slot.slot_start_at,
         slot.slot_end_at
  FROM public.notification_deliveries delivery
  JOIN public.appointments appointment ON appointment.id = delivery.appointment_id
  JOIN public.appointment_slots slot ON slot.id = appointment.slot_id
  JOIN public.doctors doctor ON doctor.id = appointment.doctor_id
  JOIN public.profiles doctor_profile ON doctor_profile.id = doctor.id
  JOIN public.profiles patient_profile ON patient_profile.id = appointment.patient_id
  JOIN public.profiles recipient_profile ON recipient_profile.id = delivery.recipient_id
  LEFT JOIN public.patients recipient_patient ON recipient_patient.id = delivery.recipient_id
  LEFT JOIN public.doctors recipient_doctor ON recipient_doctor.id = delivery.recipient_id
  LEFT JOIN auth.users u ON u.id = delivery.recipient_id
  WHERE delivery.id = p_delivery_id;
$$;

REVOKE ALL ON FUNCTION public.notification_delivery_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
