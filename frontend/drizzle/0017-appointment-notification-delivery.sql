-- Durable multi-channel notification delivery, consent, and one-date doctor leave.
CREATE TYPE public.notification_delivery_status AS ENUM
  ('pending', 'processing', 'sent', 'delivered', 'failed', 'undeliverable', 'cancelled');

ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.notification_deliveries
  ALTER COLUMN status TYPE public.notification_delivery_status
  USING CASE status::text
    WHEN 'pending' THEN 'pending'::public.notification_delivery_status
    WHEN 'processing' THEN 'processing'::public.notification_delivery_status
    WHEN 'sent' THEN 'sent'::public.notification_delivery_status
    WHEN 'failed' THEN 'failed'::public.notification_delivery_status
    ELSE 'cancelled'::public.notification_delivery_status
  END;
ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_unique
  ON public.notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_preferences(
  recipient_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  operational_email boolean NOT NULL DEFAULT false,
  operational_sms boolean NOT NULL DEFAULT false,
  reminder_email boolean NOT NULL DEFAULT false,
  reminder_sms boolean NOT NULL DEFAULT false,
  email_consented_at timestamptz,
  sms_consented_at timestamptz,
  email_revoked_at timestamptz,
  sms_revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.notification_attempts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.notification_deliveries(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  provider text NOT NULL,
  outcome text NOT NULL,
  provider_message_id text,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(delivery_id, attempt_number)
);
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_doctor_cancellation_once
  ON public.refund_requests(appointment_id) WHERE reason = 'doctor_session_cancellation';

CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO notification_deliveries(notification_id, recipient_id, appointment_id, channel, template, scheduled_at, dedupe_key)
  SELECT NEW.id, NEW.recipient_id, NEW.appointment_id, channels.channel, NEW.type::text, now(),
         COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text) || '/' || channels.channel
  FROM (
    SELECT 'email'::notification_channel AS channel
    WHERE EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_email)
    UNION ALL
    SELECT 'sms'::notification_channel
    WHERE EXISTS (SELECT 1 FROM notification_preferences p WHERE p.recipient_id = NEW.recipient_id AND p.operational_sms)
  ) channels
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_lifecycle_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'confirmed')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      VALUES (NEW.doctor_id, NEW.id, 'appointment_booked', 'New appointment booked', 'A patient has booked one of your available slots.', 'appointment-booked-doctor/' || NEW.id::text)
      ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'cancelled')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      VALUES (NEW.doctor_id, NEW.id, 'appointment_cancelled', 'Appointment cancelled', 'A patient appointment was cancelled.', 'appointment-cancelled-doctor/' || NEW.id::text)
      ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_payment_failure_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'failed')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      SELECT a.patient_id, a.id, 'payment_failed', 'Payment failed', 'Your appointment payment was not completed. Please try again if the slot is still available.', 'payment-failed/' || NEW.id::text
      FROM appointments a WHERE a.id = NEW.appointment_id
      ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_lifecycle_notifications ON public.appointments;
CREATE TRIGGER appointments_lifecycle_notifications
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_appointment_lifecycle_notifications();
DROP TRIGGER IF EXISTS payments_failure_notification ON public.payments;
CREATE TRIGGER payments_failure_notification
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_payment_failure_notification();

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, recipient_id uuid, appointment_id uuid, channel text, template text, dedupe_key text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM notification_deliveries d
    WHERE (d.status = 'pending'::notification_delivery_status
      AND d.scheduled_at <= now()
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now()))
      OR (d.status = 'processing'::notification_delivery_status
        AND d.processing_started_at < now() - interval '10 minutes')
    ORDER BY d.scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 200))
  ), claimed AS (
    UPDATE notification_deliveries d
    SET status = 'processing'::notification_delivery_status,
        attempts = d.attempts + 1,
        processing_started_at = now(),
        updated_at = now()
    FROM candidates c WHERE d.id = c.id
    RETURNING d.id, d.recipient_id, d.appointment_id, d.channel::text, d.template, d.dedupe_key, d.attempts
  )
  SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_doctor_session_occurrence(p_session_id uuid, p_occurrence_date date)
