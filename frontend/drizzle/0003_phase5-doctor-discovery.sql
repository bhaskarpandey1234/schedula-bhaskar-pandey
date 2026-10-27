CREATE OR REPLACE FUNCTION public.require_patient_directory_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient'
  ) THEN
    RAISE EXCEPTION 'Only authenticated patients can browse the doctor directory';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_specialties()
RETURNS TABLE(specialty text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT DISTINCT d.specialty
  FROM public.doctors d
  ORDER BY d.specialty;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_directory(
  p_search text DEFAULT NULL,
  p_specialty text DEFAULT NULL
)
RETURNS TABLE(
  doctor_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  experience_years integer,
  available_dates date[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT
    d.id,
    p.full_name,
    d.specialty,
    d.clinic_name,
    d.experience_years,
    COALESCE(availability.available_dates, ARRAY[]::date[])
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  LEFT JOIN LATERAL (
    SELECT array_agg(
      DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date
      ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date
    ) AS available_dates
    FROM public.appointment_slots s
    JOIN public.availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = d.id
      AND s.status = 'available'
      AND a.status = 'active'
      AND s.slot_start_at >= now()
      AND s.slot_start_at < now() + interval '30 days'
      AND s.allocated_count < s.capacity
  ) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%')
    AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY p.full_name;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_detail(p_doctor_id uuid)
RETURNS TABLE(
  doctor_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  experience_years integer,
  biography text,
  timezone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, d.biography, d.timezone
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  WHERE d.id = p_doctor_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(
  slot_id uuid,
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  timezone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone
  FROM public.appointment_slots s
  JOIN public.availability_sessions a ON a.id = s.availability_session_id
  JOIN public.doctors d ON d.id = s.doctor_id
  WHERE s.doctor_id = p_doctor_id
    AND s.status = 'available'
    AND a.status = 'active'
    AND s.slot_start_at >= now()
    AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity
  ORDER BY s.slot_start_at;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.require_patient_directory_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_doctor_specialties() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_doctor_directory(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_doctor_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_doctor_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_doctor_specialties() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_directory(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_slots(uuid) TO authenticated;
