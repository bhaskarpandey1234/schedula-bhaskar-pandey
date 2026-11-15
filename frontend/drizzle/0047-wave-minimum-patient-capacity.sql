-- Generalize minimum patient time and support capacity-aware Wave window edits.
ALTER TABLE public.availability_sessions
  ADD COLUMN IF NOT EXISTS minimum_patient_minutes integer NOT NULL DEFAULT 10;

UPDATE public.availability_sessions
SET minimum_patient_minutes = COALESCE(stream_min_patient_minutes, 10);

ALTER TABLE public.availability_occurrence_overrides
  ADD COLUMN IF NOT EXISTS minimum_patient_minutes integer,
  ADD COLUMN IF NOT EXISTS closed boolean NOT NULL DEFAULT false;

UPDATE public.availability_occurrence_overrides o
SET minimum_patient_minutes = COALESCE(o.stream_min_patient_minutes, a.minimum_patient_minutes, 10)
FROM public.availability_sessions a
WHERE a.id = o.availability_session_id AND o.minimum_patient_minutes IS NULL;

ALTER TABLE public.availability_sessions
  DROP CONSTRAINT IF EXISTS availability_sessions_stream_min_patient_minutes,
  ADD CONSTRAINT availability_sessions_minimum_patient_minutes_check
    CHECK (minimum_patient_minutes IN (5, 10, 15, 20, 30, 45, 60));

ALTER TABLE public.availability_occurrence_overrides
  DROP CONSTRAINT IF EXISTS availability_occurrence_overrides_stream_min_patient_minutes,
  ADD CONSTRAINT availability_occurrence_overrides_minimum_patient_minutes_check
    CHECK (minimum_patient_minutes IS NULL OR minimum_patient_minutes IN (5, 10, 15, 20, 30, 45, 60));

CREATE OR REPLACE FUNCTION public.validate_patient_capacity(
  p_scheduling_type public.availability_scheduling_type,
  p_start time,
  p_end time,
  p_interval integer,
  p_capacity integer,
  p_minimum integer
) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_duration integer;
BEGIN
  IF p_minimum NOT IN (5, 10, 15, 20, 30, 45, 60) THEN RAISE EXCEPTION 'Choose a supported minimum consultation time'; END IF;
  IF p_capacity NOT BETWEEN 1 AND 10 OR p_end <= p_start THEN RAISE EXCEPTION 'Invalid availability capacity or time window'; END IF;
  IF p_scheduling_type = 'wave' THEN
    IF p_minimum < 10 THEN RAISE EXCEPTION 'Wave consultations must be at least 10 minutes'; END IF;
    IF p_interval IS NULL OR p_interval NOT IN (15, 30, 60) OR p_capacity > floor(p_interval::numeric / p_minimum) THEN
      RAISE EXCEPTION 'Wave capacity exceeds the number of patients supported by its duration and minimum consultation time';
    END IF;
  ELSE
    v_duration := extract(epoch FROM (p_end - p_start))::integer / 60;
    IF p_interval IS NOT NULL OR p_capacity > floor(v_duration::numeric / p_minimum) THEN
      RAISE EXCEPTION 'Stream capacity exceeds the number of patients supported by its window and minimum consultation time';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_availability_patient_capacity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.scheduling_type = 'wave' THEN
    PERFORM public.validate_patient_capacity(NEW.scheduling_type, NEW.start_time, NEW.end_time,
      NEW.interval_minutes, NEW.capacity, NEW.minimum_patient_minutes);
  ELSIF NEW.end_time <= NEW.start_time OR NEW.capacity NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid availability capacity or time window';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_patient_capacity_guard ON public.availability_sessions;
CREATE TRIGGER availability_patient_capacity_guard
BEFORE INSERT
ON public.availability_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_availability_patient_capacity();

CREATE OR REPLACE FUNCTION public.set_minimum_patient_minutes(p_session_ids uuid[], p_minutes integer DEFAULT 10)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_doctor uuid := auth.uid(); v_session record;
BEGIN
  IF v_doctor IS NULL OR p_minutes NOT IN (5, 10, 15, 20, 30, 45, 60) THEN RAISE EXCEPTION 'Invalid minimum consultation time'; END IF;
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE id = ANY(p_session_ids) AND doctor_id <> v_doctor) THEN RAISE EXCEPTION 'Only your availability can be updated'; END IF;
  FOR v_session IN SELECT * FROM availability_sessions WHERE id = ANY(p_session_ids) AND doctor_id = v_doctor FOR UPDATE LOOP
    PERFORM public.validate_patient_capacity(v_session.scheduling_type, v_session.start_time, v_session.end_time,
      v_session.interval_minutes, v_session.capacity, p_minutes);
  END LOOP;
  UPDATE availability_sessions SET minimum_patient_minutes = p_minutes,
    stream_min_patient_minutes = CASE WHEN scheduling_type = 'stream' THEN p_minutes ELSE NULL END,
    updated_at = now()
  WHERE id = ANY(p_session_ids) AND doctor_id = v_doctor;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_stream_min_patient_minutes(p_session_ids uuid[], p_minutes integer DEFAULT 10)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE id = ANY(p_session_ids) AND (doctor_id <> auth.uid() OR scheduling_type <> 'stream')) THEN
    RAISE EXCEPTION 'Only your Stream sessions can be updated';
  END IF;
  PERFORM public.set_minimum_patient_minutes(p_session_ids, p_minutes);
END;
$$;

