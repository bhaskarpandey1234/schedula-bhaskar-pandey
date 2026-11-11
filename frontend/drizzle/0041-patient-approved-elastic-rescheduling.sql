-- Patient-approved Elastic Scheduling. Existing immediate RPC is retained under a
-- legacy name so hosted environments can migrate without rewriting history.
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'reschedule_pending';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'elastic_reschedule_proposed';

ALTER FUNCTION public.apply_doctor_occurrence_adjustment(uuid, date, time, time, jsonb)
  RENAME TO apply_doctor_occurrence_adjustment_immediate_legacy;

CREATE TABLE IF NOT EXISTS public.elastic_booking_proposals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES public.availability_adjustments(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  source_slot_id uuid NOT NULL REFERENCES public.appointment_slots(id) ON DELETE CASCADE,
  recommended_slot_id uuid REFERENCES public.appointment_slots(id) ON DELETE SET NULL,
  selected_slot_id uuid REFERENCES public.appointment_slots(id) ON DELETE SET NULL,
  scheduling_type public.availability_scheduling_type NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_patient' CHECK (status IN ('awaiting_patient','approved','alternative_selected','rejected','expired')),
  old_start_at timestamptz NOT NULL,
  old_end_at timestamptz NOT NULL,
  recommended_start_at timestamptz,
  recommended_end_at timestamptz,
  source_allocation_held boolean NOT NULL DEFAULT false,
  decision_deadline timestamptz NOT NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(adjustment_id, appointment_id)
);
CREATE INDEX IF NOT EXISTS elastic_booking_proposals_patient_idx ON public.elastic_booking_proposals(patient_id, status, decision_deadline);
CREATE INDEX IF NOT EXISTS elastic_booking_proposals_doctor_idx ON public.elastic_booking_proposals(doctor_id, status, created_at);
ALTER TABLE public.elastic_booking_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS elastic_proposals_patient_select ON public.elastic_booking_proposals;
CREATE POLICY elastic_proposals_patient_select ON public.elastic_booking_proposals FOR SELECT TO authenticated USING (patient_id = auth.uid());
DROP POLICY IF EXISTS elastic_proposals_doctor_select ON public.elastic_booking_proposals;
CREATE POLICY elastic_proposals_doctor_select ON public.elastic_booking_proposals FOR SELECT TO authenticated USING (doctor_id = auth.uid());

