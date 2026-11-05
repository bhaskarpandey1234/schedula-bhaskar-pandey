-- Finite recurrence for weekly and monthly Wave/Stream availability.
ALTER TYPE public.availability_session_kind ADD VALUE IF NOT EXISTS 'monthly';--> statement-breakpoint

ALTER TABLE public.availability_sessions
  ADD COLUMN IF NOT EXISTS recurrence_start_date date,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS monthly_range_end_day integer;--> statement-breakpoint

UPDATE public.availability_sessions a
SET recurrence_start_date = (a.created_at AT TIME ZONE d.timezone)::date,
    recurrence_end_date = ((a.created_at AT TIME ZONE d.timezone)::date + 29)
FROM public.doctors d
WHERE a.doctor_id = d.id AND a.kind = 'weekly' AND a.recurrence_start_date IS NULL;--> statement-breakpoint

ALTER TABLE public.availability_sessions
  DROP CONSTRAINT IF EXISTS availability_sessions_kind_selector,
  ADD CONSTRAINT availability_sessions_kind_selector CHECK (
    (kind = 'weekly' AND day_of_week BETWEEN 1 AND 7 AND session_date IS NULL AND session_start_at IS NULL AND session_end_at IS NULL)
    OR (kind = 'monthly' AND day_of_week IS NULL AND session_date IS NULL AND session_start_at IS NULL AND session_end_at IS NULL)
    OR (kind = 'custom' AND day_of_week IS NULL AND session_date IS NOT NULL AND session_start_at IS NOT NULL AND session_end_at IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS availability_sessions_recurrence_bounds,
  ADD CONSTRAINT availability_sessions_recurrence_bounds CHECK (
    (kind = 'custom' AND recurrence_start_date IS NULL AND recurrence_end_date IS NULL AND monthly_range_end_day IS NULL)
    OR (kind = 'weekly' AND recurrence_start_date IS NOT NULL AND recurrence_end_date IS NOT NULL AND monthly_range_end_day IS NULL AND recurrence_end_date >= recurrence_start_date)
    OR (kind = 'monthly' AND recurrence_start_date IS NOT NULL AND recurrence_end_date IS NOT NULL AND monthly_range_end_day BETWEEN 1 AND 31 AND recurrence_end_date >= recurrence_start_date)
  );--> statement-breakpoint

UPDATE public.appointment_slots s
SET status = 'cancelled'
FROM public.availability_sessions a
WHERE a.id = s.availability_session_id AND a.kind = 'weekly'
  AND a.recurrence_end_date IS NOT NULL
  AND s.allocated_count = 0
  AND (s.slot_start_at AT TIME ZONE a.timezone)::date > a.recurrence_end_date;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.materialize_recurring_availability_slots(p_doctor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule record; v_date date; v_start_at timestamptz; v_end_at timestamptz;
  v_slot_start timestamptz; v_slot_end timestamptz; v_today date;
BEGIN
  IF p_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM doctors WHERE id = p_doctor_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text, 0));
  FOR v_rule IN SELECT a.*, d.timezone AS doctor_timezone FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.doctor_id = p_doctor_id AND a.kind IN ('weekly', 'monthly') AND a.status = 'active' LOOP
    v_today := (now() AT TIME ZONE v_rule.doctor_timezone)::date;
    FOR v_date IN SELECT series_date::date FROM generate_series(v_rule.recurrence_start_date, v_rule.recurrence_end_date, interval '1 day') AS dates(series_date)
      WHERE series_date::date >= v_today
        AND ((v_rule.kind = 'weekly' AND extract(isodow FROM series_date) = v_rule.day_of_week)
          OR (v_rule.kind = 'monthly' AND extract(day FROM series_date) BETWEEN extract(day FROM v_rule.recurrence_start_date) AND v_rule.monthly_range_end_day))
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

DROP FUNCTION IF EXISTS public.create_weekly_availability_with_slots(integer[], time, time, text, integer, integer, availability_scheduling_type);
CREATE OR REPLACE FUNCTION public.create_weekly_availability_with_slots(
  p_consulting_days integer[], p_recurrence_start_date date, p_recurrence_end_date date,
  p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_day integer; v_ids uuid[] := ARRAY[]::uuid[]; v_id uuid;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_consulting_days IS NULL OR cardinality(p_consulting_days) = 0 OR EXISTS (SELECT 1 FROM unnest(p_consulting_days) day WHERE day NOT BETWEEN 1 AND 7) THEN RAISE EXCEPTION 'Choose at least one valid consulting day'; END IF;
  IF p_recurrence_end_date < p_recurrence_start_date OR p_recurrence_end_date > (p_recurrence_start_date + 366) OR p_recurrence_start_date < (now() AT TIME ZONE v_doctor_timezone)::date THEN RAISE EXCEPTION 'Recurrence dates must be future and within 12 months'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  FOREACH v_day IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(p_consulting_days) ORDER BY 1)) LOOP
    IF EXISTS (SELECT 1 FROM availability_sessions a WHERE a.doctor_id = v_doctor_id AND a.status = 'active' AND a.kind = 'weekly' AND a.day_of_week = v_day AND a.start_time < p_end_time AND a.end_time > p_start_time AND daterange(a.recurrence_start_date, a.recurrence_end_date, '[]') && daterange(p_recurrence_start_date, p_recurrence_end_date, '[]')) THEN RAISE EXCEPTION 'Availability overlaps an existing session'; END IF;
    IF EXISTS (SELECT 1 FROM availability_sessions a WHERE a.doctor_id = v_doctor_id AND a.status = 'active' AND a.kind = 'monthly' AND a.start_time < p_end_time AND a.end_time > p_start_time AND EXISTS (SELECT 1 FROM generate_series(GREATEST(a.recurrence_start_date, p_recurrence_start_date), LEAST(a.recurrence_end_date, p_recurrence_end_date), interval '1 day') d WHERE extract(isodow FROM d) = v_day AND extract(day FROM d) BETWEEN extract(day FROM a.recurrence_start_date) AND a.monthly_range_end_day)) THEN RAISE EXCEPTION 'Availability overlaps an existing session'; END IF;
    INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, day_of_week, recurrence_start_date, recurrence_end_date, start_time, end_time, timezone, interval_minutes, capacity)
      VALUES (v_doctor_id, 'weekly', p_scheduling_type, v_day, p_recurrence_start_date, p_recurrence_end_date, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity) RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  PERFORM public.materialize_recurring_availability_slots(v_doctor_id); RETURN v_ids;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_monthly_availability_with_slots(
  p_recurrence_start_date date, p_recurrence_end_date date, p_monthly_range_end_day integer,
  p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_id uuid;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_monthly_range_end_day NOT BETWEEN 1 AND 31 OR p_monthly_range_end_day < extract(day FROM p_recurrence_start_date) OR p_recurrence_end_date < p_recurrence_start_date OR p_recurrence_end_date > (p_recurrence_start_date + 366) OR p_recurrence_start_date < (now() AT TIME ZONE v_doctor_timezone)::date THEN RAISE EXCEPTION 'Invalid monthly recurrence dates'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  IF EXISTS (SELECT 1 FROM availability_sessions a WHERE a.doctor_id = v_doctor_id AND a.status = 'active' AND a.kind IN ('weekly', 'monthly') AND a.start_time < p_end_time AND a.end_time > p_start_time AND EXISTS (SELECT 1 FROM generate_series(GREATEST(a.recurrence_start_date, p_recurrence_start_date), LEAST(a.recurrence_end_date, p_recurrence_end_date), interval '1 day') d WHERE (a.kind = 'weekly' AND extract(isodow FROM d) = a.day_of_week AND extract(day FROM d) BETWEEN extract(day FROM p_recurrence_start_date) AND p_monthly_range_end_day) OR (a.kind = 'monthly' AND extract(day FROM d) BETWEEN extract(day FROM a.recurrence_start_date) AND a.monthly_range_end_day AND extract(day FROM d) BETWEEN extract(day FROM p_recurrence_start_date) AND p_monthly_range_end_day))) THEN RAISE EXCEPTION 'Availability overlaps an existing session'; END IF;
  INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, recurrence_start_date, recurrence_end_date, monthly_range_end_day, start_time, end_time, timezone, interval_minutes, capacity)
    VALUES (v_doctor_id, 'monthly', p_scheduling_type, p_recurrence_start_date, p_recurrence_end_date, p_monthly_range_end_day, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity) RETURNING id INTO v_id;
  PERFORM public.materialize_recurring_availability_slots(v_doctor_id); RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_custom_availability_with_slots(
  p_session_date date, p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_session_id uuid; v_start_at timestamptz; v_end_at timestamptz; v_slot_start timestamptz; v_slot_end timestamptz;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  v_start_at := (p_session_date + p_start_time) AT TIME ZONE v_doctor_timezone; v_end_at := (p_session_date + p_end_time) AT TIME ZONE v_doctor_timezone;
  IF p_end_time <= p_start_time OR v_start_at <= now() THEN RAISE EXCEPTION 'Availability must start in the future'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE doctor_id = v_doctor_id AND kind = 'custom' AND status = 'active' AND session_date = p_session_date AND session_start_at < v_end_at AND session_end_at > v_start_at) THEN RAISE EXCEPTION 'Availability overlaps an existing custom session'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = v_doctor_id AND a.kind IN ('weekly', 'monthly') AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count > 0) THEN RAISE EXCEPTION 'Cannot replace recurring availability with existing bookings'; END IF;
  UPDATE appointment_slots s SET status = 'cancelled' FROM availability_sessions a WHERE a.id = s.availability_session_id AND a.doctor_id = v_doctor_id AND a.kind IN ('weekly', 'monthly') AND a.status = 'active' AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count = 0;
  INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at)
    VALUES (v_doctor_id, 'custom', p_scheduling_type, p_session_date, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity, v_start_at, v_end_at) RETURNING id INTO v_session_id;
  IF p_scheduling_type = 'stream' THEN INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_session_id, v_doctor_id, v_start_at, v_end_at, p_capacity);
  ELSE v_slot_start := v_start_at; WHILE v_slot_start + make_interval(mins => p_interval_minutes) <= v_end_at LOOP v_slot_end := v_slot_start + make_interval(mins => p_interval_minutes); INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity) VALUES (v_session_id, v_doctor_id, v_slot_start, v_slot_end, p_capacity); v_slot_start := v_slot_end; END LOOP; END IF;
  RETURN v_session_id;
