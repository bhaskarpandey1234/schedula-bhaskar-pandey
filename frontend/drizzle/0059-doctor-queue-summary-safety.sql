DROP FUNCTION public.queue_appointment_board(uuid, uuid, date, uuid);
DROP FUNCTION IF EXISTS public.queue_viewer_allowed(uuid);

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
    SELECT e.id, row_number() OVER (PARTITION BY e.session_id ORDER BY e.priority_at, e.checked_in_at, e.id) AS queue_order
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
  appointment_summary AS (
    SELECT a.status::text AS appointment_status, att.status::text AS attendance_status,
      e.status::text AS queue_status, e.token_number, e.checked_in_at,
      positions.queue_order
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
    (array_agg(a.token_number ORDER BY a.queue_order) FILTER (
      WHERE a.appointment_status = 'confirmed' AND a.queue_status = 'waiting' AND a.checked_in_at IS NOT NULL
    ))[1]
  FROM selected_session selected
  LEFT JOIN appointment_summary a ON true
  GROUP BY selected.slot_start_at, selected.slot_end_at, selected.timezone;
END $$;
REVOKE ALL ON FUNCTION public.doctor_queue_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_queue_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
