CREATE OR REPLACE FUNCTION public.update_patient_profile(
  p_full_name text,
  p_phone text,
  p_date_of_birth date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can update this profile'; END IF;
  IF NULLIF(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'A full name is required'; END IF;
  UPDATE public.profiles SET full_name = trim(p_full_name) WHERE id = current_user_id;
  INSERT INTO public.patients (id, phone, date_of_birth) VALUES (current_user_id, trim(p_phone), p_date_of_birth)
  ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.update_doctor_profile(
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
DECLARE current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctors can update this profile'; END IF;
  IF NULLIF(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'A full name is required'; END IF;
  UPDATE public.profiles SET full_name = trim(p_full_name) WHERE id = current_user_id;
  UPDATE public.doctors SET specialty = trim(p_specialty), clinic_name = trim(p_clinic_name), experience_years = p_experience_years, biography = trim(p_biography), timezone = trim(p_timezone) WHERE id = current_user_id;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.doctor_appointments(p_tab text DEFAULT 'upcoming')
RETURNS TABLE(appointment_id uuid, patient_name text, status public.appointment_status, reason text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, patient_profile.full_name, a.status, a.reason, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at
  FROM public.appointments a
  JOIN public.appointment_slots s ON s.id = a.slot_id
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles patient_profile ON patient_profile.id = a.patient_id
  WHERE a.doctor_id = auth.uid()
    AND (p_tab = 'cancelled' AND a.status = 'cancelled' OR p_tab = 'past' AND s.slot_end_at < now() AND a.status <> 'cancelled' OR p_tab = 'upcoming' AND s.slot_end_at >= now() AND a.status = 'confirmed')
  ORDER BY s.slot_start_at;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.update_patient_profile(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_doctor_profile(text, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_appointments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_patient_profile(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_doctor_profile(text, text, text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_appointments(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
