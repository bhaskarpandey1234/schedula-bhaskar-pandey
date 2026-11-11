-- Capacity-aware Stream shrinking. Existing Stream sessions default to ten minutes per patient.
ALTER TABLE public.availability_sessions
  ADD COLUMN IF NOT EXISTS stream_min_patient_minutes integer;

UPDATE public.availability_sessions
SET stream_min_patient_minutes = 10
WHERE scheduling_type = 'stream' AND stream_min_patient_minutes IS NULL;

ALTER TABLE public.availability_sessions
  DROP CONSTRAINT IF EXISTS availability_sessions_stream_min_patient_minutes,
  ADD CONSTRAINT availability_sessions_stream_min_patient_minutes CHECK (
    (scheduling_type = 'wave' AND stream_min_patient_minutes IS NULL)
    OR (scheduling_type = 'stream' AND stream_min_patient_minutes IN (5, 10, 15, 20, 30, 45, 60))
  );

ALTER TABLE public.availability_occurrence_overrides
  ADD COLUMN IF NOT EXISTS stream_min_patient_minutes integer,
  ADD COLUMN IF NOT EXISTS capacity integer;

UPDATE public.availability_occurrence_overrides o
SET stream_min_patient_minutes = COALESCE(a.stream_min_patient_minutes, 10),
    capacity = a.capacity
FROM public.availability_sessions a
WHERE a.id = o.availability_session_id
  AND a.scheduling_type = 'stream';

ALTER TABLE public.availability_occurrence_overrides
  DROP CONSTRAINT IF EXISTS availability_occurrence_overrides_stream_min_patient_minutes,
  ADD CONSTRAINT availability_occurrence_overrides_stream_min_patient_minutes CHECK (
    stream_min_patient_minutes IS NULL OR stream_min_patient_minutes IN (5, 10, 15, 20, 30, 45, 60)
  );

