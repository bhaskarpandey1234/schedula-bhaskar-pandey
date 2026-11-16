CREATE OR REPLACE FUNCTION public.patient_queue_status()
RETURNS TABLE(appointment_id uuid, checked_in_at timestamptz, attendance_status text,
  token_number integer, queue_status text, queue_position bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Patient access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting'
  )
  SELECT a.id, att.checked_in_at, att.status::text, e.token_number, e.status::text, waiting.pos
  FROM public.appointments a
  JOIN public.appointment_slots s ON s.id = a.slot_id
  JOIN public.doctors d ON d.id = a.doctor_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE a.patient_id = auth.uid()
    AND (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date
    AND a.status = 'confirmed'
    AND (att.appointment_id IS NOT NULL OR e.id IS NOT NULL);
END $$;
