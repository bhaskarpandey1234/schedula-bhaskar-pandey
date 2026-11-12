-- Harden the assistant pilot without rewriting the original pilot migration.
ALTER TYPE public.assistant_action_status ADD VALUE IF NOT EXISTS 'awaiting_payment';

CREATE INDEX IF NOT EXISTS assistant_audit_events_user_created_idx
  ON public.assistant_audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_action_intents_user_status_idx
  ON public.assistant_action_intents (user_id, status, expires_at);

CREATE OR REPLACE FUNCTION public.prevent_assistant_intent_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.role IS DISTINCT FROM NEW.role
    OR OLD.action_type IS DISTINCT FROM NEW.action_type
    OR OLD.payload IS DISTINCT FROM NEW.payload
    OR OLD.preview IS DISTINCT FROM NEW.preview
    OR OLD.fingerprint IS DISTINCT FROM NEW.fingerprint
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'Assistant action intent is immutable';
  END IF;
  IF NEW.status NOT IN ('pending', 'executing', 'awaiting_payment', 'succeeded', 'declined', 'expired', 'failed') THEN
    RAISE EXCEPTION 'Invalid assistant action status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assistant_action_intents_immutable ON public.assistant_action_intents;
CREATE TRIGGER assistant_action_intents_immutable
  BEFORE UPDATE ON public.assistant_action_intents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_assistant_intent_tampering();

-- Clients can create intents and read their own intents, but cannot rewrite the
-- authoritative payload, preview, expiry, or ownership fields.
DROP POLICY IF EXISTS assistant_action_intents_self_update ON public.assistant_action_intents;
CREATE POLICY assistant_action_intents_self_update ON public.assistant_action_intents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

-- Completed visits remain visible in patient history.
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
  WHERE a.patient_id = auth.uid() AND ((p_tab = 'upcoming' AND a.status IN ('confirmed','reschedule_pending') AND s.slot_end_at >= now()) OR (p_tab = 'past' AND (a.status = 'completed' OR (a.status IN ('confirmed','reschedule_pending') AND s.slot_end_at < now()))) OR (p_tab = 'cancelled' AND a.status = 'cancelled'))
  ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC, CASE WHEN p_tab IN ('past','cancelled') THEN s.slot_start_at END DESC, a.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
