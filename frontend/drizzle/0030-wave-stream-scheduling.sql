-- Wave and Stream scheduling. Existing rows remain Wave.
DO $$ BEGIN
  CREATE TYPE public.availability_scheduling_type AS ENUM ('wave', 'stream');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE public.availability_sessions
  ADD COLUMN IF NOT EXISTS scheduling_type public.availability_scheduling_type NOT NULL DEFAULT 'wave',
  ALTER COLUMN interval_minutes DROP NOT NULL;--> statement-breakpoint

ALTER TABLE public.availability_sessions
  DROP CONSTRAINT IF EXISTS availability_sessions_scheduling_type_interval,
  ADD CONSTRAINT availability_sessions_scheduling_type_interval CHECK (
    (scheduling_type = 'wave' AND interval_minutes IN (15, 30, 60))
    OR (scheduling_type = 'stream' AND interval_minutes IS NULL)
  );--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.materialize_recurring_availability_slots(p_doctor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule record; v_date date; v_start_at timestamptz; v_end_at timestamptz;
  v_slot_start timestamptz; v_slot_end timestamptz;
BEGIN
  IF p_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM doctors WHERE id = p_doctor_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text, 0));
  FOR v_rule IN SELECT a.*, d.timezone AS doctor_timezone FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.doctor_id = p_doctor_id AND a.kind = 'weekly' AND a.status = 'active' LOOP
    FOR v_date IN SELECT series_date::date FROM generate_series(
      ((now() AT TIME ZONE v_rule.doctor_timezone)::date), ((now() AT TIME ZONE v_rule.doctor_timezone)::date + 29), interval '1 day'
    ) AS dates(series_date) WHERE extract(isodow FROM series_date) = v_rule.day_of_week
      AND NOT EXISTS (SELECT 1 FROM availability_sessions custom WHERE custom.doctor_id = p_doctor_id AND custom.kind = 'custom' AND custom.status = 'active' AND custom.session_date = series_date::date) LOOP
      v_start_at := (v_date + v_rule.start_time) AT TIME ZONE v_rule.timezone;
      v_end_at := (v_date + v_rule.end_time) AT TIME ZONE v_rule.timezone;
      IF v_rule.scheduling_type = 'stream' THEN
        INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
        VALUES (v_rule.id, p_doctor_id, v_start_at, v_end_at, v_rule.capacity)
        ON CONFLICT (availability_session_id, slot_start_at) DO NOTHING;
      ELSE
        v_slot_start := v_start_at;
        WHILE v_slot_start + make_interval(mins => v_rule.interval_minutes) <= v_end_at LOOP
          v_slot_end := v_slot_start + make_interval(mins => v_rule.interval_minutes);
          INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
          VALUES (v_rule.id, p_doctor_id, v_slot_start, v_slot_end, v_rule.capacity)
          ON CONFLICT (availability_session_id, slot_start_at) DO NOTHING;
          v_slot_start := v_slot_end;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.create_weekly_availability_with_slots(integer[], time, time, text, integer, integer);
CREATE OR REPLACE FUNCTION public.create_weekly_availability_with_slots(
  p_consulting_days integer[], p_start_time time, p_end_time time, p_timezone text,
  p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3,
  p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_day integer; v_ids uuid[] := ARRAY[]::uuid[]; v_id uuid;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_consulting_days IS NULL OR cardinality(p_consulting_days) = 0 OR EXISTS (SELECT 1 FROM unnest(p_consulting_days) day WHERE day NOT BETWEEN 1 AND 7) THEN RAISE EXCEPTION 'Choose at least one valid consulting day'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  FOREACH v_day IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(p_consulting_days) ORDER BY 1)) LOOP
    IF EXISTS (SELECT 1 FROM availability_sessions a WHERE a.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active' AND a.day_of_week = v_day AND a.start_time < p_end_time AND a.end_time > p_start_time) THEN RAISE EXCEPTION 'Availability overlaps an existing weekly session'; END IF;
    INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, day_of_week, start_time, end_time, timezone, interval_minutes, capacity)
      VALUES (v_doctor_id, 'weekly', p_scheduling_type, v_day, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity) RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  PERFORM public.materialize_recurring_availability_slots(v_doctor_id); RETURN v_ids;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.create_custom_availability_with_slots(date, time, time, text, integer, integer);
