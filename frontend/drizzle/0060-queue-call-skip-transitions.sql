CREATE OR REPLACE FUNCTION public.transition_queue_entry(p_entry_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_e public.queue_entries%ROWTYPE;
  v_session public.queue_sessions%ROWTYPE;
  v_a public.appointments%ROWTYPE;
  v_priority timestamptz;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_e FROM public.queue_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue entry not found'; END IF;
  SELECT * INTO v_a FROM public.appointments WHERE id = v_e.appointment_id FOR UPDATE;
  SELECT * INTO v_session FROM public.queue_sessions WHERE id = v_e.session_id FOR UPDATE;
  SELECT * INTO v_e FROM public.queue_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT public.queue_operator_allowed(v_session.doctor_id) THEN
    RAISE EXCEPTION 'Queue access denied' USING ERRCODE = '42501';
  END IF;
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment changed; refresh and retry'; END IF;

  IF p_action = 'call_next' THEN
    IF v_e.status <> 'waiting' OR v_e.checked_in_at IS NULL OR EXISTS (
      SELECT 1 FROM public.queue_entries WHERE session_id = v_session.id AND status IN ('called', 'in_consultation')
    ) OR v_e.id <> (SELECT id FROM public.queue_entries WHERE session_id = v_session.id
      AND status = 'waiting' AND checked_in_at IS NOT NULL
      ORDER BY priority_at, checked_in_at, id LIMIT 1) THEN
      RAISE EXCEPTION 'Queue changed; refresh and retry the call';
    END IF;
    UPDATE public.queue_entries
      SET status = 'in_consultation', called_at = now(), consultation_started_at = now(), updated_at = now()
      WHERE id = p_entry_id;
  ELSIF p_action = 'skip' THEN
    IF v_e.status NOT IN ('waiting', 'called') OR v_e.checked_in_at IS NULL THEN
      RAISE EXCEPTION 'Only a checked-in waiting or called patient can be skipped';
    END IF;
    UPDATE public.queue_entries SET status = 'skipped', updated_at = now() WHERE id = p_entry_id;
  ELSIF p_action = 'return' THEN
    IF v_e.status <> 'skipped' THEN RAISE EXCEPTION 'Only a skipped patient can return'; END IF;
    SELECT GREATEST(now(), COALESCE(max(priority_at), now())) + interval '1 microsecond'
      INTO v_priority FROM public.queue_entries
      WHERE session_id = v_session.id AND status = 'waiting' AND checked_in_at IS NOT NULL;
    UPDATE public.queue_entries SET status = 'waiting', priority_at = v_priority,
      called_at = NULL, updated_at = now() WHERE id = p_entry_id;
  ELSIF p_action = 'complete' THEN
    IF v_e.status <> 'in_consultation' THEN RAISE EXCEPTION 'Call the patient from the queue before completing'; END IF;
    UPDATE public.appointments SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE id = v_a.id AND status = 'confirmed';
    UPDATE public.queue_entries SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE id = p_entry_id;
  ELSE
    RAISE EXCEPTION 'Unknown queue action';
  END IF;
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    VALUES (v_a.id, v_e.id, auth.uid(), p_action);
END $$;

REVOKE ALL ON FUNCTION public.transition_queue_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_queue_entry(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
