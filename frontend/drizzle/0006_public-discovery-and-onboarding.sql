ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role public.user_role;
BEGIN
  requested_role := (NEW.raw_user_meta_data ->> 'role')::public.user_role;
  IF requested_role IS NULL THEN
    RAISE EXCEPTION 'A valid role is required';
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, requested_role);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.complete_patient_onboarding(
  p_full_name text,
  p_phone text,
  p_date_of_birth date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = current_user_id AND role = 'patient'
  ) THEN
    RAISE EXCEPTION 'Only authenticated patient accounts can complete patient onboarding';
  END IF;
  IF NULLIF(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'A full name is required to complete onboarding';
  END IF;

  UPDATE public.profiles SET full_name = trim(p_full_name) WHERE id = current_user_id;
  INSERT INTO public.patients (id, phone, date_of_birth)
  VALUES (current_user_id, trim(p_phone), p_date_of_birth)
  ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.complete_doctor_onboarding(
  p_full_name text,
  p_specialty text,
  p_clinic_name text,
  p_experience_years integer,
  p_biography text,
  p_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = current_user_id AND role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'Only authenticated doctor accounts can complete doctor onboarding';
  END IF;
  IF NULLIF(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'A full name is required to complete onboarding';
  END IF;

  UPDATE public.profiles SET full_name = trim(p_full_name) WHERE id = current_user_id;
  INSERT INTO public.doctors (id, specialty, clinic_name, experience_years, biography, timezone)
  VALUES (current_user_id, trim(p_specialty), trim(p_clinic_name), p_experience_years, trim(p_biography), trim(p_timezone))
  ON CONFLICT (id) DO UPDATE SET
    specialty = EXCLUDED.specialty,
    clinic_name = EXCLUDED.clinic_name,
    experience_years = EXCLUDED.experience_years,
    biography = EXCLUDED.biography,
    timezone = EXCLUDED.timezone;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_specialties()
RETURNS TABLE(specialty text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT d.specialty
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  WHERE NULLIF(trim(p.full_name), '') IS NOT NULL
  ORDER BY d.specialty;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_directory(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years,
    COALESCE(availability.available_dates, ARRAY[]::date[])
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates
    FROM public.appointment_slots s
    JOIN public.availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = d.id AND s.status = 'available' AND a.status = 'active'
      AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days'
      AND s.allocated_count < s.capacity
  ) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%')
    AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY cardinality(COALESCE(availability.available_dates, ARRAY[]::date[])) DESC, p.full_name;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_detail(p_doctor_id uuid)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, biography text, timezone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, d.biography, d.timezone
  FROM public.doctors d
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  WHERE d.id = p_doctor_id;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.public_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count
  FROM public.appointment_slots s
  JOIN public.availability_sessions a ON a.id = s.availability_session_id
  JOIN public.doctors d ON d.id = s.doctor_id
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active'
    AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity
  ORDER BY s.slot_start_at;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.public_doctor_specialties() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_doctor_directory(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_doctor_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_doctor_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_patient_onboarding(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_doctor_onboarding(text, text, text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_specialties() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_directory(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_detail(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_slots(uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