CREATE OR REPLACE FUNCTION public.create_custom_availability_with_slots(
  p_session_date date, p_start_time time, p_end_time time, p_timezone text,
  p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3,
  p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_session_id uuid; v_start_at timestamptz; v_end_at timestamptz; v_slot_start timestamptz; v_slot_end timestamptz;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  v_start_at := (p_session_date + p_start_time) AT TIME ZONE v_doctor_timezone; v_end_at := (p_session_date + p_end_time) AT TIME ZONE v_doctor_timezone;
  IF p_end_time <= p_start_time OR v_start_at <= now() THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE doctor_id = v_doctor_id AND kind = 'custom' AND status = 'active' AND session_date = p_session_date AND session_start_at < v_end_at AND session_end_at > v_start_at) THEN RAISE EXCEPTION 'Availability overlaps an existing custom session'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count > 0) THEN RAISE EXCEPTION 'Cannot replace recurring availability with existing bookings'; END IF;
  UPDATE appointment_slots s SET status = 'cancelled' FROM availability_sessions a WHERE a.id = s.availability_session_id AND a.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count = 0;
  INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at)
    VALUES (v_doctor_id, 'custom', p_scheduling_type, p_session_date, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity, v_start_at, v_end_at) RETURNING id INTO v_session_id;
  IF p_scheduling_type = 'stream' THEN
    INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_session_id, v_doctor_id, v_start_at, v_end_at, p_capacity);
  ELSE
    v_slot_start := v_start_at;
    WHILE v_slot_start + make_interval(mins => p_interval_minutes) <= v_end_at LOOP
      v_slot_end := v_slot_start + make_interval(mins => p_interval_minutes);
      INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_session_id, v_doctor_id, v_slot_start, v_slot_end, p_capacity);
      v_slot_start := v_slot_end;
    END LOOP;
  END IF;
  RETURN v_session_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.create_availability_session_with_slots(date, time, time, text, integer, integer);
