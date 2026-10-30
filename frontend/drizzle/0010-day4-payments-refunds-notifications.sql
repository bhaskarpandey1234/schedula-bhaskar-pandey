ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS consultation_fee_minor integer;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS consultation_currency text NOT NULL DEFAULT 'INR';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS refund_policy_snapshot text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE TYPE public.reservation_status AS ENUM ('active', 'converted', 'released', 'expired');
CREATE TYPE public.reservation_purpose AS ENUM ('booking', 'reschedule');
CREATE TYPE public.payment_status AS ENUM ('creating', 'pending', 'captured', 'failed', 'abandoned', 'expired', 'captured_unallocated');
CREATE TYPE public.payment_purpose AS ENUM ('booking', 'reschedule_adjustment');
CREATE TYPE public.refund_status AS ENUM ('requested', 'pending', 'processed', 'failed');
CREATE TYPE public.reschedule_status AS ENUM ('pending', 'completed', 'expired', 'failed');
CREATE TYPE public.notification_channel AS ENUM ('email', 'sms', 'whatsapp');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'processing', 'sent', 'failed', 'cancelled');
CREATE TABLE public.refund_policies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_hours integer NOT NULL DEFAULT 24, partial_hours integer NOT NULL DEFAULT 2, partial_percent integer NOT NULL DEFAULT 50, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.refund_policies(full_hours, partial_hours, partial_percent, active) VALUES (24, 2, 50, 1);

DROP INDEX IF EXISTS public.appointments_patient_slot_unique;
CREATE UNIQUE INDEX appointments_patient_slot_active_unique ON public.appointments(patient_id, slot_id) WHERE status IN ('payment_pending', 'confirmed');
CREATE TABLE public.slot_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE, patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE, doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE, slot_id uuid NOT NULL REFERENCES public.appointment_slots(id) ON DELETE CASCADE, purpose public.reservation_purpose NOT NULL DEFAULT 'booking', status public.reservation_status NOT NULL DEFAULT 'active', expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX slot_reservations_slot_idx ON public.slot_reservations(slot_id, status);
CREATE UNIQUE INDEX slot_reservations_active_patient_slot_unique ON public.slot_reservations(patient_id, slot_id) WHERE status = 'active';
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE, reservation_id uuid REFERENCES public.slot_reservations(id) ON DELETE SET NULL, purpose public.payment_purpose NOT NULL DEFAULT 'booking', provider text NOT NULL DEFAULT 'razorpay', status public.payment_status NOT NULL DEFAULT 'creating', amount_minor integer NOT NULL CHECK (amount_minor > 0), currency text NOT NULL DEFAULT 'INR', provider_order_id text, provider_payment_id text, idempotency_key text NOT NULL UNIQUE, failure_reason text, captured_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider, provider_order_id));
CREATE INDEX payments_appointment_idx ON public.payments(appointment_id, created_at);
CREATE TABLE public.refund_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE, reason text NOT NULL, amount_minor integer NOT NULL CHECK (amount_minor >= 0), currency text NOT NULL DEFAULT 'INR', status public.refund_status NOT NULL DEFAULT 'requested', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE, payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE, amount_minor integer NOT NULL CHECK (amount_minor > 0), status public.refund_status NOT NULL DEFAULT 'requested', provider_refund_id text UNIQUE, idempotency_key text NOT NULL UNIQUE, failure_reason text, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.payment_webhook_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL DEFAULT 'razorpay', provider_event_id text NOT NULL, event_type text NOT NULL, entity_id text, payload text NOT NULL, status public.delivery_status NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider, provider_event_id));
CREATE TABLE public.reschedule_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE, target_slot_id uuid NOT NULL REFERENCES public.appointment_slots(id) ON DELETE CASCADE, target_reservation_id uuid REFERENCES public.slot_reservations(id) ON DELETE SET NULL, old_fee_minor integer NOT NULL, new_fee_minor integer NOT NULL, status public.reschedule_status NOT NULL DEFAULT 'pending', expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE, recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE, channel public.notification_channel NOT NULL DEFAULT 'email', template text NOT NULL, scheduled_at timestamptz NOT NULL, status public.delivery_status NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, dedupe_key text NOT NULL UNIQUE, next_attempt_at timestamptz, last_error text, provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notification_delivery_due_idx ON public.notification_deliveries(status, scheduled_at);

