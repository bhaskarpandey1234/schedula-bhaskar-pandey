-- Extend assistant confirmations to cover the existing doctor and patient
-- appointment workflows. The underlying RPCs remain the source of truth.
ALTER TABLE public.assistant_action_intents
  DROP CONSTRAINT IF EXISTS assistant_action_intents_action_type_check;

ALTER TABLE public.assistant_action_intents
  ADD CONSTRAINT assistant_action_intents_action_type_check
  CHECK (action_type IN (
    'booking',
    'reschedule',
    'cancellation',
    'doctor_cancellation',
    'doctor_completion',
    'doctor_prescription',
    'elastic_adjustment',
    'availability_creation',
    'doctor_leave',
    'doctor_slot_cancellation',
    'elastic_proposal_decision'
  ));

CREATE OR REPLACE FUNCTION public.assistant_patient_reschedule_slots(p_appointment_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, remaining_capacity integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_appointment appointments%ROWTYPE; v_fee integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Only authenticated patients can view reschedule slots';
  END IF;
  SELECT * INTO v_appointment FROM appointments
    WHERE id = p_appointment_id AND patient_id = auth.uid() AND status = 'confirmed'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment is not reschedulable'; END IF;
  SELECT consultation_fee_minor INTO v_fee FROM doctors WHERE id = v_appointment.doctor_id;
  RETURN QUERY
    SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone,
      GREATEST(0, s.capacity - s.allocated_count)::integer
    FROM appointment_slots s
    JOIN availability_sessions av ON av.id = s.availability_session_id
    JOIN doctors d ON d.id = s.doctor_id
    WHERE s.doctor_id = v_appointment.doctor_id
      AND s.id <> v_appointment.slot_id
      AND s.status = 'available'
      AND s.slot_start_at > now()
      AND s.allocated_count < s.capacity
      AND av.status = 'active'
      AND d.consultation_fee_minor = v_fee
      AND NOT EXISTS (
        SELECT 1 FROM appointments other
        JOIN appointment_slots other_slot ON other_slot.id = other.slot_id
        WHERE other.patient_id = auth.uid() AND other.status = 'confirmed'
          AND other.id <> v_appointment.id
          AND other_slot.slot_start_at < s.slot_end_at
          AND other_slot.slot_end_at > s.slot_start_at
      )
    ORDER BY s.slot_start_at
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_patient_reschedule_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_patient_reschedule_slots(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