CREATE OR REPLACE FUNCTION public.create_availability_session_with_slots(p_session_date date, p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN public.create_custom_availability_with_slots(p_session_date, p_start_time, p_end_time, p_timezone, p_interval_minutes, p_capacity, p_scheduling_type); END; $$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.public_doctor_slots(uuid);
CREATE OR REPLACE FUNCTION public.public_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR' ORDER BY s.slot_start_at;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.patient_doctor_slots(uuid);
CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.require_patient_directory_access(); RETURN QUERY SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR' ORDER BY s.slot_start_at; END; $$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.patient_bookable_slot(uuid);
CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.require_patient_directory_access(); RETURN QUERY SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' WHERE s.id = p_slot_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR'; END; $$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.patient_appointment_confirmation(uuid);
CREATE OR REPLACE FUNCTION public.patient_appointment_confirmation(p_appointment_id uuid)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type, notification_title text, notification_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view appointment confirmations'; END IF;
  RETURN QUERY SELECT a.id, a.status, a.reason, p.full_name, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, av.scheduling_type, n.title, n.message FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' JOIN appointment_slots s ON s.id = a.slot_id JOIN availability_sessions av ON av.id = s.availability_session_id LEFT JOIN notifications n ON n.appointment_id = a.id AND n.recipient_id = auth.uid() WHERE a.id = p_appointment_id AND a.patient_id = auth.uid();
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.patient_appointments(text);
CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type, payment_status payment_status, payment_amount_minor integer, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view appointments'; END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, av.scheduling_type, payment.status, payment.amount_minor, refund.status, refund.amount_minor FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN profiles doctor_profile ON doctor_profile.id = d.id AND doctor_profile.role = 'doctor' JOIN appointment_slots s ON s.id = a.slot_id JOIN availability_sessions av ON av.id = s.availability_session_id LEFT JOIN LATERAL (SELECT p.status, p.amount_minor FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1) payment ON true LEFT JOIN LATERAL (SELECT rr.status, sum(r.amount_minor)::integer AS amount_minor FROM refund_requests rr JOIN refunds r ON r.request_id = rr.id WHERE rr.appointment_id = a.id GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1) refund ON true WHERE a.patient_id = auth.uid() AND ((p_tab = 'upcoming' AND a.status = 'confirmed' AND s.slot_end_at >= now()) OR (p_tab = 'past' AND a.status = 'confirmed' AND s.slot_end_at < now()) OR (p_tab = 'cancelled' AND a.status = 'cancelled')) ORDER BY s.slot_start_at DESC;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.doctor_schedule_appointments(text);
CREATE OR REPLACE FUNCTION public.doctor_schedule_appointments(p_session_date text)
RETURNS TABLE(appointment_id uuid, slot_id uuid, patient_name text, status appointment_status, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can view schedule appointments'; END IF;
  IF p_session_date <> 'all' AND p_session_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid schedule date'; END IF;
  RETURN QUERY SELECT a.id, s.id, patient_profile.full_name, a.status, s.slot_start_at, s.slot_end_at, av.scheduling_type FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN availability_sessions av ON av.id = s.availability_session_id JOIN doctors d ON d.id = a.doctor_id JOIN profiles patient_profile ON patient_profile.id = a.patient_id AND patient_profile.role = 'patient' WHERE a.doctor_id = auth.uid() AND (p_session_date = 'all' OR (s.slot_start_at AT TIME ZONE d.timezone)::date = p_session_date::date) ORDER BY s.slot_start_at, patient_profile.full_name;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.notification_delivery_context(uuid);
CREATE FUNCTION public.notification_delivery_context(p_delivery_id uuid)
RETURNS TABLE(recipient_id uuid, patient_id uuid, doctor_id uuid, email text, phone text, recipient_name text, recipient_role text, patient_name text, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
  SELECT delivery.recipient_id, appointment.patient_id, appointment.doctor_id, u.email, COALESCE(recipient_patient.phone, recipient_doctor.phone), COALESCE(recipient_profile.full_name, 'Schedula user'), recipient_profile.role::text, COALESCE(patient_profile.full_name, 'Patient'), doctor_profile.full_name, doctor.clinic_name, doctor.timezone, slot.slot_start_at, slot.slot_end_at, av.scheduling_type
  FROM public.notification_deliveries delivery JOIN public.appointments appointment ON appointment.id = delivery.appointment_id JOIN public.appointment_slots slot ON slot.id = appointment.slot_id JOIN public.availability_sessions av ON av.id = slot.availability_session_id JOIN public.doctors doctor ON doctor.id = appointment.doctor_id JOIN public.profiles doctor_profile ON doctor_profile.id = doctor.id JOIN public.profiles patient_profile ON patient_profile.id = appointment.patient_id JOIN public.profiles recipient_profile ON recipient_profile.id = delivery.recipient_id LEFT JOIN public.patients recipient_patient ON recipient_patient.id = delivery.recipient_id LEFT JOIN public.doctors recipient_doctor ON recipient_doctor.id = delivery.recipient_id LEFT JOIN auth.users u ON u.id = delivery.recipient_id WHERE delivery.id = p_delivery_id;
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_weekly_availability_with_slots(integer[], time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_availability_with_slots(date, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_availability_session_with_slots(date, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_slots(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_slots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_bookable_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_appointment_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_schedule_appointments(text) TO authenticated;
REVOKE ALL ON FUNCTION public.notification_delivery_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_delivery_context(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