REVOKE ALL ON FUNCTION public.set_minimum_patient_minutes(uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_stream_min_patient_minutes(uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_minimum_patient_minutes(uuid[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stream_min_patient_minutes(uuid[], integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_doctor_occurrence_adjustment(
  p_session_id uuid, p_occurrence_date date, p_start_time time, p_end_time time
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid(); v_session record; v_timezone text; v_old_start time; v_old_end time;
  v_old_start_at timestamptz; v_old_end_at timestamptz; v_new_start_at timestamptz; v_new_end_at timestamptz;
  v_kind text; v_affected jsonb := '[]'::jsonb; v_appointments jsonb := '[]'::jsonb; v_candidates jsonb := '[]'::jsonb;
  v_interval integer; v_minimum integer; v_partial record; v_wave_capacity integer; v_wave_pace numeric;
  v_wave_retained jsonb := '[]'::jsonb; v_wave_overflow jsonb := '[]'::jsonb;
  v_stream_capacity integer; v_stream_original integer; v_stream_booked integer; v_stream_retained jsonb := '[]'::jsonb; v_stream_overflow jsonb := '[]'::jsonb;
BEGIN
  SELECT a.*, d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id
  WHERE a.id = p_session_id AND a.doctor_id = v_doctor AND a.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone := v_session.doctor_timezone;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN RAISE EXCEPTION 'Choose a valid availability window'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_timezone)::date THEN RAISE EXCEPTION 'Only future occurrences can be edited'; END IF;
  IF v_session.kind = 'custom' AND v_session.session_date <> p_occurrence_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;
  SELECT COALESCE(o.start_time, v_session.start_time), COALESCE(o.end_time, v_session.end_time),
         COALESCE(o.minimum_patient_minutes, v_session.minimum_patient_minutes)
  INTO v_old_start, v_old_end, v_minimum
  FROM availability_occurrence_overrides o WHERE o.availability_session_id = p_session_id AND o.occurrence_date = p_occurrence_date;
  IF v_old_start IS NULL THEN v_old_start := v_session.start_time; v_old_end := v_session.end_time; v_minimum := v_session.minimum_patient_minutes; END IF;
  IF (p_occurrence_date + v_old_start) AT TIME ZONE v_timezone <= now() + interval '3 hours' THEN RAISE EXCEPTION 'Availability changes must be made at least 3 hours before the current window starts'; END IF;
  IF (p_start_time < v_old_start AND p_end_time < v_old_end) OR (p_start_time > v_old_start AND p_end_time > v_old_end) THEN RAISE EXCEPTION 'Use a pure shrink or pure expansion'; END IF;
  v_kind := CASE WHEN p_start_time <= v_old_start AND p_end_time >= v_old_end THEN 'expansion' ELSE 'shrink' END;
  v_interval := v_session.interval_minutes;
  IF v_session.scheduling_type = 'wave' AND extract(epoch FROM (p_start_time - v_old_start))::integer % (v_interval * 60) <> 0 THEN RAISE EXCEPTION 'Wave start must align with the appointment duration'; END IF;
  v_old_start_at := (p_occurrence_date + v_old_start) AT TIME ZONE v_timezone;
  v_old_end_at := (p_occurrence_date + v_old_end) AT TIME ZONE v_timezone;
  v_new_start_at := (p_occurrence_date + p_start_time) AT TIME ZONE v_timezone;
  v_new_end_at := (p_occurrence_date + p_end_time) AT TIME ZONE v_timezone;
  IF v_new_start_at <= now() THEN RAISE EXCEPTION 'Availability must start in the future'; END IF;
  IF EXISTS (SELECT 1 FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = v_doctor AND s.availability_session_id <> p_session_id AND a.status = 'active'
      AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND s.slot_start_at < v_new_end_at AND s.slot_end_at > v_new_start_at) THEN
    RAISE EXCEPTION 'The new window overlaps another availability session';
  END IF;
  IF EXISTS (SELECT 1 FROM slot_reservations r JOIN appointment_slots s ON s.id = r.slot_id
    WHERE s.availability_session_id = p_session_id AND (v_session.scheduling_type = 'stream' OR (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at))
      AND r.status = 'active' AND r.expires_at > now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
  IF EXISTS (SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE s.availability_session_id=p_session_id
    AND (s.slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date AND a.status='reschedule_pending') THEN
    RAISE EXCEPTION 'This occurrence already has a patient decision in progress';
  END IF;

  IF v_session.scheduling_type = 'stream' THEN
    SELECT s.capacity, s.capacity, s.allocated_count INTO v_stream_capacity, v_stream_original, v_stream_booked FROM appointment_slots s
      WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date
      ORDER BY s.slot_start_at LIMIT 1;
    v_stream_capacity := LEAST(COALESCE(v_stream_capacity, v_session.capacity), floor(extract(epoch FROM (v_new_end_at-v_new_start_at))/60/v_minimum)::integer);
    IF v_stream_capacity < 1 THEN RAISE EXCEPTION 'The new Stream window is shorter than its minimum consultation time'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'allocated_count', s.allocated_count, 'capacity', s.capacity)), '[]'::jsonb)
      INTO v_affected FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('appointment_id', a.id, 'source_slot_id', s.id, 'patient_id', a.patient_id, 'patient_name', pp.full_name, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'created_at', a.created_at) ORDER BY a.created_at, a.id), '[]'::jsonb)
      INTO v_appointments FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN profiles pp ON pp.id = a.patient_id
      WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'remaining_capacity', s.capacity-s.allocated_count) ORDER BY s.slot_start_at), '[]'::jsonb)
      INTO v_candidates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id
      WHERE s.doctor_id = v_doctor AND a.scheduling_type = 'stream' AND a.status = 'active' AND s.status = 'available'
        AND s.slot_start_at > now() AND s.allocated_count < s.capacity AND s.slot_start_at >= v_old_end_at;
    SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_stream_retained FROM (SELECT item, ord FROM jsonb_array_elements(v_appointments) WITH ORDINALITY x(item, ord) LIMIT v_stream_capacity) q;
    SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_stream_overflow FROM (SELECT item, ord FROM jsonb_array_elements(v_appointments) WITH ORDINALITY x(item, ord) OFFSET v_stream_capacity) q;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'allocated_count', s.allocated_count, 'capacity', s.capacity) ORDER BY s.slot_start_at), '[]'::jsonb)
      INTO v_affected FROM appointment_slots s WHERE s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date
        AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at);
    SELECT s.* INTO v_partial FROM appointment_slots s WHERE s.availability_session_id = p_session_id
      AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND s.slot_start_at >= v_new_start_at
      AND s.slot_start_at < v_new_end_at AND s.slot_end_at > v_new_end_at ORDER BY s.slot_start_at LIMIT 1;
    IF FOUND THEN
      v_wave_pace := GREATEST(v_minimum::numeric, extract(epoch FROM (v_partial.slot_end_at-v_partial.slot_start_at))/60/v_partial.capacity);
      v_wave_capacity := LEAST(v_partial.capacity, floor(extract(epoch FROM (v_new_end_at-v_partial.slot_start_at))/60/v_wave_pace)::integer);
      IF v_wave_capacity < 1 THEN RAISE EXCEPTION 'The shortened Wave window is shorter than the minimum patient time'; END IF;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('appointment_id', a.id, 'source_slot_id', s.id, 'patient_id', a.patient_id, 'patient_name', pp.full_name, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'created_at', a.created_at) ORDER BY s.slot_start_at, a.created_at, a.id), '[]'::jsonb)
      INTO v_appointments FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN profiles pp ON pp.id = a.patient_id
      WHERE a.doctor_id = v_doctor AND a.status = 'confirmed' AND s.availability_session_id = p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date
        AND (s.slot_start_at < v_new_start_at OR s.slot_end_at > v_new_end_at);
    IF v_partial.id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_wave_retained FROM (
        SELECT item, ord FROM jsonb_array_elements(v_appointments) WITH ORDINALITY x(item, ord)
        WHERE (item->>'source_slot_id')::uuid = v_partial.id ORDER BY ord LIMIT v_wave_capacity
      ) q;
    END IF;
    SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_wave_overflow FROM (
      SELECT item, ord FROM jsonb_array_elements(v_appointments) WITH ORDINALITY x(item, ord)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_wave_retained) r WHERE r->>'appointment_id' = item->>'appointment_id') ORDER BY ord
    ) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', s.id, 'start_at', s.slot_start_at, 'end_at', s.slot_end_at, 'remaining_capacity', s.capacity-s.allocated_count) ORDER BY s.slot_start_at), '[]'::jsonb)
      INTO v_candidates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id
      WHERE s.doctor_id = v_doctor AND a.scheduling_type = 'wave' AND a.status = 'active' AND s.status = 'available'
        AND s.slot_start_at > now() AND s.allocated_count < s.capacity AND extract(epoch FROM (s.slot_end_at-s.slot_start_at)) = v_interval*60
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_affected) x WHERE (x->>'slot_id')::uuid=s.id);
  END IF;
  RETURN jsonb_build_object('session_id',p_session_id,'occurrence_date',p_occurrence_date,'timezone',v_timezone,
    'scheduling_type',v_session.scheduling_type,'kind',v_session.kind,'interval_minutes',v_interval,'classification',v_kind,
    'old_start_at',v_old_start_at,'old_end_at',v_old_end_at,'new_start_at',v_new_start_at,'new_end_at',v_new_end_at,
    'affected_slots',v_affected,'appointments',v_appointments,'candidates',v_candidates,
    'stream_capacity',CASE WHEN v_session.scheduling_type='stream' THEN jsonb_build_object('minimum_patient_minutes',v_minimum,'original_capacity',COALESCE(v_stream_original,v_session.capacity),'reduced_capacity',v_stream_capacity,'booked_count',COALESCE(v_stream_booked,0),'retained_count',jsonb_array_length(v_stream_retained),'overflow_count',jsonb_array_length(v_stream_overflow)) END,
    'stream_retained_appointments',v_stream_retained,'stream_overflow_appointments',v_stream_overflow,
    'wave_capacity',CASE WHEN v_partial.id IS NOT NULL THEN jsonb_build_object('minimum_patient_minutes',v_minimum,'patient_minutes',v_wave_pace,'original_capacity',v_partial.capacity,'reduced_capacity',v_wave_capacity,'booked_count',v_partial.allocated_count,'retained_count',jsonb_array_length(v_wave_retained),'overflow_count',GREATEST(0,v_partial.allocated_count-jsonb_array_length(v_wave_retained))) END,
    'wave_retained_appointments',v_wave_retained,'wave_overflow_appointments',v_wave_overflow);