CREATE OR REPLACE FUNCTION public.set_stream_min_patient_minutes(p_session_ids uuid[], p_minutes integer DEFAULT 10)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor uuid := auth.uid();
BEGIN
  IF v_doctor IS NULL OR p_minutes NOT IN (5, 10, 15, 20, 30, 45, 60) THEN RAISE EXCEPTION 'Invalid Stream minimum consultation time'; END IF;
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE id = ANY(p_session_ids) AND (doctor_id <> v_doctor OR scheduling_type <> 'stream')) THEN RAISE EXCEPTION 'Only your Stream sessions can be updated'; END IF;
  UPDATE availability_sessions SET stream_min_patient_minutes = p_minutes, updated_at = now() WHERE id = ANY(p_session_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_doctor_occurrence_adjustment(
  p_session_id uuid, p_occurrence_date date, p_start_time time, p_end_time time, p_assignments jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid(); v_session record; v_timezone text; v_old_start time; v_old_end time;
  v_old_start_at timestamptz; v_old_end_at timestamptz; v_new_start_at timestamptz; v_new_end_at timestamptz;
  v_interval integer; v_kind text; v_adjustment uuid; v_assignment jsonb; v_appt record; v_source record; v_target record;
  v_paid integer; v_refund uuid; v_moved integer := 0; v_cancelled integer := 0; v_stream_slot uuid; v_stream_min integer; v_stream_capacity integer; v_stream_booked integer; v_stream_overflow integer; v_slot_start timestamptz; v_slot_end timestamptz;
BEGIN
  SELECT a.*, d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id WHERE a.id = p_session_id AND a.doctor_id = v_doctor AND a.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone := v_session.doctor_timezone;
  SELECT COALESCE(o.start_time, v_session.start_time), COALESCE(o.end_time, v_session.end_time) INTO v_old_start, v_old_end FROM availability_occurrence_overrides o WHERE o.availability_session_id = p_session_id AND o.occurrence_date = p_occurrence_date;
  IF v_old_start IS NULL THEN v_old_start := v_session.start_time; v_old_end := v_session.end_time; END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL THEN RAISE EXCEPTION 'Choose a valid availability window'; END IF;
  IF p_end_time <= p_start_time OR ((p_start_time < v_old_start AND p_end_time < v_old_end) OR (p_start_time > v_old_start AND p_end_time > v_old_end)) THEN RAISE EXCEPTION 'Invalid elastic scheduling window'; END IF;
  v_kind := CASE WHEN p_start_time <= v_old_start AND p_end_time >= v_old_end THEN 'expansion' ELSE 'shrink' END;
  v_interval := v_session.interval_minutes; v_old_start_at := (p_occurrence_date + v_old_start) AT TIME ZONE v_timezone; v_old_end_at := (p_occurrence_date + v_old_end) AT TIME ZONE v_timezone; v_new_start_at := (p_occurrence_date + p_start_time) AT TIME ZONE v_timezone; v_new_end_at := (p_occurrence_date + p_end_time) AT TIME ZONE v_timezone;
  IF v_new_start_at <= now() THEN RAISE EXCEPTION 'Availability must start in the future'; END IF;
  IF v_session.scheduling_type = 'wave' AND ((extract(epoch FROM (p_start_time - v_old_start))::integer % (v_interval * 60) <> 0) OR (extract(epoch FROM (p_end_time - v_old_end))::integer % (v_interval * 60) <> 0)) THEN RAISE EXCEPTION 'Wave boundaries must align to the appointment duration'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor AND s.availability_session_id <> p_session_id AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND s.slot_start_at < v_new_end_at AND s.slot_end_at > v_new_start_at) THEN RAISE EXCEPTION 'The new window overlaps another availability session'; END IF;
  IF v_session.scheduling_type = 'wave' AND EXISTS (SELECT 1 FROM slot_reservations r JOIN appointment_slots s ON s.id = r.slot_id WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at) AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
  IF v_session.scheduling_type = 'stream' AND EXISTS (SELECT 1 FROM slot_reservations r JOIN appointment_slots s ON s.id = r.slot_id WHERE s.availability_session_id = p_session_id AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
  PERFORM 1 FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date ORDER BY s.id FOR UPDATE;
  IF v_session.scheduling_type = 'wave' THEN PERFORM 1 FROM appointment_slots s WHERE s.doctor_id = v_doctor AND s.status = 'available' AND s.id IN (SELECT (item->>'target_slot_id')::uuid FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) item WHERE NULLIF(item->>'target_slot_id','') IS NOT NULL) ORDER BY s.id FOR UPDATE; END IF;
  IF v_session.scheduling_type = 'wave' AND EXISTS (SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.status = 'confirmed' AND s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) item WHERE (item->>'appointment_id')::uuid = a.id)) THEN RAISE EXCEPTION 'The preview is stale; refresh the impact preview'; END IF;
  IF v_session.scheduling_type = 'stream' THEN
    v_stream_min := COALESCE(v_session.stream_min_patient_minutes, 10); v_stream_capacity := CASE WHEN v_kind = 'expansion' THEN v_session.capacity ELSE LEAST(v_session.capacity, FLOOR(EXTRACT(EPOCH FROM (v_new_end_at - v_new_start_at)) / 60 / v_stream_min)::integer) END;
    IF v_stream_capacity < 1 THEN RAISE EXCEPTION 'The new Stream window is shorter than its minimum consultation time'; END IF;
    SELECT s.id INTO v_stream_slot FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date ORDER BY s.slot_start_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The occurrence has no materialized slot'; END IF;
    SELECT count(*) INTO v_stream_booked FROM appointments a WHERE a.slot_id = v_stream_slot AND a.status = 'confirmed'; v_stream_overflow := GREATEST(0, v_stream_booked - v_stream_capacity);
    IF v_kind = 'shrink' AND jsonb_array_length(COALESCE(p_assignments, '[]'::jsonb)) <> v_stream_overflow THEN RAISE EXCEPTION 'The preview is stale; refresh the impact preview'; END IF;
  END IF;
  INSERT INTO availability_adjustments(doctor_id, availability_session_id, occurrence_date, scheduling_type, old_start_at, old_end_at, new_start_at, new_end_at, summary) VALUES (v_doctor, p_session_id, p_occurrence_date, v_session.scheduling_type, v_old_start_at, v_old_end_at, v_new_start_at, v_new_end_at, jsonb_build_object('classification', v_kind)) RETURNING id INTO v_adjustment;
  IF v_session.kind IN ('weekly','monthly') THEN INSERT INTO availability_occurrence_overrides(availability_session_id, doctor_id, occurrence_date, start_time, end_time, stream_min_patient_minutes, capacity) VALUES (p_session_id, v_doctor, p_occurrence_date, p_start_time, p_end_time, CASE WHEN v_session.scheduling_type = 'stream' THEN v_stream_min ELSE NULL END, CASE WHEN v_session.scheduling_type = 'stream' THEN v_stream_capacity ELSE NULL END) ON CONFLICT (availability_session_id, occurrence_date) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, stream_min_patient_minutes = EXCLUDED.stream_min_patient_minutes, capacity = EXCLUDED.capacity, updated_at = now(); ELSE UPDATE availability_sessions SET start_time = p_start_time, end_time = p_end_time, session_start_at = v_new_start_at, session_end_at = v_new_end_at, capacity = CASE WHEN v_session.scheduling_type = 'stream' THEN v_stream_capacity ELSE capacity END, updated_at = now() WHERE id = p_session_id; END IF;
  IF v_session.scheduling_type = 'stream' THEN
    UPDATE appointment_slots SET slot_start_at = v_new_start_at, slot_end_at = v_new_end_at, capacity = v_stream_capacity, updated_at = now() WHERE id = v_stream_slot;
    IF v_kind = 'shrink' THEN
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
      SELECT a.*, s.slot_start_at, s.slot_end_at INTO v_appt FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.id = (v_assignment->>'appointment_id')::uuid AND a.doctor_id = v_doctor AND a.status = 'confirmed' FOR UPDATE;
      IF NOT FOUND OR v_appt.slot_id <> v_stream_slot THEN RAISE EXCEPTION 'The preview is stale; refresh the impact preview'; END IF;
      SELECT * INTO v_source FROM appointment_slots WHERE id = v_stream_slot FOR UPDATE;
      IF NULLIF(v_assignment->>'target_slot_id','') IS NULL OR v_assignment->>'action' = 'cancelled' THEN
        UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = v_appt.id; UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appt.id AND status = 'converted'; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_stream_slot;
        UPDATE notification_deliveries SET status = 'cancelled', updated_at = now() WHERE appointment_id = v_appt.id AND template LIKE 'appointment_reminder%' AND status IN ('pending','processing');
        v_paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = v_appt.id AND status = 'captured'), 0); IF v_paid > 0 THEN v_refund := NULL; INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status) SELECT v_appt.id, 'doctor_elastic_availability', v_paid, p.currency, 'requested' FROM payments p WHERE p.appointment_id = v_appt.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING RETURNING id INTO v_refund; IF v_refund IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) SELECT v_refund, p.id, v_paid, 'refund/' || v_refund FROM payments p WHERE p.appointment_id = v_appt.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING; END IF; END IF;
        INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_appt.patient_id, v_appt.id, 'appointment_cancelled', 'Appointment cancelled by doctor', 'Your doctor changed availability and this appointment was cancelled. A full refund has been requested.', jsonb_build_object('old_start_at', v_appt.slot_start_at, 'old_end_at', v_appt.slot_end_at, 'reason', 'doctor_elastic_availability'), 'elastic-cancelled-patient/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING;
        INSERT INTO availability_adjustment_items(adjustment_id, appointment_id, source_slot_id, action, old_start_at, old_end_at) VALUES (v_adjustment, v_appt.id, v_stream_slot, 'cancelled', v_appt.slot_start_at, v_appt.slot_end_at); v_cancelled := v_cancelled + 1;
      ELSE
        SELECT * INTO v_target FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.id = (v_assignment->>'target_slot_id')::uuid FOR UPDATE;
        IF NOT FOUND OR v_target.doctor_id <> v_doctor OR v_target.status <> 'available' OR v_target.slot_start_at < v_new_end_at OR v_target.slot_start_at <= now() OR v_target.allocated_count >= v_target.capacity OR v_target.scheduling_type <> 'stream' OR EXISTS (SELECT 1 FROM appointments x JOIN appointment_slots xs ON xs.id = x.slot_id WHERE x.patient_id = v_appt.patient_id AND x.status = 'confirmed' AND x.id <> v_appt.id AND xs.slot_start_at < v_target.slot_end_at AND xs.slot_end_at > v_target.slot_start_at) THEN RAISE EXCEPTION 'A selected destination is no longer available'; END IF;
        UPDATE appointment_slots SET allocated_count = allocated_count + 1, updated_at = now() WHERE id = v_target.id; INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (v_appt.id, v_appt.patient_id, v_doctor, v_target.id, 'reschedule', 'converted', now() + interval '100 years'); UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appt.id AND slot_id = v_stream_slot AND status = 'converted'; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_stream_slot; UPDATE appointments SET slot_id = v_target.id, updated_at = now() WHERE id = v_appt.id;
        UPDATE notification_deliveries SET status = 'cancelled', updated_at = now() WHERE appointment_id = v_appt.id AND template LIKE 'appointment_reminder%' AND status IN ('pending','processing'); INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key) SELECT v_appt.patient_id, v_appt.id, 'appointment_reminder_24h', v_target.slot_start_at - interval '24 hours', 'elastic-reminder-24h/' || v_appt.id || '/' || v_adjustment WHERE v_target.slot_start_at - interval '24 hours' > now() ON CONFLICT DO NOTHING;
        INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_appt.patient_id, v_appt.id, 'appointment_rescheduled', 'Appointment rescheduled by doctor', 'Your doctor changed availability and moved your appointment to ' || to_char(v_target.slot_start_at AT TIME ZONE v_timezone, 'Mon DD, HH12:MI AM') || '.', jsonb_build_object('old_start_at', v_appt.slot_start_at, 'old_end_at', v_appt.slot_end_at, 'new_start_at', v_target.slot_start_at, 'new_end_at', v_target.slot_end_at), 'elastic-rescheduled-patient/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING;
        INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_doctor, v_appt.id, 'appointment_rescheduled', 'Appointment rescheduled', 'A booked appointment was moved during a Stream capacity adjustment.', jsonb_build_object('old_start_at', v_appt.slot_start_at, 'old_end_at', v_appt.slot_end_at, 'new_start_at', v_target.slot_start_at, 'new_end_at', v_target.slot_end_at), 'elastic-rescheduled-doctor/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING;
        INSERT INTO availability_adjustment_items(adjustment_id, appointment_id, source_slot_id, target_slot_id, action, old_start_at, old_end_at, new_start_at, new_end_at) VALUES (v_adjustment, v_appt.id, v_stream_slot, v_target.id, 'moved', v_appt.slot_start_at, v_appt.slot_end_at, v_target.slot_start_at, v_target.slot_end_at); v_moved := v_moved + 1;
      END IF;
    END LOOP;
    END IF;
    FOR v_appt IN SELECT a.*, v_old_start_at AS old_slot_start, v_old_end_at AS old_slot_end FROM appointments a WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND a.slot_id = v_stream_slot LOOP
      UPDATE notification_deliveries SET status = 'cancelled', updated_at = now() WHERE appointment_id = v_appt.id AND template LIKE 'appointment_reminder%' AND status IN ('pending','processing'); INSERT INTO notification_deliveries(recipient_id, appointment_id, template, scheduled_at, dedupe_key) SELECT v_appt.patient_id, v_appt.id, 'appointment_reminder_24h', v_new_start_at - interval '24 hours', 'elastic-reminder-24h/' || v_appt.id || '/' || v_adjustment WHERE v_new_start_at - interval '24 hours' > now() ON CONFLICT DO NOTHING; INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_appt.patient_id, v_appt.id, 'appointment_rescheduled', 'Appointment window changed', 'Your doctor changed the arrival window from ' || to_char(v_old_start_at AT TIME ZONE v_timezone, 'Mon DD, HH12:MI AM') || '–' || to_char(v_old_end_at AT TIME ZONE v_timezone, 'HH12:MI AM') || ' to ' || to_char(v_new_start_at AT TIME ZONE v_timezone, 'Mon DD, HH12:MI AM') || '–' || to_char(v_new_end_at AT TIME ZONE v_timezone, 'HH12:MI AM') || '.', jsonb_build_object('old_start_at', v_old_start_at, 'old_end_at', v_old_end_at, 'new_start_at', v_new_start_at, 'new_end_at', v_new_end_at), 'elastic-rescheduled-patient/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING; INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_doctor, v_appt.id, 'appointment_rescheduled', 'Appointment window changed', 'The shared arrival window was changed for a booked patient.', jsonb_build_object('old_start_at', v_old_start_at, 'old_end_at', v_old_end_at, 'new_start_at', v_new_start_at, 'new_end_at', v_new_end_at), 'elastic-rescheduled-doctor/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING; INSERT INTO availability_adjustment_items(adjustment_id, appointment_id, source_slot_id, action, old_start_at, old_end_at, new_start_at, new_end_at) SELECT v_adjustment, v_appt.id, v_stream_slot, 'moved', v_old_start_at, v_old_end_at, v_new_start_at, v_new_end_at;
    END LOOP;
    UPDATE appointment_slots SET capacity = v_stream_capacity, slot_start_at = v_new_start_at, slot_end_at = v_new_end_at, updated_at = now() WHERE id = v_stream_slot;
  ELSE
    v_slot_start := v_new_start_at; WHILE v_slot_start + make_interval(mins => v_interval) <= v_new_end_at LOOP v_slot_end := v_slot_start + make_interval(mins => v_interval); INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (p_session_id, v_doctor, v_slot_start, v_slot_end, v_session.capacity) ON CONFLICT (availability_session_id, slot_start_at) DO NOTHING; v_slot_start := v_slot_end; END LOOP;
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
      SELECT a.*, s.slot_start_at, s.slot_end_at INTO v_appt FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.id = (v_assignment->>'appointment_id')::uuid AND a.doctor_id = v_doctor AND a.status = 'confirmed' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'The preview is stale; refresh the impact preview'; END IF;
      SELECT * INTO v_source FROM appointment_slots WHERE id = v_appt.slot_id FOR UPDATE;
      IF NULLIF(v_assignment->>'target_slot_id','') IS NULL OR v_assignment->>'action' = 'cancelled' THEN
        UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = v_appt.id; UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appt.id AND status = 'converted'; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_source.id; UPDATE notification_deliveries SET status = 'cancelled', updated_at = now() WHERE appointment_id = v_appt.id AND template LIKE 'appointment_reminder%' AND status IN ('pending','processing'); v_paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = v_appt.id AND status = 'captured'), 0); IF v_paid > 0 THEN v_refund := NULL; INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status) SELECT v_appt.id, 'doctor_elastic_availability', v_paid, p.currency, 'requested' FROM payments p WHERE p.appointment_id = v_appt.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING RETURNING id INTO v_refund; IF v_refund IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) SELECT v_refund, p.id, v_paid, 'refund/' || v_refund FROM payments p WHERE p.appointment_id = v_appt.id AND p.status = 'captured' ORDER BY p.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING; END IF; END IF; INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key) VALUES (v_appt.patient_id, v_appt.id, 'appointment_cancelled', 'Appointment cancelled by doctor', 'Your doctor changed availability and this appointment was cancelled. A full refund has been requested.', jsonb_build_object('old_start_at', v_appt.slot_start_at, 'old_end_at', v_appt.slot_end_at, 'reason', 'doctor_elastic_availability'), 'elastic-cancelled-patient/' || v_adjustment || '/' || v_appt.id) ON CONFLICT DO NOTHING; INSERT INTO availability_adjustment_items(adjustment_id, appointment_id, source_slot_id, action, old_start_at, old_end_at) VALUES (v_adjustment, v_appt.id, v_source.id, 'cancelled', v_appt.slot_start_at, v_appt.slot_end_at); v_cancelled := v_cancelled + 1;
      ELSE
        SELECT * INTO v_target FROM appointment_slots WHERE id = (v_assignment->>'target_slot_id')::uuid FOR UPDATE; IF NOT FOUND OR v_target.doctor_id <> v_doctor OR v_target.status <> 'available' OR v_target.slot_start_at <= now() OR v_target.allocated_count >= v_target.capacity OR extract(epoch FROM (v_target.slot_end_at - v_target.slot_start_at)) <> v_interval * 60 OR NOT EXISTS (SELECT 1 FROM availability_sessions target_session WHERE target_session.id = v_target.availability_session_id AND target_session.scheduling_type = 'wave' AND target_session.status = 'active') OR (v_target.availability_session_id = p_session_id AND (v_target.slot_start_at < v_new_start_at OR v_target.slot_end_at > v_new_end_at)) OR EXISTS (SELECT 1 FROM appointments x JOIN appointment_slots xs ON xs.id = x.slot_id WHERE x.patient_id = v_appt.patient_id AND x.status = 'confirmed' AND x.id <> v_appt.id AND xs.slot_start_at < v_target.slot_end_at AND xs.slot_end_at > v_target.slot_start_at) THEN RAISE EXCEPTION 'A selected destination is no longer available'; END IF; UPDATE appointment_slots SET allocated_count = allocated_count + 1, updated_at = now() WHERE id = v_target.id; INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (v_appt.id, v_appt.patient_id, v_doctor, v_target.id, 'reschedule', 'converted', now() + interval '100 years'); UPDATE slot_reservations SET status = 'released', updated_at = now() WHERE appointment_id = v_appt.id AND slot_id = v_source.id AND status = 'converted'; UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1), updated_at = now() WHERE id = v_source.id; UPDATE appointments SET slot_id = v_target.id, updated_at = now() WHERE id = v_appt.id; INSERT INTO availability_adjustment_items(adjustment_id, appointment_id, source_slot_id, target_slot_id, action, old_start_at, old_end_at, new_start_at, new_end_at) VALUES (v_adjustment, v_appt.id, v_source.id, v_target.id, 'moved', v_appt.slot_start_at, v_appt.slot_end_at, v_target.slot_start_at, v_target.slot_end_at); v_moved := v_moved + 1;
      END IF;
    END LOOP;
    UPDATE appointment_slots s SET status = 'cancelled', updated_at = now() WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at) AND s.allocated_count = 0;
  END IF;
  RETURN jsonb_build_object('adjustment_id', v_adjustment, 'classification', v_kind, 'moved', v_moved, 'cancelled', v_cancelled);
