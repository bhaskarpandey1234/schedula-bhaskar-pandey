-- Prevent recurring availability from bypassing the future-start rule through direct RPC calls.
CREATE OR REPLACE FUNCTION public.validate_recurring_availability_start()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IN ('weekly', 'monthly')
    AND NEW.recurrence_start_date IS NOT NULL
    AND NEW.start_time IS NOT NULL
    AND NEW.timezone IS NOT NULL
    AND ((NEW.recurrence_start_date + NEW.start_time) AT TIME ZONE NEW.timezone) <= now() THEN
    RAISE EXCEPTION 'Availability must start in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_sessions_validate_recurring_start ON public.availability_sessions;
CREATE TRIGGER availability_sessions_validate_recurring_start
  BEFORE INSERT ON public.availability_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_recurring_availability_start();

NOTIFY pgrst, 'reload schema';