-- The apply operation changes availability immediately, but creates pending
-- decisions instead of silently moving or refunding booked patients.
CREATE OR REPLACE FUNCTION public.apply_doctor_occurrence_adjustment(
  p_session_id uuid, p_occurrence_date date, p_start_time time, p_end_time time, p_assignments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doctor uuid := auth.uid(); v_session record; v_preview jsonb; v_adjustment uuid;
  v_old_start_time time; v_old_end_time time; v_old_start_at timestamptz; v_old_end_at timestamptz; v_new_start_at timestamptz; v_new_end_at timestamptz;
  v_timezone text; v_kind text; v_stream_min integer; v_stream_capacity integer; v_stream_slot uuid;
  v_appointment jsonb; v_candidate jsonb; v_recommended uuid; v_deadline timestamptz;
  v_remaining integer; v_index integer := 0; v_overflow_index integer := 0; v_candidates jsonb; v_appointments jsonb; v_source_held boolean;
BEGIN
  SELECT a.*, d.timezone AS doctor_timezone INTO v_session FROM availability_sessions a JOIN doctors d ON d.id = a.doctor_id
    WHERE a.id = p_session_id AND a.doctor_id = v_doctor AND a.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Availability session was not found'; END IF;
  v_timezone := v_session.doctor_timezone;
  SELECT COALESCE(o.start_time, v_session.start_time), COALESCE(o.end_time, v_session.end_time)
    INTO v_old_start_time, v_old_end_time FROM availability_occurrence_overrides o
    WHERE o.availability_session_id = p_session_id AND o.occurrence_date = p_occurrence_date;
  IF v_old_start_time IS NULL THEN v_old_start_time := v_session.start_time; v_old_end_time := v_session.end_time; END IF;
  v_old_start_at := (p_occurrence_date + v_old_start_time) AT TIME ZONE v_timezone;
  v_old_end_at := (p_occurrence_date + v_old_end_time) AT TIME ZONE v_timezone;
  v_new_start_at := (p_occurrence_date + p_start_time) AT TIME ZONE v_timezone;
  v_new_end_at := (p_occurrence_date + p_end_time) AT TIME ZONE v_timezone;
  IF v_new_start_at <= now() OR p_end_time <= p_start_time THEN RAISE EXCEPTION 'Availability must be in the future'; END IF;
  v_kind := CASE WHEN p_start_time <= v_old_start_time AND p_end_time >= v_old_end_time THEN 'expansion' ELSE 'shrink' END;
  v_preview := public.preview_doctor_occurrence_adjustment(p_session_id, p_occurrence_date, p_start_time, p_end_time);
  v_candidates := COALESCE(v_preview->'candidates', '[]'::jsonb);
  v_appointments := COALESCE(v_preview->'appointments', '[]'::jsonb);
  v_stream_min := COALESCE(v_session.stream_min_patient_minutes, 10);
  v_stream_capacity := CASE WHEN v_session.scheduling_type = 'stream' AND v_kind = 'shrink'
    THEN LEAST(v_session.capacity, floor(extract(epoch FROM (v_new_end_at - v_new_start_at)) / 60 / v_stream_min)::integer)
    ELSE v_session.capacity END;
  IF v_session.scheduling_type = 'stream' AND v_stream_capacity < 1 THEN RAISE EXCEPTION 'The new Stream window is shorter than its minimum consultation time'; END IF;

  INSERT INTO availability_adjustments(doctor_id, availability_session_id, occurrence_date, scheduling_type, old_start_at, old_end_at, new_start_at, new_end_at, summary)
    VALUES (v_doctor, p_session_id, p_occurrence_date, v_session.scheduling_type, v_old_start_at, v_old_end_at, v_new_start_at, v_new_end_at,
      jsonb_build_object('classification', v_kind, 'patient_approval_required', true)) RETURNING id INTO v_adjustment;
  IF v_session.kind IN ('weekly','monthly') THEN
    INSERT INTO availability_occurrence_overrides(availability_session_id, doctor_id, occurrence_date, start_time, end_time, capacity)
      VALUES (p_session_id, v_doctor, p_occurrence_date, p_start_time, p_end_time, CASE WHEN v_session.scheduling_type = 'stream' THEN v_stream_capacity ELSE NULL END)
      ON CONFLICT (availability_session_id, occurrence_date) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, capacity = EXCLUDED.capacity, updated_at = now();
  ELSE
    UPDATE availability_sessions SET start_time = p_start_time, end_time = p_end_time, session_start_at = v_new_start_at, session_end_at = v_new_end_at,
      capacity = CASE WHEN v_session.scheduling_type = 'stream' THEN v_stream_capacity ELSE capacity END, updated_at = now() WHERE id = p_session_id;
  END IF;

  IF v_session.scheduling_type = 'stream' THEN
    SELECT s.id INTO v_stream_slot FROM appointment_slots s WHERE s.availability_session_id = p_session_id
      AND (s.slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date ORDER BY s.slot_start_at LIMIT 1 FOR UPDATE;
    IF v_stream_slot IS NULL THEN RAISE EXCEPTION 'The occurrence has no materialized slot'; END IF;
    UPDATE appointment_slots SET slot_start_at = v_new_start_at, slot_end_at = v_new_end_at,
      capacity = v_stream_capacity, allocated_count = CASE WHEN v_kind = 'shrink' THEN LEAST(allocated_count, v_stream_capacity) ELSE allocated_count END, updated_at = now()
      WHERE id = v_stream_slot;
    v_source_held := v_kind = 'expansion';
  ELSE
    v_source_held := false;
    UPDATE appointment_slots SET status = 'cancelled', updated_at = now() WHERE availability_session_id = p_session_id
      AND (slot_start_at AT TIME ZONE v_timezone)::date = p_occurrence_date AND (slot_start_at < v_new_start_at OR slot_end_at > v_new_end_at) AND allocated_count = 0;
  END IF;
  v_deadline := v_old_start_at - interval '2 hours';

  FOR v_appointment IN SELECT * FROM jsonb_array_elements(v_appointments) LOOP
    v_index := v_index + 1; v_recommended := NULL; v_candidate := NULL;
    IF v_session.scheduling_type = 'stream' AND (v_kind = 'expansion' OR v_index <= COALESCE((v_preview->'stream_capacity'->>'retained_count')::integer, 0)) THEN
      v_recommended := v_stream_slot;
    ELSE
      v_overflow_index := v_overflow_index + 1;
      SELECT candidate INTO v_candidate FROM (
        SELECT candidate, sum((candidate->>'remaining_capacity')::integer) OVER (ORDER BY (candidate->>'start_at')::timestamptz, candidate->>'slot_id') AS cumulative_capacity
        FROM jsonb_array_elements(v_candidates) candidate
        WHERE (candidate->>'remaining_capacity')::integer > 0
          AND (candidate->>'start_at')::timestamptz >= (v_appointment->>'start_at')::timestamptz
      ) ranked WHERE cumulative_capacity >= v_overflow_index ORDER BY cumulative_capacity LIMIT 1;
      IF v_candidate IS NOT NULL THEN v_recommended := (v_candidate->>'slot_id')::uuid; END IF;
    END IF;
    INSERT INTO elastic_booking_proposals(adjustment_id, appointment_id, patient_id, doctor_id, source_slot_id, recommended_slot_id, scheduling_type, old_start_at, old_end_at, recommended_start_at, recommended_end_at, source_allocation_held, decision_deadline)
      SELECT v_adjustment, (v_appointment->>'appointment_id')::uuid, (v_appointment->>'patient_id')::uuid, v_doctor, (v_appointment->>'source_slot_id')::uuid, v_recommended, v_session.scheduling_type,
        (v_appointment->>'start_at')::timestamptz, (v_appointment->>'end_at')::timestamptz,
        CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_start_at FROM appointment_slots WHERE id = v_recommended) END,
        CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_end_at FROM appointment_slots WHERE id = v_recommended) END,
        v_source_held, v_deadline ON CONFLICT DO NOTHING;
    UPDATE appointments SET status = 'reschedule_pending' WHERE id = (v_appointment->>'appointment_id')::uuid AND status = 'confirmed';
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, metadata, dedupe_key)
      VALUES ((v_appointment->>'patient_id')::uuid, (v_appointment->>'appointment_id')::uuid, 'elastic_reschedule_proposed', 'Appointment change needs your approval',
        CASE WHEN v_recommended IS NULL THEN 'Your doctor changed availability. Choose another available time or cancel for a full refund.' ELSE 'Your doctor changed availability. Review the recommended new time or choose another available time.' END,
        jsonb_build_object('proposal_status','awaiting_patient','recommended_start_at', CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_start_at FROM appointment_slots WHERE id = v_recommended) END, 'recommended_end_at', CASE WHEN v_recommended IS NULL THEN NULL ELSE (SELECT slot_end_at FROM appointment_slots WHERE id = v_recommended) END, 'decision_deadline', v_deadline),
        'elastic-proposal/' || v_adjustment || '/' || (v_appointment->>'appointment_id')) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('adjustment_id', v_adjustment, 'classification', v_kind, 'moved', 0, 'cancelled', 0, 'pending', jsonb_array_length(v_appointments));
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_elastic_proposal(p_appointment_id uuid)
RETURNS TABLE(proposal_id uuid, appointment_id uuid, status text, scheduling_type public.availability_scheduling_type, old_start_at timestamptz, old_end_at timestamptz, recommended_slot_id uuid, recommended_start_at timestamptz, recommended_end_at timestamptz, decision_deadline timestamptz, timezone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, p.appointment_id, p.status, p.scheduling_type, p.old_start_at, p.old_end_at, p.recommended_slot_id, p.recommended_start_at, p.recommended_end_at, p.decision_deadline, d.timezone
  FROM elastic_booking_proposals p JOIN doctors d ON d.id = p.doctor_id
  WHERE p.appointment_id = p_appointment_id AND p.patient_id = auth.uid() AND p.status = 'awaiting_patient';
$$;

CREATE OR REPLACE FUNCTION public.patient_elastic_candidate_slots(p_proposal_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, remaining_capacity integer, timezone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.slot_start_at, s.slot_end_at, s.capacity - s.allocated_count, d.timezone
  FROM elastic_booking_proposals p JOIN doctors d ON d.id = p.doctor_id JOIN appointment_slots s ON s.doctor_id = p.doctor_id
    JOIN availability_sessions a ON a.id = s.availability_session_id
  WHERE p.id = p_proposal_id AND p.patient_id = auth.uid() AND p.status = 'awaiting_patient' AND s.status = 'available'
    AND a.status = 'active' AND a.scheduling_type = p.scheduling_type AND s.slot_start_at > now() AND s.allocated_count < s.capacity
    AND (p.scheduling_type = 'stream' AND s.slot_start_at >= p.old_end_at OR p.scheduling_type = 'wave' AND extract(epoch FROM (s.slot_end_at - s.slot_start_at)) = extract(epoch FROM (p.old_end_at - p.old_start_at)))
  ORDER BY s.slot_start_at;
$$;

CREATE OR REPLACE FUNCTION public.approve_elastic_booking_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record; target record;
BEGIN
  SELECT * INTO p FROM elastic_booking_proposals WHERE id = p_proposal_id AND patient_id = auth.uid() AND status = 'awaiting_patient' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This rescheduling request is no longer available'; END IF;
  IF now() >= p.decision_deadline THEN RAISE EXCEPTION 'The response deadline has passed'; END IF;
  IF p.recommended_slot_id IS NULL THEN RAISE EXCEPTION 'Choose an available replacement time'; END IF;
  SELECT s.*, a.scheduling_type INTO target FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.id = p.recommended_slot_id FOR UPDATE;
  IF target.status <> 'available' OR target.allocated_count >= target.capacity THEN RAISE EXCEPTION 'The recommended time is no longer available'; END IF;
  IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, 'reschedule', 'converted', now() + interval '100 years');
  UPDATE appointments SET slot_id = target.id, status = 'confirmed', updated_at = now() WHERE id = p.appointment_id;
  UPDATE elastic_booking_proposals SET status = 'approved', selected_slot_id = target.id, decided_at = now(), updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','approved','slot_id',target.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.choose_elastic_booking_slot(p_proposal_id uuid, p_slot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record; target record;
BEGIN
  SELECT * INTO p FROM elastic_booking_proposals WHERE id = p_proposal_id AND patient_id = auth.uid() AND status = 'awaiting_patient' FOR UPDATE;
  IF NOT FOUND OR now() >= p.decision_deadline THEN RAISE EXCEPTION 'This rescheduling request is no longer available'; END IF;
  SELECT s.*, a.scheduling_type INTO target FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.id = p_slot_id AND s.doctor_id = p.doctor_id FOR UPDATE;
  IF NOT FOUND OR target.status <> 'available' OR target.allocated_count >= target.capacity OR target.scheduling_type <> p.scheduling_type THEN RAISE EXCEPTION 'Choose an available replacement time'; END IF;
  IF p.scheduling_type = 'wave' AND extract(epoch FROM (target.slot_end_at - target.slot_start_at)) <> extract(epoch FROM (p.old_end_at - p.old_start_at)) THEN RAISE EXCEPTION 'Choose a slot with the same duration'; END IF;
  IF EXISTS (SELECT 1 FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id WHERE a.patient_id = p.patient_id AND a.status IN ('confirmed','reschedule_pending') AND a.id <> p.appointment_id AND s.slot_start_at < target.slot_end_at AND s.slot_end_at > target.slot_start_at) THEN RAISE EXCEPTION 'You already have an appointment at that time'; END IF;
  IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = target.id;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, purpose, status, expires_at) VALUES (p.appointment_id, p.patient_id, p.doctor_id, target.id, 'reschedule', 'converted', now() + interval '100 years');
  UPDATE appointments SET slot_id = target.id, status = 'confirmed', updated_at = now() WHERE id = p.appointment_id;
  UPDATE elastic_booking_proposals SET status = 'alternative_selected', selected_slot_id = target.id, decided_at = now(), updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','alternative_selected','slot_id',target.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_elastic_booking_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record; paid integer; request_id uuid;
