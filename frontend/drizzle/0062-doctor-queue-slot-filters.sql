CREATE OR REPLACE FUNCTION public.doctor_queue_summary_for_slot(
  p_doctor_id uuid,
  p_service_date date,
  p_slot_id uuid
)
RETURNS TABLE(
  slot_start_at timestamptz, slot_end_at timestamptz, timezone text,
  total bigint, remaining bigint, waiting bigint, completed bigint,
  current_token integer, next_token integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor' AND id = p_doctor_id
  ) THEN RAISE EXCEPTION 'Doctor access required' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  WITH selected_session AS (
    SELECT s.id AS slot_id, s.slot_start_at, s.slot_end_at, d.timezone
    FROM public.appointment_slots s
    JOIN public.doctors d ON d.id = s.doctor_id
    WHERE s.id = p_slot_id
      AND s.doctor_id = p_doctor_id
      AND (s.slot_start_at AT TIME ZONE d.timezone)::date = p_service_date
  ),
  positions AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS queue_order
    FROM public.queue_entries e
    WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  )
  SELECT selected.slot_start_at, selected.slot_end_at, selected.timezone,
    count(a.id),
    count(a.id) FILTER (WHERE a.status = 'confirmed'
      AND e.status IS DISTINCT FROM 'completed'
      AND att.status IS DISTINCT FROM 'no_show'),
    count(a.id) FILTER (WHERE a.status = 'confirmed'
      AND e.status = 'waiting' AND e.checked_in_at IS NOT NULL),
    count(a.id) FILTER (WHERE a.status = 'completed' OR e.status = 'completed'),
    max(e.token_number) FILTER (WHERE e.status IN ('called', 'in_consultation')),
    (array_agg(e.token_number ORDER BY positions.queue_order) FILTER (
      WHERE a.status = 'confirmed' AND e.status = 'waiting' AND e.checked_in_at IS NOT NULL
    ))[1]
  FROM selected_session selected
  LEFT JOIN public.appointments a ON a.slot_id = selected.slot_id AND a.status IN ('confirmed', 'completed')
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN positions ON positions.id = e.id
  GROUP BY selected.slot_start_at, selected.slot_end_at, selected.timezone;
END $$;
REVOKE ALL ON FUNCTION public.doctor_queue_summary_for_slot(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_queue_summary_for_slot(uuid, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
