-- Profile completeness is a shared authorization invariant for scheduling actions.

ALTER TABLE public.patients
  ADD CONSTRAINT patients_phone_e164_check CHECK (phone ~ '^[+][1-9][0-9]{7,14}$') NOT VALID;
ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_phone_e164_check CHECK (phone IS NULL OR phone ~ '^[+][1-9][0-9]{7,14}$') NOT VALID,
  ADD CONSTRAINT doctors_experience_years_check CHECK (experience_years >= 0) NOT VALID,
  ADD CONSTRAINT doctors_biography_length_check CHECK (length(btrim(biography)) >= 20) NOT VALID,
  ADD CONSTRAINT doctors_fee_check CHECK (consultation_fee_minor IS NULL OR consultation_fee_minor > 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.profile_completion_status(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(complete boolean, missing_fields text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role user_role;
  v_email text;
  v_full_name text;
  v_phone text;
  v_dob date;
  v_specialty text;
  v_clinic text;
  v_experience integer;
  v_biography text;
  v_timezone text;
  v_fee integer;
  v_currency text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the current user can inspect profile completeness';
  END IF;
  SELECT p.role, p.full_name, u.email INTO v_role, v_full_name, v_email
    FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = p_user_id;
  IF v_email IS NULL OR btrim(v_email) = '' THEN v_missing := array_append(v_missing, 'email'); END IF;
  IF v_full_name IS NULL OR btrim(v_full_name) = '' THEN v_missing := array_append(v_missing, 'fullName'); END IF;

  IF v_role = 'patient' THEN
    SELECT phone, date_of_birth INTO v_phone, v_dob FROM patients WHERE id = p_user_id;
    IF v_phone IS NULL OR v_phone !~ '^[+][1-9][0-9]{7,14}$' THEN v_missing := array_append(v_missing, 'phone'); END IF;
    IF v_dob IS NULL OR v_dob > CURRENT_DATE OR v_dob < (CURRENT_DATE - interval '120 years')::date THEN v_missing := array_append(v_missing, 'dateOfBirth'); END IF;
  ELSIF v_role = 'doctor' THEN
    SELECT phone, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency
      INTO v_phone, v_specialty, v_clinic, v_experience, v_biography, v_timezone, v_fee, v_currency
      FROM doctors WHERE id = p_user_id;
    IF v_phone IS NULL OR v_phone !~ '^[+][1-9][0-9]{7,14}$' THEN v_missing := array_append(v_missing, 'phone'); END IF;
    IF v_specialty IS NULL OR btrim(v_specialty) = '' THEN v_missing := array_append(v_missing, 'specialty'); END IF;
    IF v_clinic IS NULL OR btrim(v_clinic) = '' THEN v_missing := array_append(v_missing, 'clinicName'); END IF;
    IF v_experience IS NULL OR v_experience < 0 THEN v_missing := array_append(v_missing, 'experienceYears'); END IF;
    IF v_biography IS NULL OR length(btrim(v_biography)) < 20 THEN v_missing := array_append(v_missing, 'biography'); END IF;
    IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN v_missing := array_append(v_missing, 'timezone'); END IF;
    IF v_fee IS NULL OR v_fee <= 0 OR v_currency <> 'INR' THEN v_missing := array_append(v_missing, 'consultationFee'); END IF;
  ELSE
    v_missing := array_append(v_missing, 'fullName');
  END IF;
  RETURN QUERY SELECT cardinality(v_missing) = 0, v_missing;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_complete_profile(p_user_id uuid, p_role user_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_complete boolean; v_missing text[];
BEGIN
  SELECT s.complete, s.missing_fields INTO v_complete, v_missing FROM public.profile_completion_status(p_user_id) s;
  IF NOT v_complete THEN RAISE EXCEPTION 'PROFILE_INCOMPLETE:%', array_to_string(v_missing, ','); END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_complete_scheduling_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'availability_sessions' AND NEW.doctor_id = auth.uid() THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.assert_complete_profile(auth.uid(), 'doctor'::user_role);
    ELSIF NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.session_date IS DISTINCT FROM OLD.session_date OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week OR NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time OR NEW.timezone IS DISTINCT FROM OLD.timezone OR NEW.interval_minutes IS DISTINCT FROM OLD.interval_minutes OR NEW.capacity IS DISTINCT FROM OLD.capacity THEN
      PERFORM public.assert_complete_profile(auth.uid(), 'doctor'::user_role);
    END IF;
  ELSIF TG_TABLE_NAME = 'appointments' AND NEW.patient_id = auth.uid() AND (TG_OP = 'INSERT' OR NEW.slot_id IS DISTINCT FROM OLD.slot_id) THEN
    PERFORM public.assert_complete_profile(auth.uid(), 'patient'::user_role);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_profile_completion_gate ON public.availability_sessions;
CREATE TRIGGER availability_profile_completion_gate
  BEFORE INSERT ON public.availability_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_scheduling_profile();
DROP TRIGGER IF EXISTS availability_profile_completion_update_gate ON public.availability_sessions;
CREATE TRIGGER availability_profile_completion_update_gate
  BEFORE UPDATE ON public.availability_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_scheduling_profile();
DROP TRIGGER IF EXISTS appointments_profile_completion_gate ON public.appointments;
CREATE TRIGGER appointments_profile_completion_gate
  BEFORE INSERT OR UPDATE OF slot_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_scheduling_profile();

CREATE OR REPLACE FUNCTION public.complete_patient_onboarding(p_full_name text, p_phone text, p_date_of_birth date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patient accounts can complete patient onboarding'; END IF;
  IF NULLIF(btrim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'A full name is required'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^[+][1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'A valid international phone number is required'; END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth > CURRENT_DATE OR p_date_of_birth < (CURRENT_DATE - interval '120 years')::date THEN RAISE EXCEPTION 'A valid date of birth is required'; END IF;
  UPDATE profiles SET full_name = btrim(p_full_name) WHERE id = auth.uid();
  INSERT INTO patients(id, phone, date_of_birth) VALUES (auth.uid(), btrim(p_phone), p_date_of_birth)
  ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_patient_profile(p_full_name text, p_phone text, p_date_of_birth date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.complete_patient_onboarding(p_full_name, p_phone, p_date_of_birth);
END;
$$;

DROP FUNCTION IF EXISTS public.complete_doctor_onboarding(text, text, text, integer, text, text);
CREATE OR REPLACE FUNCTION public.complete_doctor_onboarding(p_full_name text, p_phone text, p_specialty text, p_clinic_name text, p_experience_years integer, p_biography text, p_timezone text, p_consultation_fee_minor integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor') THEN RAISE EXCEPTION 'Only authenticated doctor accounts can complete doctor onboarding'; END IF;
  IF NULLIF(btrim(p_full_name), '') IS NULL OR p_phone IS NULL OR p_phone !~ '^[+][1-9][0-9]{7,14}$' OR NULLIF(btrim(p_specialty), '') IS NULL OR NULLIF(btrim(p_clinic_name), '') IS NULL OR p_experience_years IS NULL OR p_experience_years < 0 OR p_biography IS NULL OR length(btrim(p_biography)) < 20 OR p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) OR p_consultation_fee_minor IS NULL OR p_consultation_fee_minor <= 0 THEN RAISE EXCEPTION 'All doctor profile fields are required'; END IF;
  UPDATE profiles SET full_name = btrim(p_full_name) WHERE id = auth.uid();
  INSERT INTO doctors(id, phone, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency)
    VALUES (auth.uid(), btrim(p_phone), btrim(p_specialty), btrim(p_clinic_name), p_experience_years, btrim(p_biography), p_timezone, p_consultation_fee_minor, 'INR')
    ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, specialty = EXCLUDED.specialty, clinic_name = EXCLUDED.clinic_name, experience_years = EXCLUDED.experience_years, biography = EXCLUDED.biography, timezone = EXCLUDED.timezone, consultation_fee_minor = EXCLUDED.consultation_fee_minor, consultation_currency = 'INR';
END;
$$;

DROP FUNCTION IF EXISTS public.update_doctor_profile(text, text, text, integer, text, text);
CREATE OR REPLACE FUNCTION public.update_doctor_profile(p_full_name text, p_phone text, p_specialty text, p_clinic_name text, p_experience_years integer, p_biography text, p_timezone text, p_consultation_fee_minor integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.complete_doctor_onboarding(p_full_name, p_phone, p_specialty, p_clinic_name, p_experience_years, p_biography, p_timezone, p_consultation_fee_minor);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_complete_profile(uuid, user_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_complete_scheduling_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_completion_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_patient_onboarding(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_profile(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_doctor_onboarding(text, text, text, text, integer, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_doctor_profile(text, text, text, text, integer, text, text, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
