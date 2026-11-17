-- Clinic access and patient flow. Apply after 0048 role extensions.

CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ADD COLUMN clinic_id uuid REFERENCES public.clinics(id);

-- An existing doctor's clinic name is only a label. Do not join unrelated
-- practices by comparing that free-text value.
DO $$ DECLARE d record; v_clinic uuid; BEGIN
  FOR d IN SELECT id, clinic_name, timezone FROM public.doctors WHERE clinic_id IS NULL LOOP
    INSERT INTO public.clinics(name, timezone) VALUES (d.clinic_name, d.timezone) RETURNING id INTO v_clinic;
    UPDATE public.doctors SET clinic_id = v_clinic WHERE id = d.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assign_new_doctor_clinic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    INSERT INTO public.clinics(name, timezone) VALUES (NEW.clinic_name, NEW.timezone) RETURNING id INTO NEW.clinic_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER doctors_default_clinic BEFORE INSERT ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.assign_new_doctor_clinic();

CREATE TABLE public.staff_clinic_memberships (
  staff_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_clinic_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_membership_own_read ON public.staff_clinic_memberships
  FOR SELECT TO authenticated USING (staff_id = auth.uid());
GRANT SELECT ON public.staff_clinic_memberships TO authenticated;

-- Privileged accounts must be provisioned using Auth app_metadata by the
-- service role. User metadata remains limited to the public signup roles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role public.user_role; v_public_role text; v_privileged_role text;
BEGIN
  v_public_role := NEW.raw_user_meta_data ->> 'role';
  v_privileged_role := NEW.raw_app_meta_data ->> 'schedula_role';
  IF v_privileged_role IN ('admin', 'staff') THEN
    v_role := v_privileged_role::public.user_role;
  ELSIF v_public_role = 'staff' AND NEW.invited_at IS NOT NULL THEN
    v_role := 'staff';
  ELSIF v_public_role IN ('patient', 'doctor') THEN
    v_role := v_public_role::public.user_role;
  ELSE
    RAISE EXCEPTION 'A valid role is required';
  END IF;
  INSERT INTO public.profiles(id, full_name, role)
  VALUES (NEW.id, NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), v_role);
  RETURN NEW;
END $$;

CREATE TYPE public.attendance_status AS ENUM ('eligible', 'checked_in', 'no_show');
CREATE TYPE public.queue_entry_status AS ENUM ('waiting', 'called', 'in_consultation', 'skipped', 'completed', 'cancelled');

CREATE TABLE public.appointment_attendance (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL,
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  no_show_at timestamptz,
  no_show_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queue_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  service_date date NOT NULL,
  timezone text NOT NULL,
  last_token integer NOT NULL DEFAULT 0 CHECK (last_token >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(doctor_id, service_date)
);
CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.queue_sessions(id),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  token_number integer NOT NULL CHECK (token_number > 0),
  status public.queue_entry_status NOT NULL DEFAULT 'waiting',
  priority_at timestamptz NOT NULL,
  checked_in_at timestamptz NOT NULL,
  called_at timestamptz,
  consultation_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, token_number)
);
CREATE UNIQUE INDEX queue_one_current_per_session ON public.queue_entries(session_id)
  WHERE status IN ('called', 'in_consultation');
CREATE INDEX queue_waiting_order_idx ON public.queue_entries(session_id, priority_at, checked_in_at, id)
  WHERE status = 'waiting';
CREATE TABLE public.queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_events_appointment_idx ON public.queue_events(appointment_id, created_at DESC);
CREATE TABLE public.queue_feature_config (activated_at timestamptz NOT NULL);
INSERT INTO public.queue_feature_config VALUES (now());

