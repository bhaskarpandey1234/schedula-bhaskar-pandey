-- PostgREST switches the database role for service requests; it does not
-- populate the legacy request.jwt.claim.role setting in every deployment.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Profile roles cannot be changed';
  END IF;
  RETURN NEW;
END $$;
