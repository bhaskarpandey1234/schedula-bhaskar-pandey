-- Doctor slot cancellation with booking and payment-hold protection.
CREATE OR REPLACE FUNCTION public.cancel_doctor_slot(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid();
  v_slot appointment_slots%ROWTYPE;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can cancel slots';
  END IF;
  SELECT s.* INTO v_slot FROM appointment_slots s
  WHERE s.id = p_slot_id AND s.doctor_id = v_doctor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slot was not found'; END IF;
  IF v_slot.status <> 'available' THEN RAISE EXCEPTION 'Slot is already cancelled'; END IF;
  IF v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'Only future slots can be cancelled'; END IF;
  IF v_slot.allocated_count > 0
     OR EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = v_slot.id AND a.status IN ('payment_pending','confirmed'))
     OR EXISTS (SELECT 1 FROM slot_reservations r WHERE r.slot_id = v_slot.id AND r.status = 'active' AND r.expires_at > now()) THEN
    RAISE EXCEPTION 'This slot has a booking or payment hold and cannot be cancelled individually';
  END IF;
  UPDATE appointment_slots SET status = 'cancelled', updated_at = now() WHERE id = v_slot.id;
END;
$$;

-- Preserve the established session cancellation and refund flow while protecting active holds.
CREATE OR REPLACE FUNCTION public.cancel_doctor_session_occurrence(p_session_id uuid, p_occurrence_date date)
RETURNS TABLE(cancelled_appointments integer, refund_requests integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor uuid := auth.uid(); v_session availability_sessions%ROWTYPE; v_slot record; v_appointment record; v_paid integer; v_refund uuid; v_cancelled integer := 0; v_refunds integer := 0;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can cancel leave'; END IF;
  SELECT * INTO v_session FROM availability_sessions WHERE id = p_session_id AND doctor_id = v_doctor FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'active' THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_session.timezone)::date THEN RAISE EXCEPTION 'Leave must be in the future'; END IF;
  IF v_session.kind = 'custom' AND v_session.session_date <> p_occurrence_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN slot_reservations r ON r.slot_id = s.id WHERE s.availability_session_id = v_session.id AND (s.slot_start_at AT TIME ZONE v_session.timezone)::date = p_occurrence_date AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This session has an active payment hold and cannot be cancelled'; END IF;
  FOR v_slot IN SELECT s.* FROM appointment_slots s WHERE s.availability_session_id = v_session.id AND (s.slot_start_at AT TIME ZONE v_session.timezone)::date = p_occurrence_date FOR UPDATE LOOP
    FOR v_appointment IN SELECT a.* FROM appointments a WHERE a.slot_id = v_slot.id AND a.status = 'confirmed' FOR UPDATE LOOP
      UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = v_appointment.id;
      UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appointment.id AND status = 'converted';
      UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_slot.id;
      SELECT COALESCE(sum(amount_minor), 0) INTO v_paid FROM payments WHERE appointment_id = v_appointment.id AND status = 'captured';
      IF v_paid > 0 THEN INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status) SELECT v_appointment.id, 'doctor_session_cancellation', v_paid, p.currency, 'requested' FROM payments p WHERE p.appointment_id = v_appointment.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING RETURNING id INTO v_refund; IF v_refund IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) SELECT v_refund, p.id, v_paid, 'refund/' || v_refund::text FROM payments p WHERE p.appointment_id = v_appointment.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING; v_refunds := v_refunds + 1; END IF; END IF;
      INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key) VALUES (v_appointment.patient_id, v_appointment.id, 'appointment_cancelled', 'Appointment cancelled by doctor', 'Your doctor cancelled this appointment. Please choose another available time.', 'doctor-session-cancelled/' || v_appointment.id::text) ON CONFLICT DO NOTHING;
      v_cancelled := v_cancelled + 1;
    END LOOP;
    UPDATE appointment_slots SET status = 'cancelled', updated_at = now() WHERE id = v_slot.id;
  END LOOP;
  IF v_session.kind = 'custom' THEN UPDATE availability_sessions SET status = 'cancelled', updated_at = now() WHERE id = v_session.id; END IF;
  RETURN QUERY SELECT v_cancelled, v_refunds;
END; $$;

GRANT EXECUTE ON FUNCTION public.cancel_doctor_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_session_occurrence(uuid, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