ALTER TABLE public.appointment_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_feature_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.queue_operator_allowed(p_doctor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.doctors d ON d.id = p_doctor
    WHERE p.id = auth.uid() AND (
      p.role::text = 'admin' OR
      (p.role = 'doctor' AND p.id = p_doctor) OR
      (p.role::text = 'staff' AND EXISTS (
        SELECT 1 FROM public.staff_clinic_memberships m
        WHERE m.staff_id = p.id AND m.clinic_id = d.clinic_id
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.queue_operator_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_operator_allowed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_appointment_board(p_clinic_id uuid DEFAULT NULL, p_doctor_id uuid DEFAULT NULL)
RETURNS TABLE(appointment_id uuid, doctor_id uuid, doctor_name text, patient_name text,
  slot_start_at timestamptz, slot_end_at timestamptz, timezone text,
  appointment_status text, attendance_status text, checked_in_at timestamptz,
  token_number integer, queue_status text, queue_position bigint, no_show_eligible_at timestamptz,
  called_at timestamptz,
  entry_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  RETURN QUERY
  WITH waiting AS (
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS pos
    FROM public.queue_entries e WHERE e.status = 'waiting'
  )
  SELECT a.id, a.doctor_id, dp.full_name, pp.full_name, s.slot_start_at, s.slot_end_at,
    d.timezone, a.status::text, att.status::text, att.checked_in_at,
    e.token_number, e.status::text, waiting.pos,
    LEAST(s.slot_end_at, s.slot_start_at + GREATEST(interval '15 minutes',
      (s.slot_end_at - s.slot_start_at) / GREATEST(s.capacity, 1))), e.called_at, e.id
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles dp ON dp.id = d.id
  JOIN public.profiles pp ON pp.id = a.patient_id
  JOIN public.appointment_slots s ON s.id = a.slot_id
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE (s.slot_start_at AT TIME ZONE d.timezone)::date = (now() AT TIME ZONE d.timezone)::date
    AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
    AND (p_clinic_id IS NULL OR d.clinic_id = p_clinic_id)
    AND public.queue_operator_allowed(a.doctor_id)
    AND a.status IN ('confirmed', 'completed', 'cancelled')
  ORDER BY s.slot_start_at, a.created_at, a.id;
END $$;
REVOKE ALL ON FUNCTION public.queue_appointment_board(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_appointment_board(uuid, uuid) TO authenticated;

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
    FROM public.queue_entries e WHERE e.status = 'waiting'
  )
  SELECT a.id, att.checked_in_at, att.status::text, e.token_number, e.status::text, waiting.pos
  FROM public.appointments a
  LEFT JOIN public.appointment_attendance att ON att.appointment_id = a.id
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  LEFT JOIN waiting ON waiting.id = e.id
  WHERE a.patient_id = auth.uid() AND (att.appointment_id IS NOT NULL OR e.id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.patient_queue_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_queue_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
RETURNS TABLE(entry_id uuid, token_number integer, checked_in_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_a public.appointments%ROWTYPE; v_s public.appointment_slots%ROWTYPE;
  v_d public.doctors%ROWTYPE; v_day date; v_session uuid; v_token integer;
  v_at timestamptz; v_priority timestamptz; v_late_at timestamptz; v_existing record;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR NOT public.queue_operator_allowed(v_a.doctor_id) THEN
    RAISE EXCEPTION 'Appointment not found or access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.appointment_slots WHERE id = v_a.slot_id;
  SELECT * INTO v_d FROM public.doctors WHERE id = v_a.doctor_id;
  v_day := (v_s.slot_start_at AT TIME ZONE v_d.timezone)::date;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_a.doctor_id::text || '/' || v_day::text, 0));
  SELECT * INTO v_a FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  SELECT e.id, e.token_number, e.checked_in_at INTO v_existing
    FROM public.queue_entries e WHERE e.appointment_id = p_appointment_id;
  IF FOUND AND v_a.status = 'confirmed' THEN
    RETURN QUERY SELECT v_existing.id, v_existing.token_number, v_existing.checked_in_at;
    RETURN;
  END IF;
  IF v_a.status <> 'confirmed' OR v_a.slot_id <> v_s.id THEN
    RAISE EXCEPTION 'Appointment changed; refresh and retry';
  END IF;
  IF (now() AT TIME ZONE v_d.timezone)::date <> v_day THEN
    RAISE EXCEPTION 'Check-in opens on the appointment service date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_attendance WHERE appointment_id = p_appointment_id AND status = 'no_show') THEN
    RAISE EXCEPTION 'Reverse no-show before check-in';
  END IF;
  INSERT INTO public.queue_sessions(clinic_id, doctor_id, service_date, timezone)
    VALUES (v_d.clinic_id, v_a.doctor_id, v_day, v_d.timezone)
    ON CONFLICT (doctor_id, service_date) DO NOTHING;
  SELECT id INTO v_session FROM public.queue_sessions
    WHERE doctor_id = v_a.doctor_id AND service_date = v_day FOR UPDATE;
  UPDATE public.queue_sessions SET last_token = last_token + 1 WHERE id = v_session
    RETURNING last_token INTO v_token;
  v_at := now();
  v_late_at := LEAST(v_s.slot_end_at, v_s.slot_start_at + GREATEST(interval '15 minutes',
    (v_s.slot_end_at - v_s.slot_start_at) / GREATEST(v_s.capacity, 1)));
  v_priority := v_s.slot_start_at;
  IF v_at > v_late_at THEN
    SELECT GREATEST(v_priority, COALESCE(max(e.priority_at), v_priority)) + interval '1 microsecond'
      INTO v_priority FROM public.queue_entries e
      WHERE e.session_id = v_session AND e.status = 'waiting';
  END IF;
  INSERT INTO public.appointment_attendance(appointment_id, status, checked_in_at, checked_in_by)
    VALUES (p_appointment_id, 'checked_in', v_at, auth.uid())
    ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = v_at,
      checked_in_by = auth.uid(), updated_at = v_at;
  INSERT INTO public.queue_entries(session_id, appointment_id, token_number, priority_at, checked_in_at)
    VALUES (v_session, p_appointment_id, v_token, v_priority, v_at) RETURNING id INTO entry_id;
  INSERT INTO public.queue_events(appointment_id, entry_id, actor_id, action)
    VALUES (p_appointment_id, entry_id, auth.uid(), 'check_in');
  INSERT INTO public.notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key)
    VALUES (v_a.patient_id, p_appointment_id, 'checkin_token', 'Your queue token',
      'You have checked in. Your queue token is T' || lpad(v_token::text, 3, '0') || '.',
      jsonb_build_object('token', 'T' || lpad(v_token::text, 3, '0')),
      'checkin-token/' || p_appointment_id::text)
    ON CONFLICT DO NOTHING;
  token_number := v_token; checked_in_at := v_at;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.check_in_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_a public.appointments%ROWTYPE; v_s public.appointment_slots%ROWTYPE;
  v_timezone text; v_eligible timestamptz;
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
  IF EXISTS (SELECT 1 FROM public.queue_entries WHERE appointment_id = p_appointment_id)
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
  INSERT INTO public.queue_events(appointment_id, actor_id, action)
    VALUES (p_appointment_id, auth.uid(), 'no_show');
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
  UPDATE public.appointment_attendance SET status = 'eligible', updated_at = now()
    WHERE appointment_id = p_appointment_id AND status = 'no_show';
  IF NOT FOUND THEN RAISE EXCEPTION 'No-show state changed; refresh and retry'; END IF;
  INSERT INTO public.queue_events(appointment_id, actor_id, action, reason)
    VALUES (p_appointment_id, auth.uid(), 'reverse_no_show', btrim(p_reason));
END $$;
REVOKE ALL ON FUNCTION public.reverse_appointment_no_show(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_appointment_no_show(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_queue_entry(p_entry_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_e public.queue_entries%ROWTYPE; v_session public.queue_sessions%ROWTYPE;
  v_a public.appointments%ROWTYPE; v_role public.user_role; v_priority timestamptz;
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
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_a.status <> 'confirmed' THEN RAISE EXCEPTION 'Appointment changed; refresh and retry'; END IF;
  IF p_action IN ('start', 'complete') AND v_role <> 'admin'
      AND NOT (v_role = 'doctor' AND auth.uid() = v_session.doctor_id) THEN
    RAISE EXCEPTION 'Doctor or admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'call_next' THEN
    IF v_e.status <> 'waiting' OR EXISTS (
      SELECT 1 FROM public.queue_entries WHERE session_id = v_session.id AND status IN ('called', 'in_consultation')
    ) OR v_e.id <> (SELECT id FROM public.queue_entries WHERE session_id = v_session.id
      AND status = 'waiting' ORDER BY priority_at, checked_in_at, id LIMIT 1) THEN
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
      INTO v_priority FROM public.queue_entries WHERE session_id = v_session.id AND status = 'waiting';
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
DECLARE v_entry public.queue_entries%ROWTYPE; v_activated timestamptz; v_start timestamptz;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE appointment_id = NEW.id FOR UPDATE;
  IF NEW.slot_id IS DISTINCT FROM OLD.slot_id AND v_entry.id IS NOT NULL
      AND v_entry.status NOT IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Checked-in visit cannot be rescheduled; resolve the queue first';
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
CREATE TRIGGER appointments_queue_sync BEFORE UPDATE OF status, slot_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_queue();

CREATE OR REPLACE FUNCTION public.complete_doctor_appointment(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.appointments a SET status = 'completed', completed_at = now(), updated_at = now()
  FROM public.appointment_slots s
  WHERE a.id = p_appointment_id AND a.slot_id = s.id AND a.doctor_id = auth.uid()
    AND a.status = 'confirmed' AND s.slot_start_at <= now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment cannot be completed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.complete_doctor_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_doctor_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_clinic(p_name text, p_timezone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(p_name)) NOT BETWEEN 2 AND 160
    OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid clinic name or timezone';
  END IF;
  INSERT INTO public.clinics(name, timezone) VALUES (btrim(p_name), p_timezone) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.admin_assign_doctor_clinic(p_doctor_id uuid, p_clinic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic_id) THEN RAISE EXCEPTION 'Clinic not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.queue_entries e JOIN public.queue_sessions s ON s.id = e.session_id
    WHERE s.doctor_id = p_doctor_id AND e.status IN ('waiting', 'called', 'in_consultation', 'skipped')) THEN
    RAISE EXCEPTION 'Resolve the active queue before moving this doctor';
  END IF;
  UPDATE public.doctors SET clinic_id = p_clinic_id, updated_at = now() WHERE id = p_doctor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.admin_assign_staff_clinic(p_staff_id uuid, p_clinic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role = 'staff')
    OR NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic_id) THEN
    RAISE EXCEPTION 'Staff or clinic not found';
  END IF;
  INSERT INTO public.staff_clinic_memberships(staff_id, clinic_id)
    VALUES (p_staff_id, p_clinic_id)
    ON CONFLICT (staff_id) DO UPDATE SET clinic_id = excluded.clinic_id, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.admin_create_clinic(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_doctor_clinic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_staff_clinic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_clinic(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_doctor_clinic(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_staff_clinic(uuid, uuid) TO authenticated;

-- Keep the established channels for other notifications. A token is email-only.
CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.notification_deliveries(notification_id, recipient_id, appointment_id, channel, template, status, scheduled_at, dedupe_key)
  SELECT NEW.id, NEW.recipient_id, NEW.appointment_id, channel,
    NEW.type::text, 'pending'::public.notification_delivery_status, now(),
    COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text) || '/' || channel::text
  FROM (
    SELECT 'email'::public.notification_channel AS channel
    WHERE EXISTS (SELECT 1 FROM public.notification_preferences p
      WHERE p.recipient_id = NEW.recipient_id AND p.operational_email)
      AND NOT (NEW.type = 'appointment_booked' AND EXISTS (
        SELECT 1 FROM public.payments payment WHERE payment.appointment_id = NEW.appointment_id))
    UNION ALL
    SELECT 'sms'::public.notification_channel
    WHERE NEW.type NOT IN ('payment_confirmed', 'checkin_token')
      AND EXISTS (SELECT 1 FROM public.notification_preferences p
        WHERE p.recipient_id = NEW.recipient_id AND p.operational_sms)
    UNION ALL
    SELECT 'whatsapp'::public.notification_channel
    WHERE NEW.type NOT IN ('payment_confirmed', 'checkin_token')
      AND EXISTS (SELECT 1 FROM public.notification_preferences p
        WHERE p.recipient_id = NEW.recipient_id AND p.operational_whatsapp)
  ) channels
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
