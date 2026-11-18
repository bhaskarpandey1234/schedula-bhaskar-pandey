ALTER TABLE public.queue_entries ALTER COLUMN checked_in_at DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.queue_operator_allowed(p_doctor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.doctors d ON d.id = p_doctor
    WHERE p.id = auth.uid() AND (
      p.role::text = 'admin' OR
      (p.role::text = 'staff' AND EXISTS (
        SELECT 1 FROM public.staff_clinic_memberships m
        WHERE m.staff_id = p.id AND m.clinic_id = d.clinic_id
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.queue_operator_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_operator_allowed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_appointment_queue_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_slot public.appointment_slots%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_day date;
  v_session uuid;
  v_token integer;
  v_entry uuid;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.queue_entries WHERE appointment_id = NEW.id) THEN RETURN NEW; END IF;

  SELECT * INTO v_slot FROM public.appointment_slots WHERE id = NEW.slot_id;
  SELECT * INTO v_doctor FROM public.doctors WHERE id = NEW.doctor_id;
  v_day := (v_slot.slot_start_at AT TIME ZONE v_doctor.timezone)::date;

  INSERT INTO public.queue_sessions(clinic_id, doctor_id, service_date, timezone)
    VALUES (v_doctor.clinic_id, NEW.doctor_id, v_day, v_doctor.timezone)
    ON CONFLICT (doctor_id, service_date) DO NOTHING;
  SELECT id INTO v_session FROM public.queue_sessions
    WHERE doctor_id = NEW.doctor_id AND service_date = v_day FOR UPDATE;
  UPDATE public.queue_sessions SET last_token = last_token + 1
    WHERE id = v_session RETURNING last_token INTO v_token;

  INSERT INTO public.queue_entries(session_id, appointment_id, token_number, priority_at)
    VALUES (v_session, NEW.id, v_token, v_slot.slot_start_at)
    RETURNING id INTO v_entry;
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    VALUES (NEW.id, v_entry, auth.uid(), 'token_issued');

  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed' THEN
    INSERT INTO public.notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key)
      VALUES (NEW.patient_id, NEW.id, 'checkin_token', 'Your appointment queue token',
        'Your appointment is confirmed. Your queue token is T' || lpad(v_token::text, 3, '0') || '.',
        jsonb_build_object('token', 'T' || lpad(v_token::text, 3, '0')),
        'checkin-token/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_assign_queue_token
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.assign_appointment_queue_token();

DO $$
DECLARE v_appointment record;
BEGIN
  FOR v_appointment IN
    SELECT a.id FROM public.appointments a
    JOIN public.appointment_slots s ON s.id = a.slot_id
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM public.queue_entries e WHERE e.appointment_id = a.id)
    ORDER BY a.doctor_id, (s.slot_start_at AT TIME ZONE d.timezone)::date, a.created_at, a.id
  LOOP
    UPDATE public.appointments SET status = status WHERE id = v_appointment.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_patient_doctor_service_date_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_timezone text;
  v_service_date date;
BEGIN
  IF NEW.status IN ('cancelled', 'expired') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
      AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
      AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
      AND NEW.slot_id IS NOT DISTINCT FROM OLD.slot_id
      AND NOT (OLD.status IN ('cancelled', 'expired') AND NEW.status NOT IN ('cancelled', 'expired')) THEN
    RETURN NEW;
  END IF;

  SELECT d.timezone, (s.slot_start_at AT TIME ZONE d.timezone)::date
    INTO v_timezone, v_service_date
    FROM public.appointment_slots s
    JOIN public.doctors d ON d.id = NEW.doctor_id
    WHERE s.id = NEW.slot_id AND s.doctor_id = NEW.doctor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment slot does not match the selected doctor'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'appointment/' || NEW.patient_id::text || '/' || NEW.doctor_id::text || '/' || v_service_date::text, 0
  ));
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.appointment_slots s ON s.id = a.slot_id
    WHERE a.patient_id = NEW.patient_id AND a.doctor_id = NEW.doctor_id
      AND a.id IS DISTINCT FROM NEW.id
      AND a.status NOT IN ('cancelled', 'expired')
      AND (s.slot_start_at AT TIME ZONE v_timezone)::date = v_service_date
  ) THEN
    RAISE EXCEPTION 'Patient already has an active appointment with this doctor on this service date';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_daily_doctor_booking_limit
  BEFORE INSERT OR UPDATE OF patient_id, doctor_id, slot_id, status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_doctor_service_date_limit();

CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
RETURNS TABLE(entry_id uuid, token_number integer, checked_in_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_a public.appointments%ROWTYPE;
  v_s public.appointment_slots%ROWTYPE;
  v_d public.doctors%ROWTYPE;
  v_day date;
  v_at timestamptz;
  v_priority timestamptz;
  v_late_at timestamptz;
  v_entry public.queue_entries%ROWTYPE;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.appointment_slots WHERE id = v_a.slot_id;
  SELECT * INTO v_d FROM public.doctors WHERE id = v_a.doctor_id;
  v_day := (v_s.slot_start_at AT TIME ZONE v_d.timezone)::date;
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment changed; refresh and retry'; END IF;
  IF (now() AT TIME ZONE v_d.timezone)::date <> v_day THEN
    RAISE EXCEPTION 'Check-in opens on the appointment service date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'no_show') THEN
    RAISE EXCEPTION 'Reverse no-show before check-in';
  END IF;

  SELECT * INTO v_entry FROM public.queue_entries WHERE appointment_id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The appointment token is not available; refresh and try again'; END IF;
  IF v_entry.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT v_entry.id, v_entry.token_number, v_entry.checked_in_at;
    RETURN;
  END IF;

  v_at := now();
  v_late_at := LEAST(v_s.slot_end_at, v_s.slot_start_at + GREATEST(interval '15 minutes',
    (v_s.slot_end_at - v_s.slot_start_at) / GREATEST(v_s.capacity, 1)));
  v_priority := v_s.slot_start_at;
  IF v_at > v_late_at THEN
    SELECT GREATEST(v_priority, COALESCE(max(e.priority_at), v_priority)) + interval '1 microsecond'
      INTO v_priority FROM public.queue_entries e
      WHERE e.session_id = v_entry.session_id AND e.status = 'waiting' AND e.checked_in_at IS NOT NULL;
  END IF;

  INSERT INTO public.appointment_attendance(appointment_id, status, checked_in_at, checked_in_by)
    VALUES (p_appointment_id, 'checked_in', v_at, auth.uid())
    ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = v_at,
      checked_in_by = auth.uid(), no_show_at = NULL, no_show_by = NULL, updated_at = v_at;
  UPDATE public.queue_entries SET checked_in_at = v_at, priority_at = v_priority,
    status = 'waiting', updated_at = v_at WHERE id = v_entry.id;
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    VALUES (p_appointment_id, v_entry.id, auth.uid(), 'check_in');
  RETURN QUERY SELECT v_entry.id, v_entry.token_number, v_at;
END $$;
REVOKE ALL ON FUNCTION public.check_in_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_a public.appointments%ROWTYPE;
  v_s public.appointment_slots%ROWTYPE;
  v_timezone text;
  v_eligible timestamptz;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment is not confirmed'; END IF;
  SELECT * INTO v_s FROM public.appointment_slots WHERE id = v_a.slot_id;
  SELECT timezone INTO v_timezone FROM public.doctors WHERE id = v_a.doctor_id;
  IF (now() AT TIME ZONE v_timezone)::date <> (v_s.slot_start_at AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'No-show is available only on the service date';
  END IF;
  v_eligible := LEAST(v_s.slot_end_at, v_s.slot_start_at + GREATEST(interval '15 minutes',
    (v_s.slot_end_at - v_s.slot_start_at) / GREATEST(v_s.capacity, 1)));
  IF now() < v_eligible THEN RAISE EXCEPTION 'No-show grace period has not elapsed'; END IF;
  IF EXISTS (SELECT 1 FROM public.queue_entries WHERE appointment_id = p_appointment_id AND checked_in_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'checked_in') THEN
    RAISE EXCEPTION 'Checked-in patient must use the queue workflow';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'no_show') THEN
    RETURN;
  END IF;
  INSERT INTO public.appointment_attendance(appointment_id, status, no_show_at, no_show_by)
    VALUES (p_appointment_id, 'no_show', now(), auth.uid())
    ON CONFLICT (appointment_id) DO UPDATE SET status = 'no_show', no_show_at = now(),
      no_show_by = auth.uid(), updated_at = now();
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    SELECT p_appointment_id, e.id, auth.uid(), 'no_show'
    FROM public.queue_entries e WHERE e.appointment_id = p_appointment_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_appointment_no_show(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_appointment_no_show(p_appointment_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_a public.appointments%ROWTYPE;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_a.status <> 'confirmed' OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse no-show';
  END IF;
  UPDATE public.appointment_attendance SET status = 'eligible', no_show_at = NULL,
    no_show_by = NULL, updated_at = now()
    WHERE appointment_id = p_appointment_id AND status = 'no_show';
  IF NOT FOUND THEN RAISE EXCEPTION 'No-show state changed; refresh and retry'; END IF;
  INSERT INTO public.queue_events(appointment_id, actor_id, action, reason)
    VALUES (p_appointment_id, auth.uid(), 'reverse_no_show', btrim(p_reason));
END $$;
REVOKE ALL ON FUNCTION public.reverse_appointment_no_show(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_appointment_no_show(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_queue_entry(p_entry_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
      RAISE EXCEPTION 'Queue changed; refresh and call the next patient';
    END IF;
    UPDATE public.queue_entries SET status = 'called', called_at = now(), updated_at = now() WHERE id = p_entry_id;
  ELSIF p_action = 'call_again' THEN
    IF v_e.status <> 'called' THEN RAISE EXCEPTION 'Only a called patient can be called again'; END IF;
  ELSIF p_action = 'start' THEN
    IF v_e.status <> 'called' THEN RAISE EXCEPTION 'Call the patient before starting consultation'; END IF;
    UPDATE public.queue_entries SET status = 'in_consultation', consultation_started_at = now(), updated_at = now() WHERE id = p_entry_id;
  ELSIF p_action = 'skip' THEN
    IF v_e.status <> 'called' OR v_e.called_at > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Wait five minutes after the first call before skipping';
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
    IF v_e.status <> 'in_consultation' THEN RAISE EXCEPTION 'Start consultation before completing'; END IF;
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

CREATE OR REPLACE FUNCTION public.sync_appointment_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_slot public.appointment_slots%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_session uuid;
  v_token integer;
  v_day date;
  v_old_token integer;
  v_activated timestamptz;
  v_start timestamptz;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE appointment_id = NEW.id FOR UPDATE;
  IF NEW.slot_id IS DISTINCT FROM OLD.slot_id AND v_entry.id IS NOT NULL
      AND v_entry.status NOT IN ('cancelled', 'completed') THEN
    IF v_entry.checked_in_at IS NOT NULL THEN
      RAISE EXCEPTION 'Checked-in visit cannot be rescheduled; resolve the queue first';
    END IF;
    SELECT * INTO v_slot FROM public.appointment_slots WHERE id = NEW.slot_id;
    SELECT * INTO v_doctor FROM public.doctors WHERE id = NEW.doctor_id;
    v_day := (v_slot.slot_start_at AT TIME ZONE v_doctor.timezone)::date;
    IF v_day <> (SELECT qs.service_date FROM public.queue_sessions qs WHERE qs.id = v_entry.session_id)
        OR NEW.doctor_id <> (SELECT qs.doctor_id FROM public.queue_sessions qs WHERE qs.id = v_entry.session_id) THEN
      v_old_token := v_entry.token_number;
      INSERT INTO public.queue_sessions(clinic_id, doctor_id, service_date, timezone)
        VALUES (v_doctor.clinic_id, NEW.doctor_id, v_day, v_doctor.timezone)
        ON CONFLICT (doctor_id, service_date) DO NOTHING;
      SELECT id INTO v_session FROM public.queue_sessions
        WHERE doctor_id = NEW.doctor_id AND service_date = v_day FOR UPDATE;
      UPDATE public.queue_sessions SET last_token = last_token + 1
        WHERE id = v_session RETURNING last_token INTO v_token;
      UPDATE public.queue_entries SET session_id = v_session, token_number = v_token,
        priority_at = v_slot.slot_start_at, updated_at = now() WHERE id = v_entry.id;
      INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action, reason)
        VALUES (NEW.id, v_entry.id, auth.uid(), 'token_reassigned',
          'Token T' || lpad(v_old_token::text, 3, '0') || ' reassigned to T' || lpad(v_token::text, 3, '0') || ' after rescheduling.');
      INSERT INTO public.notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key)
        VALUES (NEW.patient_id, NEW.id, 'checkin_token', 'Your updated appointment queue token',
          'Your rescheduled appointment has queue token T' || lpad(v_token::text, 3, '0') || '.',
          jsonb_build_object('token', 'T' || lpad(v_token::text, 3, '0')),
          'checkin-token-rescheduled/' || NEW.id::text || '/' || v_token::text)
        ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.queue_entries SET priority_at = v_slot.slot_start_at, updated_at = now()
        WHERE id = v_entry.id;
    END IF;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND v_entry.id IS NOT NULL THEN
    IF v_entry.status = 'in_consultation' THEN
      RAISE EXCEPTION 'Active consultation cannot be cancelled';
    END IF;
    UPDATE public.queue_entries SET status = 'cancelled', updated_at = now()
      WHERE id = v_entry.id AND status NOT IN ('cancelled', 'completed');
    UPDATE public.notification_deliveries SET status = 'cancelled', updated_at = now()
      WHERE appointment_id = NEW.id AND template = 'checkin_token' AND status IN ('pending', 'processing');
    INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
      VALUES (NEW.id, v_entry.id, auth.uid(), 'appointment_cancelled');
  END IF;
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    SELECT activated_at INTO v_activated FROM public.queue_feature_config LIMIT 1;
    SELECT slot_start_at INTO v_start FROM public.appointment_slots WHERE id = NEW.slot_id;
    IF v_start >= v_activated AND (v_entry.id IS NULL OR v_entry.status <> 'in_consultation') THEN
      RAISE EXCEPTION 'Start consultation from the queue before completing';
    END IF;
    IF v_entry.id IS NOT NULL THEN
      UPDATE public.queue_entries SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE id = v_entry.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION public.queue_appointment_board(uuid, uuid);
CREATE FUNCTION public.queue_appointment_board(
  p_clinic_id uuid DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_service_date date DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL
)
RETURNS TABLE(
  appointment_id uuid, doctor_id uuid, doctor_name text, patient_id uuid,
  patient_name text, patient_phone text, slot_id uuid, slot_start_at timestamptz,
  slot_end_at timestamptz, timezone text, appointment_status text,
  attendance_status text, checked_in_at timestamptz, token_number integer,
  queue_status text, queue_position bigint, no_show_eligible_at timestamptz,
  called_at timestamptz, entry_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  RETURN QUERY
  WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  )
  SELECT a.id, a.doctor_id, dp.full_name, a.patient_id, pp.full_name, patient.phone,
    s.id, s.slot_start_at, s.slot_end_at, d.timezone, a.status::text,
    att.status::text, att.checked_in_at, e.token_number, e.status::text, waiting.pos,
    LEAST(s.slot_end_at, s.slot_start_at + GREATEST(interval '15 minutes',
      (s.slot_end_at - s.slot_start_at) / GREATEST(s.capacity, 1))), e.called_at, e.id
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles dp ON dp.id = d.id
  JOIN public.profiles pp ON pp.id = a.patient_id
  JOIN public.patients patient ON patient.id = a.patient_id
  JOIN public.appointment_slots s ON s.id = a.slot_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE ((p_service_date IS NULL AND (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date)
      OR (p_service_date IS NOT NULL AND (s.slot_start_at AT TIME ZONE d.timezone)::date = p_service_date))
    AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
    AND (p_clinic_id IS NULL OR d.clinic_id = p_clinic_id)
    AND (p_slot_id IS NULL OR s.id = p_slot_id)
    AND public.queue_operator_allowed(a.doctor_id)
    AND a.status IN ('confirmed', 'completed', 'cancelled')
  ORDER BY s.slot_start_at, a.created_at, a.id;
END $$;
REVOKE ALL ON FUNCTION public.queue_appointment_board(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_appointment_board(uuid, uuid, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_queue_status()
RETURNS TABLE(appointment_id uuid, checked_in_at timestamptz, attendance_status text,
  token_number integer, queue_status text, queue_position bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Patient access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  )
  SELECT a.id, att.checked_in_at, att.status::text, e.token_number, e.status::text, waiting.pos
  FROM public.appointments a
  JOIN public.appointment_slots s ON s.id = a.slot_id
  JOIN public.doctors d ON d.id = a.doctor_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE a.patient_id = auth.uid()
    AND (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date
    AND a.status IN ('confirmed', 'completed', 'cancelled')
    AND (a.status = 'confirmed' OR e.id IS NOT NULL)
    AND (att.appointment_id IS NOT NULL OR e.id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.patient_queue_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_queue_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.doctor_queue_summary(p_doctor_id uuid)
RETURNS TABLE(
  slot_start_at timestamptz, slot_end_at timestamptz, timezone text,
  total bigint, remaining bigint, waiting bigint, completed bigint,
  current_token integer, next_token integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor' AND id = p_doctor_id
  ) THEN RAISE EXCEPTION 'Doctor access required' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  WITH positions AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS position
    FROM public.queue_entries e
    WHERE e.status = 'waiting' AND e.checked_in_at IS NOT NULL
  ),
  sessions AS (
    SELECT s.id AS slot_id, s.slot_start_at, s.slot_end_at, d.timezone
    FROM public.appointment_slots s
    JOIN public.doctors d ON d.id = s.doctor_id
    WHERE s.doctor_id = p_doctor_id
      AND (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date
      AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.slot_id = s.id AND a.status IN ('confirmed', 'completed')
      )
  ),
  selected_session AS (
    SELECT sessions.slot_start_at, sessions.slot_end_at, sessions.timezone
    FROM sessions
    GROUP BY sessions.slot_start_at, sessions.slot_end_at, sessions.timezone
    ORDER BY
      CASE
        WHEN sessions.slot_start_at <= now() AND sessions.slot_end_at > now() THEN 0
        WHEN sessions.slot_start_at > now() THEN 1
        ELSE 2
      END,
      CASE WHEN sessions.slot_start_at > now() THEN sessions.slot_start_at END ASC,
      CASE WHEN sessions.slot_end_at <= now() THEN sessions.slot_end_at END DESC,
      sessions.slot_start_at
    LIMIT 1
  ),
  appointments AS (
    SELECT a.status::text AS appointment_status, att.status::text AS attendance_status,
      e.status::text AS queue_status, e.token_number, e.checked_in_at,
      positions.position
    FROM selected_session selected
    JOIN public.appointment_slots slot ON slot.doctor_id = p_doctor_id
      AND slot.slot_start_at = selected.slot_start_at AND slot.slot_end_at = selected.slot_end_at
    JOIN public.appointments a ON a.slot_id = slot.id
    LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
    LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
    LEFT JOIN positions ON positions.id = e.id
    WHERE a.status IN ('confirmed', 'completed')
  )
  SELECT selected.slot_start_at, selected.slot_end_at, selected.timezone,
    count(*),
    count(*) FILTER (WHERE a.appointment_status = 'confirmed'
      AND a.queue_status IS DISTINCT FROM 'completed'
      AND a.attendance_status IS DISTINCT FROM 'no_show'),
    count(*) FILTER (WHERE a.appointment_status = 'confirmed'
      AND a.queue_status = 'waiting' AND a.checked_in_at IS NOT NULL),
    count(*) FILTER (WHERE a.appointment_status = 'completed' OR a.queue_status = 'completed'),
    max(a.token_number) FILTER (WHERE a.queue_status IN ('called', 'in_consultation')),
    (array_agg(a.token_number ORDER BY a.position) FILTER (
      WHERE a.appointment_status = 'confirmed' AND a.queue_status = 'waiting' AND a.checked_in_at IS NOT NULL
    ))[1]
  FROM selected_session selected
  LEFT JOIN appointments a ON true
  GROUP BY selected.slot_start_at, selected.slot_end_at, selected.timezone;
END $$;
REVOKE ALL ON FUNCTION public.doctor_queue_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_queue_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_doctor_directory(p_clinic_id uuid DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, doctor_name text, clinic_id uuid, timezone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'Queue access denied' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT d.id, p.full_name, d.clinic_id, d.timezone
  FROM public.doctors d JOIN public.profiles p ON p.id = d.id
  WHERE (p_clinic_id IS NULL OR d.clinic_id = p_clinic_id)
    AND (v_role = 'admin' OR EXISTS (
      SELECT 1 FROM public.staff_clinic_memberships m
      WHERE m.staff_id = auth.uid() AND m.clinic_id = d.clinic_id
    ))
  ORDER BY p.full_name, d.id;
END $$;
REVOKE ALL ON FUNCTION public.queue_doctor_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_doctor_directory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_appointment_queue_token(p_appointment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_token integer;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = p_appointment_id AND patient_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  SELECT token_number INTO v_token FROM public.queue_entries WHERE appointment_id = p_appointment_id;
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.patient_appointment_queue_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_appointment_queue_token(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_doctor_appointment(uuid) FROM PUBLIC, authenticated;

NOTIFY pgrst, 'reload schema';
