-- Auth invitations are issued by the service role. Public signups cannot set
-- invited_at, so an invited privileged role cannot be self-selected.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role public.user_role; v_public_role text;
BEGIN
  v_public_role := NEW.raw_user_meta_data ->> 'role';
  IF v_public_role IN ('admin', 'staff') AND NEW.invited_at IS NOT NULL THEN
    v_role := v_public_role::public.user_role;
  ELSIF v_public_role IN ('patient', 'doctor') THEN
    v_role := v_public_role::public.user_role;
  ELSE
    RAISE EXCEPTION 'A valid role is required';
  END IF;
  INSERT INTO public.profiles(id, full_name, role)
  VALUES (NEW.id, NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), v_role);
  RETURN NEW;
END $$;

-- Account deletion can cascade through profiles and appointments in either
-- order. Defer the attendance reference until all cascades have completed.
ALTER TABLE public.appointment_attendance
  ALTER CONSTRAINT appointment_attendance_appointment_id_fkey DEFERRABLE INITIALLY DEFERRED;
