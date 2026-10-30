-- 1. Doctor-initiated appointment cancellation
CREATE OR REPLACE FUNCTION public.cancel_doctor_appointment(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid();
  v_appointment appointments%ROWTYPE;
  v_slot appointment_slots%ROWTYPE;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can cancel appointments';
  END IF;
  SELECT * INTO v_appointment FROM appointments WHERE id = p_appointment_id AND doctor_id = v_doctor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment was not found'; END IF;
  IF v_appointment.status = 'cancelled' THEN RETURN; END IF;
  IF v_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'This appointment cannot be cancelled'; END IF;
  SELECT * INTO v_slot FROM appointment_slots WHERE id = v_appointment.slot_id FOR UPDATE;
  IF v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'Only future appointments can be cancelled'; END IF;

  UPDATE appointments SET status = 'cancelled' WHERE id = p_appointment_id AND status = 'confirmed';
  UPDATE slot_reservations SET status = 'released' WHERE appointment_id = p_appointment_id AND status = 'converted';
  UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_appointment.slot_id;

  -- Cancel pending reminders for this appointment
  UPDATE notification_deliveries
    SET status = 'cancelled', updated_at = now()
    WHERE appointment_id = p_appointment_id
      AND template LIKE 'appointment_reminder%'
      AND status = 'pending';

  -- Notify patient
  INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
    VALUES (v_appointment.patient_id, p_appointment_id, 'appointment_cancelled',
            'Appointment cancelled by doctor',
            'Your doctor has cancelled this appointment. Please rebook at your convenience.',
            'doctor-cancelled/' || p_appointment_id)
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_doctor_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_appointment(uuid) TO authenticated;

-- 2. Reschedule notifications + reminder lifecycle
CREATE OR REPLACE FUNCTION public.start_same_doctor_reschedule(p_appointment_id uuid, p_target_slot_id uuid)
RETURNS TABLE(reschedule_id uuid, payment_id uuid, amount_minor integer, currency text, expires_at timestamptz, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old appointments%ROWTYPE;
  v_target record;
  v_request uuid;
  v_reservation uuid;
  v_expiry timestamptz := now() + interval '15 minutes';
BEGIN
  SELECT * INTO v_old FROM appointments WHERE id = p_appointment_id AND patient_id = auth.uid() AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment was not found or is not reschedulable'; END IF;

  SELECT s.*, d.consultation_fee_minor, d.consultation_currency INTO v_target
    FROM appointment_slots s JOIN doctors d ON d.id = s.doctor_id
    WHERE s.id = p_target_slot_id FOR UPDATE OF s;

  IF v_target.doctor_id <> v_old.doctor_id OR v_target.status <> 'available' OR v_target.slot_start_at <= now() OR v_target.allocated_count >= v_target.capacity THEN
    RAISE EXCEPTION 'Choose another available slot with the same doctor';
  END IF;
  IF v_target.consultation_fee_minor <> (SELECT consultation_fee_minor FROM doctors WHERE id = v_old.doctor_id) THEN
    RAISE EXCEPTION 'Fee-changing reschedules require payment settlement';
  END IF;

  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at)
    VALUES (v_old.id, v_old.patient_id, v_old.doctor_id, p_target_slot_id, 'reschedule', 'converted', v_expiry)
    RETURNING id INTO v_reservation;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = p_target_slot_id;
  UPDATE slot_reservations SET status = 'released' WHERE appointment_id = v_old.id AND slot_id = v_old.slot_id AND status = 'converted';
  UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = v_old.slot_id;
  UPDATE appointments SET slot_id = p_target_slot_id WHERE id = v_old.id;

  INSERT INTO reschedule_requests(appointment_id, target_slot_id, target_reservation_id, old_fee_minor, new_fee_minor, status, expires_at)
    VALUES (v_old.id, p_target_slot_id, v_reservation,
            (SELECT consultation_fee_minor FROM doctors WHERE id = v_old.doctor_id),
            v_target.consultation_fee_minor, 'completed', v_expiry)
    RETURNING id INTO v_request;

  -- Cancel old reminders, schedule new ones for the new slot time
  UPDATE notification_deliveries
    SET status = 'cancelled', updated_at = now()
    WHERE appointment_id = v_old.id
      AND template LIKE 'appointment_reminder%'
      AND status = 'pending';

  INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key)
    SELECT v_old.patient_id, v_old.id, 'appointment_reminder_24h',
           v_target.slot_start_at - interval '24 hours',
           'reminder-24h/' || v_old.id || '/' || v_request::text
    WHERE v_target.slot_start_at - interval '24 hours' > now()
    ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key)
    SELECT v_old.patient_id, v_old.id, 'appointment_reminder_2h',
           v_target.slot_start_at - interval '2 hours',
           'reminder-2h/' || v_old.id || '/' || v_request::text
    WHERE v_target.slot_start_at - interval '2 hours' > now()
    ON CONFLICT (dedupe_key) DO NOTHING;

  -- Notify patient
  INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
    VALUES (v_old.patient_id, v_old.id, 'appointment_rescheduled',
            'Appointment rescheduled',
            'Your appointment has been rescheduled to a new time.',
            'rescheduled-patient/' || v_old.id || '/' || v_request::text)
    ON CONFLICT DO NOTHING;

  -- Notify doctor
  INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
    VALUES (v_old.doctor_id, v_old.id, 'appointment_rescheduled',
            'Appointment rescheduled by patient',
            'A patient has rescheduled their appointment to a new time.',
            'rescheduled-doctor/' || v_old.id || '/' || v_request::text)
    ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_request, NULL::uuid, 0, v_target.consultation_currency, v_expiry, 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.start_same_doctor_reschedule(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_same_doctor_reschedule(uuid, uuid) TO authenticated;

-- 3. Slot utilization analytics for doctors
CREATE OR REPLACE FUNCTION public.doctor_slot_utilization()
RETURNS TABLE(
  period text,
  total_slots bigint,
  booked_slots bigint,
  cancelled_slots bigint,
  utilization_percent numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can view analytics';
  END IF;
  RETURN QUERY
  SELECT
    to_char(date_trunc('week', s.slot_start_at AT TIME ZONE d.timezone), 'YYYY-MM-DD') AS period,
    COUNT(s.id) AS total_slots,
    COUNT(a.id) FILTER (WHERE a.status = 'confirmed') AS booked_slots,
    COUNT(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled_slots,
    CASE WHEN COUNT(s.id) = 0 THEN 0
         ELSE ROUND(COUNT(a.id) FILTER (WHERE a.status = 'confirmed') * 100.0 / COUNT(s.id), 1)
    END AS utilization_percent
  FROM appointment_slots s
  JOIN doctors d ON d.id = s.doctor_id
  LEFT JOIN appointments a ON a.slot_id = s.id AND a.status IN ('confirmed', 'cancelled')
  WHERE s.doctor_id = auth.uid()
    AND s.slot_start_at >= now() - interval '12 weeks'
    AND s.slot_start_at < now() + interval '4 weeks'
  GROUP BY date_trunc('week', s.slot_start_at AT TIME ZONE d.timezone), d.timezone
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_slot_utilization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_slot_utilization() TO authenticated;

NOTIFY pgrst, 'reload schema';
