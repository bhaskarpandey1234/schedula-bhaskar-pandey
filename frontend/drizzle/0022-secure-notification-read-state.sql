-- Keep authenticated notification reads and read-state changes on the same
-- Supabase/RLS path. Only the notification recipient can mutate read_at.

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id
    AND recipient_id = v_user_id
    AND read_at IS NULL;

  SELECT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE id = p_notification_id
      AND recipient_id = v_user_id
      AND read_at IS NOT NULL
  ) INTO v_updated;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_id = v_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

NOTIFY pgrst, 'reload schema';