END;
$$;

REVOKE ALL ON FUNCTION public.preview_doctor_occurrence_adjustment(uuid, date, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_doctor_occurrence_adjustment(uuid, date, time, time, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_doctor_occurrence_adjustment(uuid, date, time, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_doctor_occurrence_adjustment(uuid, date, time, time, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.preview_doctor_occurrence_adjustment(
  p_session_id uuid, p_occurrence_date date, p_start_time time, p_end_time time
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid(); v_session record; v_timezone text; v_old_start time; v_old_end time;
  v_old_start_at timestamptz; v_old_end_at timestamptz; v_new_start_at timestamptz; v_new_end_at timestamptz;
  v_kind text; v_affected jsonb; v_appointments jsonb; v_candidates jsonb; v_interval integer;
  v_stream_min integer; v_stream_capacity integer; v_stream_slot uuid; v_retained jsonb; v_overflow jsonb;
BEGIN
  SELECT a.*, d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id WHERE a.id = p_session_id AND a.doctor_id = v_doctor AND a.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone := v_session.doctor_timezone;
  IF p_start_time IS NULL OR p_end_time IS NULL THEN RAISE EXCEPTION 'Choose a valid availability window'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_timezone)::date THEN RAISE EXCEPTION 'Only future occurrences can be edited'; END IF;
  IF v_session.kind = 'custom' AND v_session.session_date <> p_occurrence_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;
  SELECT COALESCE(o.start_time, v_session.start_time), COALESCE(o.end_time, v_session.end_time) INTO v_old_start, v_old_end FROM availability_occurrence_overrides o WHERE o.availability_session_id = p_session_id AND o.occurrence_date = p_occurrence_date;
  IF v_old_start IS NULL THEN v_old_start := v_session.start_time; v_old_end := v_session.end_time; END IF;
  IF p_end_time <= p_start_time OR p_start_time = v_old_start AND p_end_time = v_old_end THEN RAISE EXCEPTION 'Choose a different future window'; END IF;
  IF (p_start_time < v_old_start AND p_end_time < v_old_end) OR (p_start_time > v_old_start AND p_end_time > v_old_end) THEN RAISE EXCEPTION 'Use a pure shrink or pure expansion'; END IF;
  v_kind := CASE WHEN p_start_time <= v_old_start AND p_end_time >= v_old_end THEN 'expansion' ELSE 'shrink' END;
  v_interval := v_session.interval_minutes;
  IF v_session.scheduling_type = 'wave' AND ((extract(epoch FROM (p_start_time - v_old_start))::integer % (v_interval * 60) <> 0) OR (extract(epoch FROM (p_end_time - v_old_end))::integer % (v_interval * 60) <> 0)) THEN RAISE EXCEPTION 'Wave boundaries must align to the appointment duration'; END IF;
  v_old_start_at := (p_occurrence_date + v_old_start) AT TIME ZONE v_timezone; v_old_end_at := (p_occurrence_date + v_old_end) AT TIME ZONE v_timezone;
  v_new_start_at := (p_occurrence_date + p_start_time) AT TIME ZONE v_timezone; v_new_end_at := (p_occurrence_date + p_end_time) AT TIME ZONE v_timezone;
  IF v_new_start_at <= now() THEN RAISE EXCEPTION 'Availability must start in the future'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor AND s.availability_session_id <> p_session_id AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND s.slot_start_at < v_new_end_at AND s.slot_end_at > v_new_start_at) THEN RAISE EXCEPTION 'The new window overlaps another availability session'; END IF;
  IF v_session.scheduling_type = 'wave' THEN
    IF EXISTS (SELECT 1 FROM slot_reservations r JOIN appointment_slots s ON s.id = r.slot_id WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at) AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'allocated_count', s.allocated_count, 'capacity', s.capacity) ORDER BY s.slot_start_at), '[]'::jsonb) INTO v_affected FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('appointment_id', a.id, 'source_slot_id', s.id, 'patient_id', a.patient_id, 'patient_name', patient_profile.full_name, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'created_at', a.created_at) ORDER BY s.slot_start_at, a.created_at, a.id), '[]'::jsonb) INTO v_appointments FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN profiles patient_profile ON patient_profile.id = a.patient_id WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'remaining_capacity', s.capacity - s.allocated_count) ORDER BY s.slot_start_at), '[]'::jsonb) INTO v_candidates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor AND a.scheduling_type = 'wave' AND s.status = 'available' AND s.slot_start_at > now() AND s.allocated_count < s.capacity AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_affected) affected WHERE (affected->>'slot_id')::uuid = s.id) AND extract(epoch FROM (s.slot_end_at - s.slot_start_at)) = v_interval * 60;
    v_retained := '[]'::jsonb; v_overflow := '[]'::jsonb;
  ELSE
    v_stream_min := COALESCE(v_session.stream_min_patient_minutes, 10);
    v_stream_capacity := CASE WHEN v_kind = 'expansion' THEN v_session.capacity ELSE LEAST(v_session.capacity, FLOOR(EXTRACT(EPOCH FROM (v_new_end_at - v_new_start_at)) / 60 / v_stream_min)::integer) END;
    IF v_stream_capacity < 1 THEN RAISE EXCEPTION 'The new Stream window is shorter than its minimum consultation time'; END IF;
    IF EXISTS (SELECT 1 FROM slot_reservations r JOIN appointment_slots s ON s.id = r.slot_id WHERE s.availability_session_id = p_session_id AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
    SELECT s.id INTO v_stream_slot FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date ORDER BY s.slot_start_at LIMIT 1;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('appointment_id', a.id, 'source_slot_id', s.id, 'patient_id', a.patient_id, 'patient_name', patient_profile.full_name, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'created_at', a.created_at) ORDER BY a.created_at, a.id), '[]'::jsonb) INTO v_appointments FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN profiles patient_profile ON patient_profile.id = a.patient_id WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND s.id = v_stream_slot;
    WITH booked AS (SELECT jsonb_build_object('appointment_id', a.id, 'source_slot_id', s.id, 'patient_id', a.patient_id, 'patient_name', patient_profile.full_name, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'created_at', a.created_at) AS item, row_number() OVER (ORDER BY a.created_at, a.id) AS position FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN profiles patient_profile ON patient_profile.id = a.patient_id WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND s.id = v_stream_slot)
    SELECT COALESCE(jsonb_agg(item ORDER BY position) FILTER (WHERE position <= v_stream_capacity), '[]'::jsonb), COALESCE(jsonb_agg(item ORDER BY position) FILTER (WHERE position > v_stream_capacity), '[]'::jsonb) INTO v_retained, v_overflow FROM booked;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'remaining_capacity', s.capacity - s.allocated_count) ORDER BY s.slot_start_at, s.id), '[]'::jsonb) INTO v_candidates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor AND a.scheduling_type = 'stream' AND a.status = 'active' AND s.status = 'available' AND s.slot_start_at >= v_new_end_at AND s.slot_start_at > now() AND s.allocated_count < s.capacity AND s.id <> v_stream_slot;
    v_affected := '[]'::jsonb;
  END IF;
  RETURN jsonb_build_object('session_id', p_session_id, 'occurrence_date', p_occurrence_date, 'timezone', v_timezone, 'scheduling_type', v_session.scheduling_type, 'kind', v_session.kind, 'interval_minutes', v_interval, 'classification', v_kind, 'old_start_at', v_old_start_at, 'old_end_at', v_old_end_at, 'new_start_at', v_new_start_at, 'new_end_at', v_new_end_at, 'affected_slots', v_affected, 'appointments', v_appointments, 'candidates', v_candidates, 'stream_capacity', CASE WHEN v_session.scheduling_type = 'stream' THEN jsonb_build_object('minimum_patient_minutes', v_stream_min, 'original_capacity', v_session.capacity, 'reduced_capacity', v_stream_capacity, 'booked_count', jsonb_array_length(v_appointments), 'retained_count', jsonb_array_length(v_retained), 'overflow_count', jsonb_array_length(v_overflow)) ELSE NULL END, 'stream_retained_appointments', v_retained, 'stream_overflow_appointments', v_overflow);
