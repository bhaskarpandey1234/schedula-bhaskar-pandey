CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
RETURNS TABLE(entry_id uuid, token_number integer, checked_in_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_a public.appointments%ROWTYPE;
  v_s public.appointment_slots%ROWTYPE;
  v_d public.doctors%ROWTYPE;
  v_day date;
  v_at timestamptz;
  v_priority timestamptz;
  v_late_at timestamptz;
  v_entry public.queue_entries%ROWTYPE;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.appointment_slots WHERE id = v_a.slot_id;
  SELECT * INTO v_d FROM public.doctors WHERE id = v_a.doctor_id;
  v_day := (v_s.slot_start_at AT TIME ZONE v_d.timezone)::date;
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment changed; refresh and retry'; END IF;
  IF (now() AT TIME ZONE v_d.timezone)::date <> v_day THEN
    RAISE EXCEPTION 'Check-in opens on the appointment service date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'no_show') THEN
    RAISE EXCEPTION 'Reverse no-show before check-in';
  END IF;

  SELECT * INTO v_entry FROM public.queue_entries WHERE appointment_id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The appointment token is not available; refresh and try again'; END IF;
  IF v_entry.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT v_entry.id, v_entry.token_number, v_entry.checked_in_at;
    RETURN;
  END IF;

  v_at := now();
  v_late_at := LEAST(v_s.slot_end_at, v_s.slot_start_at + interval '15 minutes');
  v_priority := v_s.slot_start_at;
  IF v_at > v_late_at THEN
    SELECT GREATEST(v_priority, COALESCE(max(e.priority_at), v_priority)) + interval '1 microsecond'
      INTO v_priority FROM public.queue_entries e
      WHERE e.session_id = v_entry.session_id AND e.status = 'waiting' AND e.checked_in_at IS NOT NULL;
  END IF;

  INSERT INTO public.appointment_attendance(appointment_id, status, checked_in_at, checked_in_by)
    VALUES (p_appointment_id, 'checked_in', v_at, auth.uid())
    ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = v_at,
      checked_in_by = auth.uid(), no_show_at = NULL, no_show_by = NULL, updated_at = v_at;
  UPDATE public.queue_entries SET checked_in_at = v_at, priority_at = v_priority,
    status = 'waiting', updated_at = v_at WHERE id = v_entry.id;
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    VALUES (p_appointment_id, v_entry.id, auth.uid(), 'check_in');
  RETURN QUERY SELECT v_entry.id, v_entry.token_number, v_at;
END $$;
REVOKE ALL ON FUNCTION public.check_in_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_a public.appointments%ROWTYPE;
  v_s public.appointment_slots%ROWTYPE;
  v_timezone text;
  v_eligible timestamptz;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment is not confirmed'; END IF;
  SELECT * INTO v_s FROM public.appointment_slots WHERE id = v_a.slot_id;
  SELECT timezone INTO v_timezone FROM public.doctors WHERE id = v_a.doctor_id;
  IF (now() AT TIME ZONE v_timezone)::date <> (v_s.slot_start_at AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'No-show is available only on the service date';
  END IF;
  v_eligible := LEAST(v_s.slot_end_at, v_s.slot_start_at + interval '15 minutes');
  IF now() < v_eligible THEN RAISE EXCEPTION 'No-show grace period has not elapsed'; END IF;
  IF EXISTS (SELECT 1 FROM public.queue_entries WHERE appointment_id = p_appointment_id AND checked_in_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'checked_in') THEN
    RAISE EXCEPTION 'Checked-in patient must use the queue workflow';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'no_show') THEN
    RETURN;
  END IF;
  INSERT INTO public.appointment_attendance(appointment_id, status, no_show_at, no_show_by)
    VALUES (p_appointment_id, 'no_show', now(), auth.uid())
    ON CONFLICT (appointment_id) DO UPDATE SET status = 'no_show', no_show_at = now(),
      no_show_by = auth.uid(), updated_at = now();
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    SELECT p_appointment_id, e.id, auth.uid(), 'no_show'
    FROM public.queue_entries e WHERE e.appointment_id = p_appointment_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_appointment_no_show(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_appointment_board(
  p_clinic_id uuid DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_service_date date DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL
)
RETURNS TABLE(
  appointment_id uuid, doctor_id uuid, doctor_name text, patient_id uuid,
  patient_name text, patient_phone text, slot_id uuid, slot_start_at timestamptz,
  slot_end_at timestamptz, timezone text, appointment_status text,
  attendance_status text, checked_in_at timestamptz, token_number integer,
  queue_status text, queue_position bigint, no_show_eligible_at timestamptz,
  called_at timestamptz, entry_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  RETURN QUERY
  WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  )
  SELECT a.id, a.doctor_id, dp.full_name, a.patient_id, pp.full_name, patient.phone,
    s.id, s.slot_start_at, s.slot_end_at, d.timezone, a.status::text,
    att.status::text, att.checked_in_at, e.token_number, e.status::text, waiting.pos,
    LEAST(s.slot_end_at, s.slot_start_at + interval '15 minutes'), e.called_at, e.id
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles dp ON dp.id = d.id
  JOIN public.profiles pp ON pp.id = a.patient_id
  JOIN public.patients patient ON patient.id = a.patient_id
  JOIN public.appointment_slots s ON s.id = a.slot_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE ((p_service_date IS NULL AND (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date)
      OR (p_service_date IS NOT NULL AND (s.slot_start_at AT TIME ZONE d.timezone)::date = p_service_date))
    AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
    AND (p_clinic_id IS NULL OR d.clinic_id = p_clinic_id)
    AND (p_slot_id IS NULL OR s.id = p_slot_id)
    AND public.queue_operator_allowed(a.doctor_id)
    AND a.status IN ('confirmed', 'completed', 'cancelled')
  ORDER BY s.slot_start_at, a.created_at, a.id;
END $$;
REVOKE ALL ON FUNCTION public.queue_appointment_board(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_appointment_board(uuid, uuid, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