END;
$$;--> statement-breakpoint

DROP FUNCTION IF EXISTS public.create_availability_session_with_slots(date, time, time, text, integer, integer, availability_scheduling_type);
CREATE OR REPLACE FUNCTION public.create_availability_session_with_slots(p_session_date date, p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN public.create_custom_availability_with_slots(p_session_date, p_start_time, p_end_time, p_timezone, p_interval_minutes, p_capacity, p_scheduling_type); END; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_directory(p_search text DEFAULT NULL, p_specialty text DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, available_dates date[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid;
BEGIN
  FOR v_doctor_id IN SELECT d.id FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL LOOP PERFORM public.materialize_recurring_availability_slots(v_doctor_id); END LOOP;
  RETURN QUERY SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, COALESCE(availability.available_dates, ARRAY[]::date[])
  FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LEFT JOIN LATERAL (SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = d.id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.allocated_count < s.capacity) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%') AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty)) ORDER BY cardinality(COALESCE(availability.available_dates, ARRAY[])) DESC, p.full_name;
END; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR' ORDER BY s.slot_start_at; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.require_patient_directory_access(); RETURN QUERY SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR' ORDER BY s.slot_start_at; END; $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text, scheduling_type availability_scheduling_type)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN PERFORM public.require_patient_directory_access(); RETURN QUERY SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency, a.scheduling_type FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' WHERE s.id = p_slot_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR'; END; $$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_weekly_availability_with_slots(integer[], date, date, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_monthly_availability_with_slots(date, date, integer, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_availability_with_slots(date, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_availability_slots(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
