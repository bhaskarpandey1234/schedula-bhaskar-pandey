-- The reserved @schedula.example domain is used only by local pilot/demo accounts.
CREATE OR REPLACE FUNCTION public.assistant_patient_doctor_directory(
  p_search text DEFAULT NULL,
  p_specialty text DEFAULT NULL
)
RETURNS TABLE(
  doctor_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  experience_years integer,
  available_dates date[],
  consultation_fee_minor integer,
  consultation_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years,
    COALESCE(availability.available_dates, ARRAY[]::date[]),
    d.consultation_fee_minor, d.consultation_currency
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  JOIN auth.users auth_user
    ON auth_user.id = d.id
    AND auth_user.email_confirmed_at IS NOT NULL
    AND split_part(lower(auth_user.email), '@', 2) <> 'schedula.example'
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date
      ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates
    FROM public.appointment_slots s
    JOIN public.availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = d.id
      AND s.status = 'available'
      AND a.status = 'active'
      AND s.slot_start_at >= now()
      AND s.slot_start_at < now() + interval '30 days'
      AND s.allocated_count < s.capacity
      AND d.consultation_fee_minor IS NOT NULL
      AND d.consultation_currency = 'INR'
  ) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%')
    AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.assistant_patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(
  slot_id uuid,
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  timezone text,
  capacity integer,
  remaining_capacity integer,
  consultation_fee_minor integer,
  consultation_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity,
    s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency
  FROM public.appointment_slots s
  JOIN public.availability_sessions a ON a.id = s.availability_session_id
  JOIN public.doctors d ON d.id = s.doctor_id
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  JOIN auth.users auth_user
    ON auth_user.id = d.id
    AND auth_user.email_confirmed_at IS NOT NULL
    AND split_part(lower(auth_user.email), '@', 2) <> 'schedula.example'
  WHERE s.doctor_id = p_doctor_id
    AND s.status = 'available'
    AND a.status = 'active'
    AND s.slot_start_at >= now()
    AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity
    AND d.consultation_fee_minor IS NOT NULL
    AND d.consultation_currency = 'INR'
  ORDER BY s.slot_start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_patient_doctor_directory(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_patient_doctor_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_patient_doctor_directory(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_patient_doctor_slots(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
