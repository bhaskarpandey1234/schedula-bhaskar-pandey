-- Idempotent cancellation/refund requests and all-date doctor schedule access.
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_cancellation_once
  ON public.refund_requests(appointment_id) WHERE reason = 'appointment_cancellation';

CREATE OR REPLACE FUNCTION public.cancel_paid_appointment(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now timestamptz := now(); v_patient uuid := auth.uid(); v_appointment appointments%ROWTYPE; v_slot appointment_slots%ROWTYPE;
  v_paid integer := 0; v_refunded integer := 0; v_percent integer := 0; v_refund integer := 0; v_request uuid; v_payment payments%ROWTYPE; v_refund_status text := 'not_required';
BEGIN
  IF v_patient IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_patient AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can cancel appointments'; END IF;
  SELECT * INTO v_appointment FROM appointments WHERE id = p_appointment_id AND patient_id = v_patient FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment was not found'; END IF;
  IF v_appointment.status = 'cancelled' THEN
    SELECT id, status::text INTO v_request, v_refund_status FROM refund_requests WHERE appointment_id = p_appointment_id AND reason = 'appointment_cancellation' ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('appointment_status','cancelled','refund_request_id',v_request,'refund_status',COALESCE(v_refund_status, 'not_required'),'refund_amount_minor',0);
  END IF;
  IF v_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'This appointment cannot be cancelled'; END IF;
  SELECT * INTO v_slot FROM appointment_slots WHERE id = v_appointment.slot_id FOR UPDATE;
  IF v_slot.slot_start_at <= v_now THEN RAISE EXCEPTION 'Only future appointments can be cancelled'; END IF;
  v_paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = p_appointment_id AND status = 'captured'), 0);
  v_refunded := COALESCE((SELECT sum(r.amount_minor) FROM refunds r JOIN refund_requests rr ON rr.id = r.request_id WHERE rr.appointment_id = p_appointment_id AND r.status IN ('requested','pending','processed')), 0);
  IF v_slot.slot_start_at - v_now >= interval '24 hours' THEN v_percent := 100; ELSIF v_slot.slot_start_at - v_now >= interval '2 hours' THEN v_percent := 50; END IF;
  v_refund := GREATEST(0, floor((v_paid - v_refunded) * v_percent / 100.0));
  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id AND status = 'confirmed';
  UPDATE slot_reservations SET status = 'released' WHERE appointment_id = p_appointment_id AND status = 'converted';
  UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_appointment.slot_id;
  INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) VALUES (v_patient, p_appointment_id, 'appointment_cancelled', 'Appointment cancelled', 'Your appointment has been cancelled. Refund status is shown below.', 'appointment-cancelled/' || p_appointment_id) ON CONFLICT DO NOTHING;
  IF v_refund > 0 THEN
    INSERT INTO refund_requests(appointment_id, reason, amount_minor, status) VALUES (p_appointment_id, 'appointment_cancellation', v_refund, 'requested') ON CONFLICT DO NOTHING RETURNING id INTO v_request;
    IF v_request IS NULL THEN SELECT id INTO v_request FROM refund_requests WHERE appointment_id = p_appointment_id AND reason = 'appointment_cancellation' ORDER BY created_at DESC LIMIT 1; END IF;
    SELECT * INTO v_payment FROM payments WHERE appointment_id = p_appointment_id AND status = 'captured' ORDER BY created_at DESC LIMIT 1;
    IF v_payment.id IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) VALUES (v_request, v_payment.id, v_refund, 'refund/' || v_request) ON CONFLICT (idempotency_key) DO NOTHING; END IF;
    v_refund_status := 'requested';
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) VALUES (v_patient, p_appointment_id, 'refund_pending', 'Refund requested', 'Your refund request has been submitted and may remain pending with the payment provider.', 'refund-pending/' || p_appointment_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('appointment_status','cancelled','refund_request_id',v_request,'refund_status',v_refund_status,'refund_amount_minor',v_refund);
END;
$$;

DROP FUNCTION IF EXISTS public.doctor_schedule_appointments(date);
CREATE OR REPLACE FUNCTION public.doctor_schedule_appointments(p_session_date text)
RETURNS TABLE(appointment_id uuid, slot_id uuid, patient_name text, status appointment_status, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can view schedule appointments'; END IF;
  IF p_session_date <> 'all' AND p_session_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid schedule date'; END IF;
  RETURN QUERY SELECT a.id, s.id, patient_profile.full_name, a.status, s.slot_start_at, s.slot_end_at FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN doctors d ON d.id = a.doctor_id JOIN profiles patient_profile ON patient_profile.id = a.patient_id AND patient_profile.role = 'patient' WHERE a.doctor_id = auth.uid() AND (p_session_date = 'all' OR (s.slot_start_at AT TIME ZONE d.timezone)::date = p_session_date::date) ORDER BY s.slot_start_at, patient_profile.full_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_paid_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_schedule_appointments(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
