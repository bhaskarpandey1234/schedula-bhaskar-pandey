-- Supabase Auth email confirmation is an authorization prerequisite for application mutations.

CREATE OR REPLACE FUNCTION public.assert_verified_user(p_user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_confirmed_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the current user can verify this session';
  END IF;
  SELECT email_confirmed_at INTO v_confirmed_at FROM auth.users WHERE id = p_user_id;
  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'EMAIL_NOT_VERIFIED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_complete_scheduling_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'availability_sessions' AND NEW.doctor_id = auth.uid() THEN
    PERFORM public.assert_verified_user(auth.uid());
    IF TG_OP = 'INSERT' THEN
      PERFORM public.assert_complete_profile(auth.uid(), 'doctor'::user_role);
    ELSIF NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.session_date IS DISTINCT FROM OLD.session_date OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week OR NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time OR NEW.timezone IS DISTINCT FROM OLD.timezone OR NEW.interval_minutes IS DISTINCT FROM OLD.interval_minutes OR NEW.capacity IS DISTINCT FROM OLD.capacity THEN
      PERFORM public.assert_complete_profile(auth.uid(), 'doctor'::user_role);
    END IF;
  ELSIF TG_TABLE_NAME = 'appointments' AND (NEW.patient_id = auth.uid() OR NEW.doctor_id = auth.uid()) THEN
    PERFORM public.assert_verified_user(auth.uid());
    IF NEW.patient_id = auth.uid() AND (TG_OP = 'INSERT' OR NEW.slot_id IS DISTINCT FROM OLD.slot_id) THEN
      PERFORM public.assert_complete_profile(auth.uid(), 'patient'::user_role);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_verified_profile_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    PERFORM public.assert_verified_user(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_verified_mutation_gate ON public.profiles;
CREATE TRIGGER profiles_verified_mutation_gate
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_profile_mutation();
DROP TRIGGER IF EXISTS patients_verified_mutation_gate ON public.patients;
CREATE TRIGGER patients_verified_mutation_gate
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_profile_mutation();
DROP TRIGGER IF EXISTS doctors_verified_mutation_gate ON public.doctors;
CREATE TRIGGER doctors_verified_mutation_gate
  BEFORE INSERT OR UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_profile_mutation();

DROP TRIGGER IF EXISTS appointments_profile_completion_gate ON public.appointments;
CREATE TRIGGER appointments_profile_completion_gate
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complete_scheduling_profile();

REVOKE ALL ON FUNCTION public.assert_verified_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_verified_profile_mutation() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