BEGIN
  SELECT * INTO p FROM elastic_booking_proposals WHERE id = p_proposal_id AND patient_id = auth.uid() AND status = 'awaiting_patient' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This rescheduling request is no longer available'; END IF;
  UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = p.appointment_id;
  IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
  paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = p.appointment_id AND status = 'captured'), 0);
  IF paid > 0 THEN
    INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status) SELECT p.appointment_id, 'doctor_elastic_availability', paid, pay.currency, 'requested' FROM payments pay WHERE pay.appointment_id = p.appointment_id AND pay.status = 'captured' ORDER BY pay.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING RETURNING id INTO request_id;
    IF request_id IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) SELECT request_id, pay.id, paid, 'refund/' || request_id FROM payments pay WHERE pay.appointment_id = p.appointment_id AND pay.status = 'captured' ORDER BY pay.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING; END IF;
  END IF;
  UPDATE elastic_booking_proposals SET status = 'rejected', decided_at = now(), updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','rejected','refund_requested',paid > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_elastic_booking_proposals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record; count_expired integer := 0; paid integer; request_id uuid;
BEGIN
  FOR p IN SELECT * FROM elastic_booking_proposals WHERE status = 'awaiting_patient' AND decision_deadline <= now() FOR UPDATE LOOP
    UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = p.appointment_id AND status = 'reschedule_pending';
    IF NOT p.source_allocation_held THEN UPDATE appointment_slots SET allocated_count = GREATEST(0, allocated_count - 1) WHERE id = p.source_slot_id; END IF;
    paid := COALESCE((SELECT sum(amount_minor) FROM payments WHERE appointment_id = p.appointment_id AND status = 'captured'), 0);
    IF paid > 0 THEN
      INSERT INTO refund_requests(appointment_id, reason, amount_minor, currency, status) SELECT p.appointment_id, 'doctor_elastic_availability', paid, pay.currency, 'requested' FROM payments pay WHERE pay.appointment_id = p.appointment_id AND pay.status = 'captured' ORDER BY pay.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING RETURNING id INTO request_id;
      IF request_id IS NOT NULL THEN INSERT INTO refunds(request_id, payment_id, amount_minor, idempotency_key) SELECT request_id, pay.id, paid, 'refund/' || request_id FROM payments pay WHERE pay.appointment_id = p.appointment_id AND pay.status = 'captured' ORDER BY pay.created_at DESC LIMIT 1 ON CONFLICT DO NOTHING; END IF;
    END IF;
    UPDATE elastic_booking_proposals SET status = 'expired', decided_at = now(), updated_at = now() WHERE id = p.id;
    count_expired := count_expired + 1;
  END LOOP;
  RETURN count_expired;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_elastic_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_elastic_candidate_slots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_elastic_booking_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.choose_elastic_booking_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_elastic_booking_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_elastic_booking_proposals() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_doctor_occurrence_adjustment(uuid, date, time, time, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type, payment_status payment_status, payment_amount_minor integer, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view appointments'; END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY SELECT a.id, a.status, a.reason, dp.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, av.scheduling_type, payment.status, payment.amount_minor, refund.status, refund.amount_minor
  FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN profiles dp ON dp.id = d.id JOIN appointment_slots s ON s.id = a.slot_id JOIN availability_sessions av ON av.id = s.availability_session_id
  LEFT JOIN LATERAL (SELECT p.status, p.amount_minor FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1) payment ON true
  LEFT JOIN LATERAL (SELECT rr.status, sum(r.amount_minor)::integer AS amount_minor FROM refund_requests rr JOIN refunds r ON r.request_id = rr.id WHERE rr.appointment_id = a.id GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1) refund ON true
  WHERE a.patient_id = auth.uid() AND ((p_tab = 'upcoming' AND a.status IN ('confirmed','reschedule_pending') AND s.slot_end_at >= now()) OR (p_tab = 'past' AND a.status IN ('confirmed','reschedule_pending') AND s.slot_end_at < now()) OR (p_tab = 'cancelled' AND a.status = 'cancelled'))
  ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC, CASE WHEN p_tab IN ('past','cancelled') THEN s.slot_start_at END DESC, a.id;
END; $$;

CREATE OR REPLACE FUNCTION public.doctor_appointments(p_tab text DEFAULT 'upcoming')
RETURNS TABLE(appointment_id uuid, patient_name text, status public.appointment_status, reason text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, pp.full_name, a.status, a.reason, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at FROM appointments a JOIN appointment_slots s ON s.id = a.slot_id JOIN doctors d ON d.id = a.doctor_id JOIN profiles pp ON pp.id = a.patient_id
  WHERE a.doctor_id = auth.uid() AND (p_tab = 'cancelled' AND a.status = 'cancelled' OR p_tab = 'past' AND s.slot_end_at < now() AND a.status <> 'cancelled' OR p_tab = 'upcoming' AND s.slot_end_at >= now() AND a.status IN ('confirmed','reschedule_pending'))
  ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC, CASE WHEN p_tab IN ('past','cancelled') THEN s.slot_start_at END DESC, a.id;
$$;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_appointments(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