END;
$$;

REVOKE ALL ON FUNCTION public.set_stream_min_patient_minutes(uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_stream_min_patient_minutes(uuid[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.materialize_recurring_availability_slots(p_doctor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule record; v_override_start time; v_override_end time; v_override_capacity integer; v_date date; v_start_time time; v_end_time time;
  v_start_at timestamptz; v_end_at timestamptz; v_slot_start timestamptz; v_slot_end timestamptz; v_today date;
BEGIN
  IF p_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM doctors WHERE id = p_doctor_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text, 0));
  FOR v_rule IN SELECT a.*, d.timezone AS doctor_timezone FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id WHERE a.doctor_id = p_doctor_id AND a.kind IN ('weekly','monthly') AND a.status = 'active' LOOP
    v_today := (now() AT TIME ZONE v_rule.doctor_timezone)::date;
    FOR v_date IN SELECT series_date::date FROM generate_series(v_rule.recurrence_start_date, v_rule.recurrence_end_date, interval '1 day') dates(series_date)
      WHERE series_date::date >= v_today
        AND ((v_rule.kind = 'weekly' AND extract(isodow FROM series_date) = v_rule.day_of_week)
          OR (v_rule.kind = 'monthly' AND ((v_rule.monthly_days IS NOT NULL AND extract(day FROM series_date)::integer = ANY(v_rule.monthly_days)) OR (v_rule.monthly_days IS NULL AND extract(day FROM series_date) BETWEEN extract(day FROM v_rule.recurrence_start_date) AND v_rule.monthly_range_end_day)))
        AND NOT EXISTS (SELECT 1 FROM availability_sessions custom WHERE custom.doctor_id = p_doctor_id AND custom.kind = 'custom' AND custom.status = 'active' AND custom.session_date = series_date::date)
        LOOP
      v_override_start := NULL; v_override_end := NULL; v_override_capacity := NULL;
      SELECT o.start_time, o.end_time, o.capacity INTO v_override_start, v_override_end, v_override_capacity FROM availability_occurrence_overrides o WHERE o.availability_session_id = v_rule.id AND o.occurrence_date = v_date;
      v_start_time := COALESCE(v_override_start, v_rule.start_time); v_end_time := COALESCE(v_override_end, v_rule.end_time);
      v_start_at := (v_date + v_start_time) AT TIME ZONE v_rule.timezone; v_end_at := (v_date + v_end_time) AT TIME ZONE v_rule.timezone;
      IF v_rule.scheduling_type = 'stream' THEN
        INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_rule.id, p_doctor_id, v_start_at, v_end_at, COALESCE(v_override_capacity, v_rule.capacity)) ON CONFLICT (availability_session_id, slot_start_at) DO UPDATE SET slot_end_at = EXCLUDED.slot_end_at, capacity = EXCLUDED.capacity, updated_at = now() WHERE appointment_slots.allocated_count = 0 AND appointment_slots.status = 'available';
      ELSE
        v_slot_start := v_start_at;
        WHILE v_slot_start + make_interval(mins => v_rule.interval_minutes) <= v_end_at LOOP
          v_slot_end := v_slot_start + make_interval(mins => v_rule.interval_minutes);
          INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_rule.id, p_doctor_id, v_slot_start, v_slot_end, v_rule.capacity) ON CONFLICT (availability_session_id, slot_start_at) DO NOTHING;
          v_slot_start := v_slot_end;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