ALTER TABLE public.slot_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select_own ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.patient_id = auth.uid()));
CREATE POLICY refunds_select_own ON public.refund_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.patient_id = auth.uid()));
CREATE POLICY refunds_detail_select_own ON public.refunds FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.refund_requests r JOIN public.appointments a ON a.id = r.appointment_id WHERE r.id = request_id AND a.patient_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN INSERT INTO notification_deliveries(notification_id, recipient_id, appointment_id, template, scheduled_at, dedupe_key) VALUES (NEW.id, NEW.recipient_id, NEW.appointment_id, NEW.type::text, now(), COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text)) ON CONFLICT (dedupe_key) DO NOTHING; RETURN NEW; END; $$;
CREATE TRIGGER notifications_enqueue_delivery AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_delivery();

CREATE OR REPLACE FUNCTION public.reserve_paid_appointment(p_slot_id uuid, p_reason text DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS TABLE(appointment_id uuid, payment_id uuid, reservation_id uuid, amount_minor integer, currency text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_patient uuid := auth.uid(); v_slot record; v_appointment uuid; v_reservation uuid; v_payment uuid; v_expires timestamptz := now() + interval '15 minutes';
BEGIN
  IF v_patient IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_patient AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can book appointments'; END IF;
  SELECT s.id, s.doctor_id, s.capacity, s.allocated_count, s.status slot_status, s.slot_start_at, a.status session_status, d.consultation_fee_minor, d.consultation_currency INTO v_slot FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id WHERE s.id = p_slot_id FOR UPDATE OF s, a;
  IF NOT FOUND OR v_slot.slot_status <> 'available' OR v_slot.session_status <> 'active' OR v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'This slot is no longer available'; END IF;
  IF v_slot.consultation_fee_minor IS NULL THEN RAISE EXCEPTION 'This doctor has not configured a consultation fee'; END IF;
  SELECT a.id, p.id, r.id INTO v_appointment, v_payment, v_reservation FROM appointments a JOIN slot_reservations r ON r.appointment_id = a.id AND r.status = 'active' JOIN payments p ON p.appointment_id = a.id WHERE a.patient_id = v_patient AND a.slot_id = p_slot_id AND a.status = 'payment_pending' AND r.expires_at > now() ORDER BY a.created_at DESC LIMIT 1;
  IF v_appointment IS NOT NULL THEN RETURN QUERY SELECT v_appointment, v_payment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, (SELECT expires_at FROM slot_reservations WHERE id = v_reservation); RETURN; END IF;
  IF EXISTS (SELECT 1 FROM appointments WHERE patient_id = v_patient AND slot_id = p_slot_id AND status = 'confirmed') THEN RAISE EXCEPTION 'You have already booked this slot'; END IF;
  IF v_slot.allocated_count >= v_slot.capacity THEN RAISE EXCEPTION 'This slot is full'; END IF;
  INSERT INTO appointments(patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot) VALUES (v_patient, v_slot.doctor_id, p_slot_id, 'payment_pending', NULLIF(trim(p_reason), ''), '{"full_hours":24,"partial_hours":2,"partial_percent":50}') RETURNING id INTO v_appointment;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, expires_at) VALUES (v_appointment, v_patient, v_slot.doctor_id, p_slot_id, v_expires) RETURNING id INTO v_reservation;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = p_slot_id;
  INSERT INTO payments(appointment_id, reservation_id, amount_minor, currency, idempotency_key) VALUES (v_appointment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, COALESCE(NULLIF(p_idempotency_key, ''), v_appointment::text)) RETURNING id INTO v_payment;
  RETURN QUERY SELECT v_appointment, v_payment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, v_expires;
END; $$;

CREATE OR REPLACE FUNCTION public.attach_payment_order(p_payment_id uuid, p_order_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM payments p JOIN appointments a ON a.id = p.appointment_id WHERE p.id = p_payment_id AND a.patient_id = auth.uid()) THEN RAISE EXCEPTION 'Payment was not found'; END IF; UPDATE payments SET provider_order_id = p_order_id, status = 'pending' WHERE id = p_payment_id AND status IN ('creating','pending'); END; $$;

CREATE OR REPLACE FUNCTION public.complete_payment(p_payment_id uuid, p_provider_payment_id text, p_outcome text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payment payments%ROWTYPE; v_reservation slot_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment was not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = v_payment.appointment_id AND patient_id = auth.uid()) THEN RAISE EXCEPTION 'Payment was not found'; END IF;
  SELECT * INTO v_reservation FROM slot_reservations WHERE id = v_payment.reservation_id FOR UPDATE;
  IF p_outcome <> 'captured' THEN UPDATE payments SET status = CASE WHEN p_outcome = 'abandoned' THEN 'abandoned'::payment_status ELSE 'failed'::payment_status END, provider_payment_id = COALESCE(provider_payment_id, p_provider_payment_id) WHERE id = p_payment_id AND status NOT IN ('captured','captured_unallocated'); RETURN p_outcome; END IF;
  UPDATE payments SET provider_payment_id = COALESCE(provider_payment_id, p_provider_payment_id), captured_at = COALESCE(captured_at, now()), status = CASE WHEN v_reservation.status = 'active' AND v_reservation.expires_at > now() THEN 'captured'::payment_status ELSE 'captured_unallocated'::payment_status END WHERE id = p_payment_id AND status NOT IN ('captured','captured_unallocated');
  IF v_reservation.status = 'active' AND v_reservation.expires_at > now() THEN
    UPDATE slot_reservations SET status = 'converted' WHERE id = v_reservation.id;
    UPDATE appointments SET status = 'confirmed' WHERE id = v_payment.appointment_id AND status = 'payment_pending';
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) SELECT patient_id, id, 'payment_confirmed', 'Payment confirmed', 'Your appointment is confirmed and payment was received.', 'payment-confirmed/' || id FROM appointments WHERE id = v_payment.appointment_id ON CONFLICT DO NOTHING;
    INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key) SELECT a.patient_id, a.id, 'appointment_reminder_24h', s.slot_start_at - interval '24 hours', 'reminder-24h/' || a.id FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.id = v_payment.appointment_id AND s.slot_start_at - interval '24 hours' > now() ON CONFLICT (dedupe_key) DO NOTHING;
    INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key) SELECT a.patient_id, a.id, 'appointment_reminder_2h', s.slot_start_at - interval '2 hours', 'reminder-2h/' || a.id FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.id = v_payment.appointment_id AND s.slot_start_at - interval '2 hours' > now() ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN 'confirmed';
  END IF;
  RETURN 'captured_unallocated';