END;
$$;

REVOKE ALL ON FUNCTION public.preview_doctor_occurrence_adjustment(uuid,date,time,time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_doctor_occurrence_adjustment(uuid,date,time,time) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_doctor_occurrence_adjustment(
  p_session_id uuid, p_occurrence_date date, p_start_time time, p_end_time time, p_assignments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid(); v_session record; v_preview jsonb; v_adjustment uuid;
  v_old_start time; v_old_end time; v_old_start_at timestamptz; v_old_end_at timestamptz; v_new_start_at timestamptz; v_new_end_at timestamptz;
  v_timezone text; v_kind text; v_minimum integer; v_capacity integer; v_wave_slot uuid; v_stream_slot uuid;
  v_appointment jsonb; v_candidate jsonb; v_recommended uuid; v_deadline timestamptz;
  v_overflow_index integer := 0; v_candidates jsonb; v_appointments jsonb; v_retained jsonb; v_source_held boolean;
  v_slot_start timestamptz; v_slot_end timestamptz; v_pace numeric;
BEGIN
  SELECT a.*, d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id=a.doctor_id
  WHERE a.id=p_session_id AND a.doctor_id=v_doctor AND a.status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone := v_session.doctor_timezone;
  SELECT COALESCE(o.start_time,v_session.start_time), COALESCE(o.end_time,v_session.end_time), COALESCE(o.minimum_patient_minutes,v_session.minimum_patient_minutes)
  INTO v_old_start,v_old_end,v_minimum FROM availability_occurrence_overrides o WHERE o.availability_session_id=p_session_id AND o.occurrence_date=p_occurrence_date;
  IF v_old_start IS NULL THEN v_old_start:=v_session.start_time; v_old_end:=v_session.end_time; v_minimum:=v_session.minimum_patient_minutes; END IF;
  v_old_start_at := (p_occurrence_date+v_old_start) AT TIME ZONE v_timezone;
  v_old_end_at := (p_occurrence_date+v_old_end) AT TIME ZONE v_timezone;
  v_new_start_at := (p_occurrence_date+p_start_time) AT TIME ZONE v_timezone;
  v_new_end_at := (p_occurrence_date+p_end_time) AT TIME ZONE v_timezone;
  IF v_new_start_at <= now() OR p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be in the future'; END IF;
  IF v_old_start_at <= now()+interval '3 hours' THEN RAISE EXCEPTION 'Availability changes must be made at least 3 hours before the current window starts'; END IF;
  IF (p_start_time<v_old_start AND p_end_time<v_old_end) OR (p_start_time>v_old_start AND p_end_time>v_old_end) THEN RAISE EXCEPTION 'Use a pure shrink or pure expansion'; END IF;
  v_kind := CASE WHEN p_start_time<=v_old_start AND p_end_time>=v_old_end THEN 'expansion' ELSE 'shrink' END;
  IF v_session.scheduling_type='wave' AND extract(epoch FROM (p_start_time-v_old_start))::integer % (v_session.interval_minutes*60)<>0 THEN RAISE EXCEPTION 'Wave start must align with the appointment duration'; END IF;
  IF EXISTS(SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date AND a.status IN ('payment_pending','reschedule_pending')) THEN RAISE EXCEPTION 'This occurrence already has a booking or patient decision in progress'; END IF;
  v_preview := public.preview_doctor_occurrence_adjustment(p_session_id,p_occurrence_date,p_start_time,p_end_time);
  IF p_assignments ? 'expected_preview' AND (p_assignments->'expected_preview') IS DISTINCT FROM v_preview THEN
    RAISE EXCEPTION 'Availability preview is stale; preview the change again';
  END IF;
  v_candidates := COALESCE(v_preview->'candidates','[]'::jsonb); v_appointments := COALESCE(v_preview->'appointments','[]'::jsonb);
  v_retained := COALESCE(v_preview->'wave_retained_appointments','[]'::jsonb);
  IF v_session.scheduling_type='stream' THEN v_capacity := (v_preview->'stream_capacity'->>'reduced_capacity')::integer;
  ELSIF v_preview->'wave_capacity' IS NOT NULL AND v_preview->'wave_capacity'<>'null'::jsonb THEN v_capacity := (v_preview->'wave_capacity'->>'reduced_capacity')::integer; END IF;
  INSERT INTO availability_adjustments(doctor_id,availability_session_id,occurrence_date,scheduling_type,old_start_at,old_end_at,new_start_at,new_end_at,summary)
  VALUES(v_doctor,p_session_id,p_occurrence_date,v_session.scheduling_type,v_old_start_at,v_old_end_at,v_new_start_at,v_new_end_at,
    jsonb_build_object('classification',v_kind,'patient_approval_required',true,'capacity',v_capacity)) RETURNING id INTO v_adjustment;
  IF v_session.kind IN ('weekly','monthly') THEN
    INSERT INTO availability_occurrence_overrides(availability_session_id,doctor_id,occurrence_date,start_time,end_time,minimum_patient_minutes,stream_min_patient_minutes,capacity)
    VALUES(p_session_id,v_doctor,p_occurrence_date,p_start_time,p_end_time,v_minimum,CASE WHEN v_session.scheduling_type='stream' THEN v_minimum END,
      CASE WHEN v_capacity IS NOT NULL THEN v_capacity END)
    ON CONFLICT(availability_session_id,occurrence_date) DO UPDATE SET start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
      minimum_patient_minutes=EXCLUDED.minimum_patient_minutes,stream_min_patient_minutes=EXCLUDED.stream_min_patient_minutes,capacity=EXCLUDED.capacity,updated_at=now();
  ELSE
    UPDATE availability_sessions SET start_time=p_start_time,end_time=p_end_time,session_start_at=v_new_start_at,session_end_at=v_new_end_at,
      capacity=CASE WHEN v_capacity IS NOT NULL THEN v_capacity ELSE capacity END,updated_at=now() WHERE id=p_session_id;
  END IF;
  IF v_session.scheduling_type='stream' THEN
    SELECT s.id INTO v_stream_slot FROM appointment_slots s WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date ORDER BY s.slot_start_at LIMIT 1 FOR UPDATE;
    IF v_stream_slot IS NULL THEN RAISE EXCEPTION 'The occurrence has no materialized slot'; END IF;
    UPDATE appointment_slots SET slot_start_at=v_new_start_at,slot_end_at=v_new_end_at,capacity=v_capacity,
      updated_at=now() WHERE id=v_stream_slot;
    -- Allocation stays on the source until each patient decides, regardless of edit type.
    v_source_held := false;
  ELSE
    SELECT s.id INTO v_wave_slot FROM appointment_slots s WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date
      AND s.slot_start_at>=v_new_start_at AND s.slot_start_at<v_new_end_at AND s.slot_end_at>v_new_end_at ORDER BY s.slot_start_at LIMIT 1 FOR UPDATE;
    IF v_wave_slot IS NOT NULL THEN
      -- Keep allocations accurate while overflow appointments await patient decisions.
      -- Their decision handlers release each source allocation individually.
      UPDATE appointment_slots SET slot_end_at=v_new_end_at,capacity=v_capacity,updated_at=now() WHERE id=v_wave_slot;
    END IF;
    UPDATE appointment_slots SET status='cancelled',updated_at=now() WHERE availability_session_id=p_session_id
      AND (slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date AND (slot_start_at<v_new_start_at OR slot_end_at>v_new_end_at) AND id IS DISTINCT FROM v_wave_slot;
    IF v_kind='expansion' THEN
      v_slot_start:=v_new_start_at;
      WHILE v_slot_start + make_interval(mins=>v_session.interval_minutes) <= v_new_end_at LOOP
        INSERT INTO appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity)
        VALUES(p_session_id,v_doctor,v_slot_start,v_slot_start+make_interval(mins=>v_session.interval_minutes),v_session.capacity)
        ON CONFLICT(availability_session_id,slot_start_at) DO NOTHING;
        v_slot_start:=v_slot_start+make_interval(mins=>v_session.interval_minutes);
      END LOOP;
    END IF;
    v_source_held := false;
  END IF;
  v_deadline := v_old_start_at-interval '2 hours';
  FOR v_appointment IN SELECT * FROM jsonb_array_elements(v_appointments) LOOP
    v_recommended := NULL; v_candidate := NULL;
    IF v_session.scheduling_type='stream' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(v_preview->'stream_retained_appointments','[]'::jsonb)) r WHERE r->>'appointment_id'=v_appointment->>'appointment_id') THEN
      v_recommended := (v_appointment->>'source_slot_id')::uuid;
    ELSIF v_session.scheduling_type='wave' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_retained) r WHERE r->>'appointment_id'=v_appointment->>'appointment_id') THEN
      v_recommended := (v_appointment->>'source_slot_id')::uuid;
    ELSE
      v_overflow_index := v_overflow_index+1;
      SELECT candidate INTO v_candidate FROM (
        SELECT candidate,sum((candidate->>'remaining_capacity')::integer) OVER(ORDER BY (candidate->>'start_at')::timestamptz,candidate->>'slot_id') AS cumulative_capacity
        FROM jsonb_array_elements(v_candidates) candidate WHERE (candidate->>'remaining_capacity')::integer>0 AND (candidate->>'start_at')::timestamptz >= (v_appointment->>'start_at')::timestamptz
      ) ranked WHERE cumulative_capacity>=v_overflow_index ORDER BY cumulative_capacity LIMIT 1;
      IF v_candidate IS NOT NULL THEN v_recommended:=(v_candidate->>'slot_id')::uuid; END IF;
    END IF;
    INSERT INTO elastic_booking_proposals(adjustment_id,appointment_id,patient_id,doctor_id,source_slot_id,recommended_slot_id,scheduling_type,old_start_at,old_end_at,recommended_start_at,recommended_end_at,source_allocation_held,decision_deadline)
    SELECT v_adjustment,(v_appointment->>'appointment_id')::uuid,(v_appointment->>'patient_id')::uuid,v_doctor,(v_appointment->>'source_slot_id')::uuid,v_recommended,v_session.scheduling_type,
      (v_appointment->>'start_at')::timestamptz,(v_appointment->>'end_at')::timestamptz,
      CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_start_at FROM appointment_slots WHERE id=v_recommended) END,
      CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_end_at FROM appointment_slots WHERE id=v_recommended) END,v_source_held,v_deadline ON CONFLICT DO NOTHING;
    UPDATE appointments SET status='reschedule_pending',updated_at=now() WHERE id=(v_appointment->>'appointment_id')::uuid AND status='confirmed';
    INSERT INTO notifications(recipient_id,appointment_id,type,title,message,metadata,dedupe_key)
    VALUES((v_appointment->>'patient_id')::uuid,(v_appointment->>'appointment_id')::uuid,'elastic_reschedule_proposed','Appointment change needs your approval',
      CASE WHEN v_recommended IS NULL THEN 'Your doctor changed availability. Choose another available time or cancel for a full refund.' ELSE 'Your doctor changed availability. Review the recommended new time or choose another available time.' END,
      jsonb_build_object('proposal_status','awaiting_patient','recommended_start_at',CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_start_at FROM appointment_slots WHERE id=v_recommended) END,
        'recommended_end_at',CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_end_at FROM appointment_slots WHERE id=v_recommended) END,'decision_deadline',v_deadline),
      'elastic-proposal/'||v_adjustment||'/'||(v_appointment->>'appointment_id')) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('adjustment_id',v_adjustment,'classification',v_kind,'pending',jsonb_array_length(v_appointments));
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_doctor_occurrence_closure(p_session_id uuid,p_occurrence_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_doctor uuid:=auth.uid(); v_session record; v_start time; v_end time; v_start_at timestamptz; v_end_at timestamptz; v_appointments jsonb; v_slots jsonb; v_candidates jsonb;
BEGIN
  SELECT a.*,d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=p_session_id AND a.doctor_id=v_doctor AND a.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_session.doctor_timezone)::date THEN RAISE EXCEPTION 'Only future occurrences can be closed'; END IF;
  IF v_session.kind='custom' AND p_occurrence_date<>v_session.session_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;
  SELECT COALESCE(o.start_time,v_session.start_time),COALESCE(o.end_time,v_session.end_time) INTO v_start,v_end FROM availability_occurrence_overrides o WHERE o.availability_session_id=p_session_id AND o.occurrence_date=p_occurrence_date;
  IF v_start IS NULL THEN v_start:=v_session.start_time; v_end:=v_session.end_time; END IF;
  v_start_at:=(p_occurrence_date+v_start) AT TIME ZONE v_session.doctor_timezone; v_end_at:=(p_occurrence_date+v_end) AT TIME ZONE v_session.doctor_timezone;
  IF v_start_at<=now()+interval '3 hours' THEN RAISE EXCEPTION 'Availability changes must be made at least 3 hours before the current window starts'; END IF;
  IF EXISTS(SELECT 1 FROM appointment_slots s JOIN slot_reservations r ON r.slot_id=s.id WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.doctor_timezone)::date=p_occurrence_date AND r.status='active' AND r.expires_at>now()) THEN RAISE EXCEPTION 'This occurrence has an active payment hold'; END IF;
  IF EXISTS(SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.doctor_timezone)::date=p_occurrence_date AND a.status='reschedule_pending') THEN RAISE EXCEPTION 'This occurrence already has a patient decision in progress'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id',s.id,'start_at',s.slot_start_at,'end_at',s.slot_end_at,'allocated_count',s.allocated_count,'capacity',s.capacity) ORDER BY s.slot_start_at),'[]'::jsonb) INTO v_slots
    FROM appointment_slots s WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.doctor_timezone)::date=p_occurrence_date;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('appointment_id',a.id,'source_slot_id',s.id,'patient_id',a.patient_id,'patient_name',pp.full_name,'start_at',s.slot_start_at,'end_at',s.slot_end_at,'created_at',a.created_at) ORDER BY s.slot_start_at,a.created_at),'[]'::jsonb) INTO v_appointments
    FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id JOIN profiles pp ON pp.id=a.patient_id WHERE a.doctor_id=v_doctor AND a.status='confirmed' AND s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.doctor_timezone)::date=p_occurrence_date;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id',s.id,'start_at',s.slot_start_at,'end_at',s.slot_end_at,'remaining_capacity',s.capacity-s.allocated_count) ORDER BY s.slot_start_at),'[]'::jsonb) INTO v_candidates
    FROM appointment_slots s JOIN availability_sessions a ON a.id=s.availability_session_id WHERE s.doctor_id=v_doctor AND a.scheduling_type=v_session.scheduling_type AND a.status='active' AND s.status='available' AND s.slot_start_at>now() AND s.allocated_count<s.capacity AND s.availability_session_id<>p_session_id
      AND (v_session.scheduling_type='stream' OR extract(epoch FROM (s.slot_end_at-s.slot_start_at))=v_session.interval_minutes*60);
  RETURN jsonb_build_object('session_id',p_session_id,'occurrence_date',p_occurrence_date,'timezone',v_session.doctor_timezone,'scheduling_type',v_session.scheduling_type,'kind',v_session.kind,
    'interval_minutes',v_session.interval_minutes,'classification','shrink','old_start_at',v_start_at,'old_end_at',v_end_at,'new_start_at',v_start_at,'new_end_at',v_end_at,
    'affected_slots',v_slots,'appointments',v_appointments,'candidates',v_candidates,'closing',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_doctor_occurrence_closure(p_session_id uuid,p_occurrence_date date,p_expected_preview jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_doctor uuid:=auth.uid(); v_session record; v_preview jsonb; v_start time; v_end time; v_start_at timestamptz; v_end_at timestamptz; v_adjustment uuid; v_deadline timestamptz; v_candidate jsonb; v_target uuid; v_idx integer:=0; v_appointment jsonb; v_candidates jsonb; v_appointments jsonb; v_timezone text;
BEGIN
  SELECT a.*,d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=p_session_id AND a.doctor_id=v_doctor AND a.status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone:=v_session.doctor_timezone;
  SELECT COALESCE(o.start_time,v_session.start_time),COALESCE(o.end_time,v_session.end_time) INTO v_start,v_end FROM availability_occurrence_overrides o WHERE o.availability_session_id=p_session_id AND o.occurrence_date=p_occurrence_date;
  IF v_start IS NULL THEN v_start:=v_session.start_time; v_end:=v_session.end_time; END IF;
  v_start_at:=(p_occurrence_date+v_start) AT TIME ZONE v_timezone; v_end_at:=(p_occurrence_date+v_end) AT TIME ZONE v_timezone;
  v_preview:=public.preview_doctor_occurrence_closure(p_session_id,p_occurrence_date);
  IF v_preview IS DISTINCT FROM p_expected_preview THEN RAISE EXCEPTION 'Availability preview is stale; preview the change again'; END IF;
  v_candidates:=COALESCE(v_preview->'candidates','[]'::jsonb); v_appointments:=COALESCE(v_preview->'appointments','[]'::jsonb); v_deadline:=v_start_at-interval '2 hours';
  INSERT INTO availability_adjustments(doctor_id,availability_session_id,occurrence_date,scheduling_type,old_start_at,old_end_at,new_start_at,new_end_at,summary)
  VALUES(v_doctor,p_session_id,p_occurrence_date,v_session.scheduling_type,v_start_at,v_end_at,v_start_at,v_end_at,jsonb_build_object('classification','closure','patient_approval_required',true)) RETURNING id INTO v_adjustment;
  IF v_session.kind IN ('weekly','monthly') THEN
    INSERT INTO availability_occurrence_overrides(availability_session_id,doctor_id,occurrence_date,start_time,end_time,minimum_patient_minutes,stream_min_patient_minutes,capacity,closed)
    VALUES(p_session_id,v_doctor,p_occurrence_date,v_start,v_end,v_session.minimum_patient_minutes,CASE WHEN v_session.scheduling_type='stream' THEN v_session.minimum_patient_minutes END,v_session.capacity,true)
    ON CONFLICT(availability_session_id,occurrence_date) DO UPDATE SET closed=true,updated_at=now();
  ELSE UPDATE availability_sessions SET status='cancelled',updated_at=now() WHERE id=p_session_id; END IF;
  UPDATE appointment_slots SET status='cancelled',updated_at=now() WHERE availability_session_id=p_session_id AND (slot_start_at AT TIME ZONE v_timezone)::date=p_occurrence_date;
  FOR v_appointment IN SELECT * FROM jsonb_array_elements(v_appointments) LOOP
    v_idx:=v_idx+1; v_target:=NULL;
    SELECT candidate INTO v_candidate FROM (
      SELECT candidate,sum((candidate->>'remaining_capacity')::integer) OVER(ORDER BY (candidate->>'start_at')::timestamptz,candidate->>'slot_id') AS cumulative_capacity
      FROM jsonb_array_elements(v_candidates) candidate WHERE (candidate->>'remaining_capacity')::integer>0 AND (candidate->>'start_at')::timestamptz >= (v_appointment->>'start_at')::timestamptz
    ) ranked WHERE cumulative_capacity>=v_idx ORDER BY cumulative_capacity LIMIT 1;
    IF v_candidate IS NOT NULL THEN v_target:=(v_candidate->>'slot_id')::uuid; END IF;
    INSERT INTO elastic_booking_proposals(adjustment_id,appointment_id,patient_id,doctor_id,source_slot_id,recommended_slot_id,scheduling_type,old_start_at,old_end_at,recommended_start_at,recommended_end_at,source_allocation_held,decision_deadline)
    SELECT v_adjustment,(v_appointment->>'appointment_id')::uuid,(v_appointment->>'patient_id')::uuid,v_doctor,(v_appointment->>'source_slot_id')::uuid,v_target,v_session.scheduling_type,
      (v_appointment->>'start_at')::timestamptz,(v_appointment->>'end_at')::timestamptz,
      CASE WHEN v_target IS NULL THEN NULL ELSE (SELECT slot_start_at FROM appointment_slots WHERE id=v_target) END,
      CASE WHEN v_target IS NULL THEN NULL ELSE (SELECT slot_end_at FROM appointment_slots WHERE id=v_target) END,false,v_deadline ON CONFLICT DO NOTHING;
    UPDATE appointments SET status='reschedule_pending',updated_at=now() WHERE id=(v_appointment->>'appointment_id')::uuid AND status='confirmed';
    INSERT INTO notifications(recipient_id,appointment_id,type,title,message,metadata,dedupe_key) VALUES((v_appointment->>'patient_id')::uuid,(v_appointment->>'appointment_id')::uuid,
      'elastic_reschedule_proposed','Your doctor is closing this availability','Choose a replacement appointment or cancel for a full refund.',
      jsonb_build_object('proposal_status','awaiting_patient','decision_deadline',v_deadline),'elastic-closure/'||v_adjustment||'/'||(v_appointment->>'appointment_id')) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('adjustment_id',v_adjustment,'pending',jsonb_array_length(v_appointments));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_doctor_session_occurrence(p_session_id uuid,p_occurrence_date date)
RETURNS TABLE(cancelled_appointments integer,refund_requests integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_doctor uuid:=auth.uid(); v_session availability_sessions%ROWTYPE;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_doctor AND role='doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can cancel sessions'; END IF;
  SELECT * INTO v_session FROM availability_sessions WHERE id=p_session_id AND doctor_id=v_doctor FOR UPDATE;
  IF NOT FOUND OR v_session.status<>'active' THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  IF p_occurrence_date <= (now() AT TIME ZONE v_session.timezone)::date THEN RAISE EXCEPTION 'Session must be in the future'; END IF;
  IF v_session.kind='custom' AND p_occurrence_date<>v_session.session_date THEN RAISE EXCEPTION 'Date does not match the session'; END IF;
  IF EXISTS(SELECT 1 FROM appointment_slots s JOIN slot_reservations r ON r.slot_id=s.id WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.timezone)::date=p_occurrence_date AND r.status='active' AND r.expires_at>now()) THEN RAISE EXCEPTION 'This session has an active payment hold and cannot be cancelled'; END IF;
  IF EXISTS(SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE s.availability_session_id=p_session_id AND (s.slot_start_at AT TIME ZONE v_session.timezone)::date=p_occurrence_date AND a.status IN ('payment_pending','confirmed','reschedule_pending')) THEN
    RAISE EXCEPTION 'This session has bookings. Use Edit window to request patient decisions before closing it';
  END IF;
  IF v_session.kind IN ('weekly','monthly') THEN
    INSERT INTO availability_occurrence_overrides(availability_session_id,doctor_id,occurrence_date,start_time,end_time,minimum_patient_minutes,closed)
    VALUES(p_session_id,v_doctor,p_occurrence_date,v_session.start_time,v_session.end_time,v_session.minimum_patient_minutes,true)
    ON CONFLICT(availability_session_id,occurrence_date) DO UPDATE SET closed=true,updated_at=now();
  END IF;
  UPDATE appointment_slots SET status='cancelled',updated_at=now() WHERE availability_session_id=p_session_id AND (slot_start_at AT TIME ZONE v_session.timezone)::date=p_occurrence_date AND allocated_count=0;
  IF v_session.kind='custom' THEN UPDATE availability_sessions SET status='cancelled',updated_at=now() WHERE id=p_session_id; END IF;
  RETURN QUERY SELECT 0,0;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_doctor_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_doctor uuid:=auth.uid(); v_slot appointment_slots%ROWTYPE;
BEGIN
  IF v_doctor IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_doctor AND role='doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can cancel slots'; END IF;
  SELECT * INTO v_slot FROM appointment_slots WHERE id=p_slot_id AND doctor_id=v_doctor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slot was not found'; END IF;
  IF v_slot.status<>'available' THEN RAISE EXCEPTION 'Slot is already cancelled'; END IF;
  IF v_slot.slot_start_at<=now() THEN RAISE EXCEPTION 'Only future slots can be cancelled'; END IF;
  IF v_slot.allocated_count>0 OR EXISTS(SELECT 1 FROM appointments a WHERE a.slot_id=v_slot.id AND a.status IN ('payment_pending','confirmed','reschedule_pending'))
     OR EXISTS(SELECT 1 FROM elastic_booking_proposals p WHERE p.source_slot_id=v_slot.id AND p.status='awaiting_patient')
     OR EXISTS(SELECT 1 FROM slot_reservations r WHERE r.slot_id=v_slot.id AND r.status='active' AND r.expires_at>now()) THEN
    RAISE EXCEPTION 'This slot has a booking, patient decision, or payment hold and cannot be cancelled individually';
  END IF;
  UPDATE appointment_slots SET status='cancelled',updated_at=now() WHERE id=v_slot.id;
END;
$$;

DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.approve_elastic_booking_proposal(uuid)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition,
    'IF target.status <> ''available'' OR target.allocated_count >= target.capacity THEN',
    'IF target.status <> ''available'' OR (target.allocated_count >= target.capacity AND target.id <> p.source_slot_id) THEN');
  IF position('target.id <> p.source_slot_id' IN v_definition)=0 THEN RAISE EXCEPTION 'Could not patch elastic recommendation capacity guard'; END IF;
  v_definition := replace(v_definition,
    'IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, ''reschedule'', ''converted'', now() + interval ''100 years'');
  UPDATE appointments SET slot_id = target.id, status = ''confirmed'', updated_at = now() WHERE id = p.appointment_id;',
    'IF target.id <> p.source_slot_id THEN
    IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
    UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
    INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, ''reschedule'', ''converted'', now() + interval ''100 years'');
  END IF;
  UPDATE appointments SET slot_id = target.id, status = ''confirmed'', updated_at = now() WHERE id = p.appointment_id;');
  IF position('IF target.id <> p.source_slot_id THEN
    IF NOT p.source_allocation_held THEN' IN v_definition)=0 THEN RAISE EXCEPTION 'Could not patch same-window approval allocation handling'; END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.choose_elastic_booking_slot(uuid,uuid)'::regprocedure) INTO v_definition;
  v_definition := replace(v_definition,
    'target.status <> ''available'' OR target.allocated_count >= target.capacity OR target.scheduling_type <> p.scheduling_type',
    'target.status <> ''available'' OR (target.allocated_count >= target.capacity AND target.id <> p.source_slot_id) OR target.scheduling_type <> p.scheduling_type');
  IF position('target.id <> p.source_slot_id' IN v_definition)=0 THEN RAISE EXCEPTION 'Could not patch alternate-slot capacity guard'; END IF;
  v_definition := replace(v_definition,
    'IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, ''reschedule'', ''converted'', now() + interval ''100 years'');
  UPDATE appointments SET slot_id = target.id, status = ''confirmed'', updated_at = now() WHERE id = p.appointment_id;',
    'IF target.id <> p.source_slot_id THEN
    IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
    UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
    INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, ''reschedule'', ''converted'', now() + interval ''100 years'');
  END IF;
  UPDATE appointments SET slot_id = target.id, status = ''confirmed'', updated_at = now() WHERE id = p.appointment_id;');
  IF position('IF target.id <> p.source_slot_id THEN
    IF NOT p.source_allocation_held THEN' IN v_definition)=0 THEN RAISE EXCEPTION 'Could not patch same-window alternate allocation handling'; END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.preview_doctor_occurrence_closure(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_doctor_occurrence_closure(uuid,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_doctor_occurrence_closure(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_doctor_occurrence_closure(uuid,date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_doctor_occurrence_adjustment(uuid,date,time,time,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_session_occurrence(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_doctor_slot(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