RETURNS TABLE(cancelled_appointments integer, refund_requests integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid();
  v_session availability_sessions%ROWTYPE;
  v_slot record;
  v_appointment record;
  v_paid integer;
  v_refund uuid;
  v_cancelled integer := 0;
  v_refunds integer := 0;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can cancel leave';
  END IF;
  SELECT * INTO v_session FROM availability_sessions WHERE id = p_session_id AND doctor_id = v_doctor FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'active' THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_session.timezone)::date THEN RAISE EXCEPTION 'Leave must be in the future'; END IF;
  IF v_session.kind = 'custom' AND v_session.session_date <> p_occurrence_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;

  FOR v_slot IN
    SELECT s.* FROM appointment_slots s
    WHERE s.availability_session_id = v_session.id
      AND (s.slot_start_at AT TIME ZONE v_session.timezone)::date = p_occurrence_date
    FOR UPDATE
  LOOP
    FOR v_appointment IN SELECT a.* FROM appointments a WHERE a.slot_id = v_slot.id AND a.status = 'confirmed' FOR UPDATE LOOP
      UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = v_appointment.id;
      UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appointment.id AND status = 'converted';
      UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_slot.id;
      UPDATE notification_deliveries SET status = 'cancelled', updated_at = now()
        WHERE appointment_id = v_appointment.id AND template LIKE 'appointment_reminder%' AND status IN ('pending','processing');

      SELECT COALESCE(sum(amount_minor), 0) INTO v_paid FROM payments WHERE appointment_id = v_appointment.id AND status = 'captured';
      IF v_paid > 0 THEN
        v_refund := NULL;
        INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status)
          SELECT v_appointment.id, 'doctor_session_cancellation', v_paid, p.currency, 'requested'
          FROM payments p WHERE p.appointment_id = v_appointment.id AND p.status = 'captured'
          ORDER BY p.created_at DESC LIMIT 1
          ON CONFLICT DO NOTHING RETURNING id INTO v_refund;
        IF v_refund IS NOT NULL THEN
          INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key)
            SELECT v_refund, p.id, v_paid, 'refund/' || v_refund::text
            FROM payments p WHERE p.appointment_id = v_appointment.id AND p.status = 'captured'
            ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING;
          v_refunds := v_refunds + 1;
          INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
            VALUES (v_appointment.patient_id, v_appointment.id, 'refund_pending', 'Refund requested', 'Your doctor cancelled this appointment. A full refund has been requested.', 'doctor-session-refund/' || v_appointment.id::text)
            ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
        VALUES (v_appointment.patient_id, v_appointment.id, 'appointment_cancelled', 'Appointment cancelled by doctor', 'Your doctor cancelled this appointment. Please choose another available time.', 'doctor-session-cancelled/' || v_appointment.id::text)
        ON CONFLICT DO NOTHING;
      INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
        VALUES (v_doctor, v_appointment.id, 'appointment_cancelled', 'Appointment cancellation recorded', 'The patient appointment was cancelled because of doctor leave.', 'doctor-session-cancelled-doctor/' || v_appointment.id::text)
        ON CONFLICT DO NOTHING;
      v_cancelled := v_cancelled + 1;
    END LOOP;
    UPDATE appointment_slots SET status = 'cancelled', updated_at = now() WHERE id = v_slot.id;
  END LOOP;
  IF v_session.kind = 'custom' THEN UPDATE availability_sessions SET status = 'cancelled', updated_at = now() WHERE id = v_session.id; END IF;
  RETURN QUERY SELECT v_cancelled, v_refunds;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_deliveries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_doctor_session_occurrence(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_session_occurrence(uuid, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
