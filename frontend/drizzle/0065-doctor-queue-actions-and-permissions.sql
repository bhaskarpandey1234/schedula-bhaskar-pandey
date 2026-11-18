CREATE OR REPLACE FUNCTION public.queue_operator_allowed(p_doctor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.doctors d ON d.id = p_doctor
    WHERE p.id = auth.uid() AND (
      p.role::text = 'admin' OR
      (p.role::text = 'doctor' AND p.id = p_doctor) OR
      (p.role::text = 'staff' AND EXISTS (
        SELECT 1 FROM public.staff_clinic_memberships m
        WHERE m.staff_id = p.id AND m.clinic_id = d.clinic_id
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.queue_operator_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_operator_allowed(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.doctor_queue_patients(uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.doctor_queue_patients(
  p_doctor_id uuid,
  p_service_date date,
  p_slot_id uuid DEFAULT NULL
)
RETURNS TABLE(
  appointment_id uuid,
  doctor_id uuid,
  patient_id uuid,
  patient_name text,
  patient_phone text,
  slot_id uuid,
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  timezone text,
  token_number integer,
  queue_position bigint,
  queue_status text,
  attendance_status text,
  checked_in_at timestamptz,
  appointment_status text,
  entry_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor' AND id = p_doctor_id
  ) THEN RAISE EXCEPTION 'Doctor access required' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  )
  SELECT
    a.id AS appointment_id,
    a.doctor_id,
    a.patient_id,
    pp.full_name AS patient_name,
    patient.phone AS patient_phone,
    s.id AS slot_id,
    s.slot_start_at,
    s.slot_end_at,
    d.timezone,
    e.token_number,
    waiting.pos AS queue_position,
    e.status::text AS queue_status,
    att.status::text AS attendance_status,
    att.checked_in_at,
    a.status::text AS appointment_status,
    e.id AS entry_id
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles dp ON dp.id = d.id
  JOIN public.profiles pp ON pp.id = a.patient_id
  JOIN public.patients patient ON patient.id = a.patient_id
  JOIN public.appointment_slots s ON s.id = a.slot_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE a.doctor_id = p_doctor_id
    AND (s.slot_start_at AT TIME ZONE d.timezone)::date = p_service_date
    AND (p_slot_id IS NULL OR s.id = p_slot_id)
    AND a.status IN ('confirmed', 'completed', 'cancelled')
  ORDER BY
    CASE
      WHEN e.status = 'in_consultation' THEN 1
      WHEN e.status = 'called' THEN 2
      WHEN e.status = 'waiting' AND att.checked_in_at IS NOT NULL THEN 3
      WHEN e.status = 'skipped' THEN 4
      WHEN a.status = 'confirmed' AND att.checked_in_at IS NULL AND att.status IS DISTINCT FROM 'no_show' THEN 5
      WHEN a.status = 'completed' OR e.status = 'completed' THEN 6
      ELSE 7
    END,
    waiting.pos NULLS LAST,
    s.slot_start_at,
    e.token_number;
END $$;
REVOKE ALL ON FUNCTION public.doctor_queue_patients(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_queue_patients(uuid, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