END; $$;

CREATE OR REPLACE FUNCTION public.expire_payment_holds() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer := 0; v_row record;
BEGIN
  FOR v_row IN SELECT r.id, r.slot_id, r.appointment_id, p.id payment_id FROM slot_reservations r LEFT JOIN payments p ON p.reservation_id = r.id AND p.status IN ('creating','pending','abandoned') WHERE r.status = 'active' AND r.expires_at <= now() FOR UPDATE OF r LOOP
    UPDATE slot_reservations SET status = 'expired' WHERE id = v_row.id; UPDATE appointments SET status = 'expired' WHERE id = v_row.appointment_id AND status = 'payment_pending'; IF v_row.payment_id IS NOT NULL THEN UPDATE payments SET status = 'expired' WHERE id = v_row.payment_id AND status IN ('creating','pending','abandoned'); END IF; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_row.slot_id; v_count := v_count + 1;
  END LOOP; RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_paid_appointment(p_appointment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_patient uuid := auth.uid(); v_appointment appointments%ROWTYPE; v_slot appointment_slots%ROWTYPE; v_paid integer; v_refunded integer; v_percent integer; v_refund integer; v_request uuid; v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_appointment FROM appointments WHERE id = p_appointment_id AND patient_id = v_patient FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Appointment was not found'; END IF; IF v_appointment.status = 'cancelled' THEN RETURN jsonb_build_object('status','cancelled','refund_amount_minor',0); END IF; IF v_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'This appointment cannot be cancelled'; END IF;
  SELECT * INTO v_slot FROM appointment_slots WHERE id = v_appointment.slot_id FOR UPDATE; IF v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'Only future appointments can be cancelled'; END IF;
  v_paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = p_appointment_id AND status = 'captured'), 0); v_refunded := COALESCE((SELECT sum(amount_minor) FROM refunds r JOIN refund_requests rr ON rr.id = r.request_id WHERE rr.appointment_id = p_appointment_id AND r.status IN ('requested','pending','processed')), 0);
  IF v_slot.slot_start_at - now() >= interval '24 hours' THEN v_percent := 100; ELSIF v_slot.slot_start_at - now() >= interval '2 hours' THEN v_percent := 50; ELSE v_percent := 0; END IF; v_refund := GREATEST(0, floor((v_paid - v_refunded) * v_percent / 100.0));
  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id; UPDATE slot_reservations SET status = 'released' WHERE appointment_id = p_appointment_id AND status = 'converted'; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_appointment.slot_id;
  INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) VALUES (v_patient, p_appointment_id, 'appointment_cancelled', 'Appointment cancelled', 'Your appointment has been cancelled. Refund status is shown below.', 'appointment-cancelled/' || p_appointment_id) ON CONFLICT DO NOTHING;
  IF v_refund > 0 THEN INSERT INTO refund_requests(appointment_id, reason, amount_minor, status) VALUES (p_appointment_id, 'appointment_cancellation', v_refund, 'requested') RETURNING id INTO v_request; SELECT * INTO v_payment FROM payments WHERE appointment_id = p_appointment_id AND status = 'captured' ORDER BY created_at DESC LIMIT 1; IF v_payment.id IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) VALUES (v_request, v_payment.id, v_refund, 'refund/' || v_request); END IF; INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) VALUES (v_patient, p_appointment_id, 'refund_pending', 'Refund requested', 'Your refund request has been submitted and may remain pending with the payment provider.', 'refund-pending/' || p_appointment_id) ON CONFLICT DO NOTHING; END IF;
  RETURN jsonb_build_object('status','cancelled','refund_amount_minor',v_refund,'refund_request_id',v_request);
