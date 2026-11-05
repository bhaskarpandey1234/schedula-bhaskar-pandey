-- Monthly selected day numbers and atomic multi-date one-time availability.
ALTER TABLE public.availability_sessions
  ADD COLUMN IF NOT EXISTS monthly_days integer[];--> statement-breakpoint

ALTER TABLE public.availability_sessions
  DROP CONSTRAINT IF EXISTS availability_sessions_recurrence_bounds,
  ADD CONSTRAINT availability_sessions_recurrence_bounds CHECK (
    (kind = 'custom' AND recurrence_start_date IS NULL AND recurrence_end_date IS NULL AND monthly_range_end_day IS NULL AND monthly_days IS NULL)
    OR (kind = 'weekly' AND recurrence_start_date IS NOT NULL AND recurrence_end_date IS NOT NULL AND monthly_range_end_day IS NULL AND monthly_days IS NULL AND recurrence_end_date >= recurrence_start_date)
    OR (kind = 'monthly' AND recurrence_start_date IS NOT NULL AND recurrence_end_date IS NOT NULL AND ((monthly_days IS NOT NULL AND cardinality(monthly_days) > 0 AND monthly_range_end_day IS NULL) OR (monthly_days IS NULL AND monthly_range_end_day BETWEEN 1 AND 31)) AND recurrence_end_date >= recurrence_start_date)
  );--> statement-breakpoint

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
          OR (v_rule.kind = 'monthly' AND ((v_rule.monthly_days IS NOT NULL AND extract(day FROM series_date)::integer = ANY(v_rule.monthly_days)) OR (v_rule.monthly_days IS NULL AND extract(day FROM series_date) BETWEEN extract(day FROM v_rule.recurrence_start_date) AND v_rule.monthly_range_end_day))))
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

CREATE OR REPLACE FUNCTION public.create_monthly_availability_with_days(
  p_monthly_days integer[], p_recurrence_start_date date, p_recurrence_end_date date,
  p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid := auth.uid(); v_doctor_timezone text; v_id uuid; v_days integer[];
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can create availability'; END IF;
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = v_doctor_id;
  v_days := ARRAY(SELECT DISTINCT value FROM unnest(p_monthly_days) AS input_days(value) ORDER BY value);
  IF cardinality(v_days) = 0 OR EXISTS (SELECT 1 FROM unnest(v_days) value WHERE value NOT BETWEEN 1 AND 31) THEN RAISE EXCEPTION 'Choose at least one valid monthly date'; END IF;
  IF p_recurrence_end_date < p_recurrence_start_date OR p_recurrence_end_date > (p_recurrence_start_date + 366) OR p_recurrence_start_date < (now() AT TIME ZONE v_doctor_timezone)::date THEN RAISE EXCEPTION 'Recurrence dates must be future and within 12 months'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be a future, same-day window'; END IF;
  IF p_capacity NOT BETWEEN 1 AND 10 OR (p_scheduling_type = 'wave' AND p_interval_minutes NOT IN (15, 30, 60)) OR (p_scheduling_type = 'stream' AND p_interval_minutes IS NOT NULL) THEN RAISE EXCEPTION 'Invalid scheduling type, interval, or capacity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM availability_sessions a
    WHERE a.doctor_id = v_doctor_id AND a.status = 'active' AND a.kind IN ('weekly', 'monthly')
      AND a.start_time < p_end_time AND a.end_time > p_start_time
      AND EXISTS (SELECT 1 FROM generate_series(GREATEST(a.recurrence_start_date, p_recurrence_start_date), LEAST(a.recurrence_end_date, p_recurrence_end_date), interval '1 day') AS overlap_dates(d)
        WHERE (a.kind = 'weekly' AND extract(isodow FROM d)::integer = ANY(v_days))
           OR (a.kind = 'monthly' AND ((a.monthly_days IS NOT NULL AND extract(day FROM d)::integer = ANY(a.monthly_days)) OR (a.monthly_days IS NULL AND extract(day FROM d) BETWEEN extract(day FROM a.recurrence_start_date) AND a.monthly_range_end_day)))
      )
  ) THEN RAISE EXCEPTION 'Availability overlaps an existing session'; END IF;
  INSERT INTO availability_sessions (doctor_id, kind, scheduling_type, monthly_days, recurrence_start_date, recurrence_end_date, start_time, end_time, timezone, interval_minutes, capacity)
    VALUES (v_doctor_id, 'monthly', p_scheduling_type, v_days, p_recurrence_start_date, p_recurrence_end_date, p_start_time, p_end_time, v_doctor_timezone, p_interval_minutes, p_capacity) RETURNING id INTO v_id;
  PERFORM public.materialize_recurring_availability_slots(v_doctor_id); RETURN v_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.create_specific_date_availability_with_slots(
  p_session_dates date[], p_start_time time, p_end_time time, p_timezone text, p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3, p_scheduling_type public.availability_scheduling_type DEFAULT 'wave'
) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_timezone text; v_date date; v_ids uuid[] := ARRAY[]::uuid[]; v_id uuid; v_dates date[];
BEGIN
  SELECT timezone INTO v_doctor_timezone FROM doctors WHERE id = auth.uid();
  v_dates := ARRAY(SELECT DISTINCT value FROM unnest(p_session_dates) AS input_dates(value) ORDER BY value);
  IF cardinality(v_dates) = 0 OR cardinality(v_dates) > 366 THEN RAISE EXCEPTION 'Choose between 1 and 366 specific dates'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_dates) value WHERE value < (now() AT TIME ZONE v_doctor_timezone)::date) THEN RAISE EXCEPTION 'Specific dates must be in the future'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_dates) value WHERE value > (v_dates[1] + 366)) THEN RAISE EXCEPTION 'Specific dates must be within 12 months'; END IF;
  FOREACH v_date IN ARRAY v_dates LOOP
    v_id := public.create_custom_availability_with_slots(v_date, p_start_time, p_end_time, p_timezone, p_interval_minutes, p_capacity, p_scheduling_type);
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN v_ids;
END;
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_monthly_availability_with_days(integer[], date, date, time, time, text, integer, integer, availability_scheduling_type) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_specific_date_availability_with_slots(date[], time, time, text, integer, integer, availability_scheduling_type) TO authenticated;--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
