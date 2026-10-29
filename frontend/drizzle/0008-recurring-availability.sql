CREATE TYPE public.availability_session_kind AS ENUM ('weekly', 'custom');--> statement-breakpoint
ALTER TABLE public.availability_sessions
  ALTER COLUMN session_date DROP NOT NULL,
  ALTER COLUMN session_start_at DROP NOT NULL,
  ALTER COLUMN session_end_at DROP NOT NULL;--> statement-breakpoint
ALTER TABLE public.availability_sessions
  ADD COLUMN kind public.availability_session_kind NOT NULL DEFAULT 'custom',
  ADD COLUMN day_of_week integer;--> statement-breakpoint
ALTER TABLE public.availability_sessions
  ADD CONSTRAINT availability_sessions_kind_selector CHECK (
    (kind = 'weekly' AND day_of_week BETWEEN 1 AND 7 AND session_date IS NULL AND session_start_at IS NULL AND session_end_at IS NULL)
    OR (kind = 'custom' AND day_of_week IS NULL AND session_date IS NOT NULL AND session_start_at IS NOT NULL AND session_end_at IS NOT NULL)
  );--> statement-breakpoint
CREATE INDEX availability_sessions_doctor_weekday_idx ON public.availability_sessions (doctor_id, day_of_week) WHERE kind = 'weekly' AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX appointment_slots_session_start_unique ON public.appointment_slots (availability_session_id, slot_start_at);--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.materialize_recurring_availability_slots(p_doctor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule record;
  v_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
BEGIN
  IF p_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM doctors WHERE id = p_doctor_id) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text, 0));
  FOR v_rule IN SELECT a.*, d.timezone AS doctor_timezone
    FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.doctor_id = p_doctor_id AND a.kind = 'weekly' AND a.status = 'active'
  LOOP
    FOR v_date IN
      SELECT series_date::date
      FROM generate_series(
        ((now() AT TIME ZONE v_rule.doctor_timezone)::date),
        ((now() AT TIME ZONE v_rule.doctor_timezone)::date + 29),
        interval '1 day'
      ) AS dates(series_date)
      WHERE extract(isodow FROM series_date) = v_rule.day_of_week
        AND NOT EXISTS (
          SELECT 1 FROM availability_sessions custom
          WHERE custom.doctor_id = p_doctor_id AND custom.kind = 'custom'
            AND custom.status = 'active' AND custom.session_date = series_date::date
        )
    LOOP
      v_start_at := (v_date + v_rule.start_time) AT TIME ZONE v_rule.timezone;
      v_end_at := (v_date + v_rule.end_time) AT TIME ZONE v_rule.timezone;
      v_slot_start := v_start_at;
      WHILE v_slot_start + make_interval(mins => v_rule.interval_minutes) <= v_end_at LOOP
        v_slot_end := v_slot_start + make_interval(mins => v_rule.interval_minutes);
        INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
        VALUES (v_rule.id, p_doctor_id, v_slot_start, v_slot_end, v_rule.capacity)
        ON CONFLICT (availability_session_id, slot_start_at) DO NOTHING;
        v_slot_start := v_slot_end;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_weekly_availability_with_slots(
  p_consulting_days integer[], p_start_time time, p_end_time time, p_timezone text,
  p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor_id uuid := auth.uid();
  v_doctor_timezone text;
  v_day integer;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_consulting_days IS NULL OR cardinality(p_consulting_days) = 0 OR EXISTS (SELECT 1 FROM unnest(p_consulting_days) day WHERE day NOT BETWEEN 1 AND 7) THEN RAISE EXCEPTION 'Choose at least one valid consulting day'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  IF p_interval_minutes NOT IN (15, 30, 60) OR p_capacity NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid interval or capacity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  FOREACH v_day IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(p_consulting_days) ORDER BY 1)) LOOP
    IF EXISTS (SELECT 1 FROM availability_sessions a WHERE a.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active' AND a.day_of_week = v_day AND a.start_time < p_end_time AND a.end_time > p_start_time) THEN
      RAISE EXCEPTION 'Availability overlaps an existing weekly session';
    END IF;
    INSERT INTO availability_sessions (doctor_id, kind, day_of_week, start_time, end_time, timezone, interval_minutes, capacity)
    VALUES (v_doctor_id, 'weekly', v_day, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity)
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  PERFORM public.materialize_recurring_availability_slots(v_doctor_id);
  RETURN v_ids;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_custom_availability_with_slots(
  p_session_date date, p_start_time time, p_end_time time, p_timezone text,
  p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor_id uuid := auth.uid();
  v_doctor_timezone text;
  v_session_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  IF p_interval_minutes NOT IN (15, 30, 60) OR p_capacity NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid interval or capacity'; END IF;
  v_start_at := (p_session_date + p_start_time) AT TIME ZONE v_doctor_timezone;
  v_end_at := (p_session_date + p_end_time) AT TIME ZONE v_doctor_timezone;
  IF p_end_time <= p_start_time OR v_start_at <= now() THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE doctor_id = v_doctor_id AND kind = 'custom' AND status = 'active' AND session_date = p_session_date AND session_start_at < v_end_at AND session_end_at > v_start_at) THEN RAISE EXCEPTION 'Availability overlaps an existing custom session'; END IF;
  IF EXISTS (
    SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active'
      AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count > 0
  ) THEN RAISE EXCEPTION 'Cannot replace recurring availability with existing bookings'; END IF;
  UPDATE appointment_slots s SET status = 'cancelled'
  FROM availability_sessions a
  WHERE a.id = s.availability_session_id AND a.doctor_id = v_doctor_id AND a.kind = 'weekly' AND a.status = 'active'
    AND (s.slot_start_at AT TIME ZONE v_doctor_timezone)::date = p_session_date AND s.allocated_count = 0;
  INSERT INTO availability_sessions (doctor_id, kind, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at)
  VALUES (v_doctor_id, 'custom', p_session_date, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity, v_start_at, v_end_at)
  RETURNING id INTO v_session_id;
  v_slot_start := v_start_at;
  WHILE v_slot_start + make_interval(mins => p_interval_minutes) <= v_end_at LOOP
    v_slot_end := v_slot_start + make_interval(mins => p_interval_minutes);
    INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
    VALUES (v_session_id, v_doctor_id, v_slot_start, v_slot_end, p_capacity);
    v_slot_start := v_slot_end;
  END LOOP;
  RETURN v_session_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_availability_session_with_slots(p_session_date date, p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30, p_capacity integer DEFAULT 3)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN public.create_custom_availability_with_slots(p_session_date, p_start_time, p_end_time, p_timezone, p_interval_minutes, p_capacity);
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.materialize_recurring_availability_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_weekly_availability_with_slots(integer[], time, time, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_custom_availability_with_slots(date, time, time, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_availability_session_with_slots(date, time, time, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_weekly_availability_with_slots(integer[], time, time, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_availability_with_slots(date, time, time, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_availability_session_with_slots(date, time, time, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_availability_slots(uuid) TO authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_directory(p_search text DEFAULT NULL, p_specialty text DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, available_dates date[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid;
BEGIN
  FOR v_doctor_id IN SELECT d.id FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL LOOP
    PERFORM public.materialize_recurring_availability_slots(v_doctor_id);
  END LOOP;
  RETURN QUERY SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years,
    COALESCE(availability.available_dates, ARRAY[]::date[])
  FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LEFT JOIN LATERAL (SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = d.id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%') AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY cardinality(COALESCE(availability.available_dates, ARRAY[]::date[])) DESC, p.full_name;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.materialize_recurring_availability_slots(p_doctor_id);
  RETURN QUERY SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity ORDER BY s.slot_start_at;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  PERFORM public.materialize_recurring_availability_slots(p_doctor_id);
  RETURN QUERY SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count
  FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id
  WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active'
    AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity
  ORDER BY s.slot_start_at;
END;
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.public_doctor_directory(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_slots(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_slots(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