END; $$;

REVOKE ALL ON FUNCTION public.reserve_paid_appointment(uuid, text, text) FROM PUBLIC; REVOKE ALL ON FUNCTION public.attach_payment_order(uuid, text) FROM PUBLIC; REVOKE ALL ON FUNCTION public.complete_payment(uuid, text, text) FROM PUBLIC; REVOKE ALL ON FUNCTION public.expire_payment_holds() FROM PUBLIC; REVOKE ALL ON FUNCTION public.cancel_paid_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_paid_appointment(uuid, text, text) TO authenticated; GRANT EXECUTE ON FUNCTION public.attach_payment_order(uuid, text) TO authenticated; GRANT EXECUTE ON FUNCTION public.complete_payment(uuid, text, text) TO authenticated; GRANT EXECUTE ON FUNCTION public.cancel_paid_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_doctor_onboarding(p_full_name text, p_specialty text, p_clinic_name text, p_experience_years integer, p_biography text, p_timezone text, p_consultation_fee_minor integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctor accounts can complete doctor onboarding'; END IF; IF p_consultation_fee_minor IS NULL OR p_consultation_fee_minor < 100 THEN RAISE EXCEPTION 'A consultation fee of at least INR 1 is required'; END IF; UPDATE profiles SET full_name = trim(p_full_name) WHERE id = auth.uid(); INSERT INTO doctors(id, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency) VALUES (auth.uid(), trim(p_specialty), trim(p_clinic_name), p_experience_years, trim(p_biography), trim(p_timezone), p_consultation_fee_minor, 'INR') ON CONFLICT (id) DO UPDATE SET specialty = EXCLUDED.specialty, clinic_name = EXCLUDED.clinic_name, experience_years = EXCLUDED.experience_years, biography = EXCLUDED.biography, timezone = EXCLUDED.timezone, consultation_fee_minor = EXCLUDED.consultation_fee_minor, consultation_currency = 'INR'; END; $$;
CREATE OR REPLACE FUNCTION public.update_doctor_profile(p_full_name text, p_specialty text, p_clinic_name text, p_experience_years integer, p_biography text, p_timezone text, p_consultation_fee_minor integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can update this profile'; END IF; IF p_consultation_fee_minor IS NULL OR p_consultation_fee_minor < 100 THEN RAISE EXCEPTION 'A consultation fee of at least INR 1 is required'; END IF; UPDATE profiles SET full_name = trim(p_full_name) WHERE id = auth.uid(); UPDATE doctors SET specialty = trim(p_specialty), clinic_name = trim(p_clinic_name), experience_years = p_experience_years, biography = trim(p_biography), timezone = trim(p_timezone), consultation_fee_minor = p_consultation_fee_minor, consultation_currency = 'INR' WHERE id = auth.uid(); END; $$;
GRANT EXECUTE ON FUNCTION public.complete_doctor_onboarding(text, text, text, integer, text, text, integer) TO authenticated; GRANT EXECUTE ON FUNCTION public.update_doctor_profile(text, text, text, integer, text, text, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.patient_bookable_slot(uuid);
CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.require_patient_directory_access(); RETURN QUERY SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' WHERE s.id = p_slot_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity; END; $$;
REVOKE ALL ON FUNCTION public.patient_bookable_slot(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.patient_bookable_slot(uuid) TO authenticated;

DO $$ DECLARE r record; BEGIN FOR r IN SELECT a.id, a.patient_id, a.doctor_id, a.slot_id FROM appointments a WHERE a.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM slot_reservations sr WHERE sr.appointment_id = a.id) LOOP INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (r.id, r.patient_id, r.doctor_id, r.slot_id, 'booking', 'converted', now() + interval '100 years'); END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.start_same_doctor_reschedule(p_appointment_id uuid, p_target_slot_id uuid)
RETURNS TABLE(reschedule_id uuid, payment_id uuid, amount_minor integer, currency text, expires_at timestamptz, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old appointments%ROWTYPE; v_target record; v_request uuid; v_reservation uuid; v_expiry timestamptz := now() + interval '15 minutes';
BEGIN
  SELECT * INTO v_old FROM appointments WHERE id = p_appointment_id AND patient_id = auth.uid() AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment was not found or is not reschedulable'; END IF;
  SELECT s.*, d.consultation_fee_minor, d.consultation_currency INTO v_target FROM appointment_slots s JOIN doctors d ON d.id = s.doctor_id WHERE s.id = p_target_slot_id FOR UPDATE OF s;
  IF v_target.doctor_id <> v_old.doctor_id OR v_target.status <> 'available' OR v_target.slot_start_at <= now() OR v_target.allocated_count >= v_target.capacity THEN RAISE EXCEPTION 'Choose another available slot with the same doctor'; END IF;
  IF v_target.consultation_fee_minor <> (SELECT consultation_fee_minor FROM doctors WHERE id = v_old.doctor_id) THEN RAISE EXCEPTION 'Fee-changing reschedules require payment settlement'; END IF;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (v_old.id, v_old.patient_id, v_old.doctor_id, p_target_slot_id, 'reschedule', 'converted', v_expiry) RETURNING id INTO v_reservation;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = p_target_slot_id;
  UPDATE slot_reservations SET status = 'released' WHERE appointment_id = v_old.id AND slot_id = v_old.slot_id AND status = 'converted';
  UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_old.slot_id;
  UPDATE appointments SET slot_id = p_target_slot_id WHERE id = v_old.id;
  INSERT INTO reschedule_requests(appointment_id, target_slot_id, target_reservation_id, old_fee_minor, new_fee_minor, status, expires_at) VALUES (v_old.id, p_target_slot_id, v_reservation, (SELECT consultation_fee_minor FROM doctors WHERE id = v_old.doctor_id), v_target.consultation_fee_minor, 'completed', v_expiry) RETURNING id INTO v_request;
  RETURN QUERY SELECT v_request, NULL::uuid, 0, v_target.consultation_currency, v_expiry, 'completed';
END; $$;
REVOKE ALL ON FUNCTION public.start_same_doctor_reschedule(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_same_doctor_reschedule(uuid, uuid) TO authenticated;
