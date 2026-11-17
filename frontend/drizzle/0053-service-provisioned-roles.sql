-- GoTrue sets invitation and app metadata after its initial auth.users INSERT.
-- Create the account with a public role, then let only the service role promote
-- its profile before the invitation is used.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
      AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Profile roles cannot be changed';
  END IF;
  RETURN NEW;
END $$;
