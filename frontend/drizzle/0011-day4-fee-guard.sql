-- Legacy doctors may have a NULL fee from before paid bookings were introduced.
-- Do not expose those slots to a patient checkout flow.
DROP FUNCTION IF EXISTS public.patient_bookable_slot(uuid);
CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone,
    s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count,
    d.consultation_fee_minor, d.consultation_currency
  FROM appointment_slots s
  JOIN availability_sessions a ON a.id = s.availability_session_id
  JOIN doctors d ON d.id = s.doctor_id
  JOIN profiles p ON p.id = d.id AND p.role = 'doctor'
  WHERE s.id = p_slot_id
    AND s.status = 'available'
    AND a.status = 'active'
    AND s.slot_start_at >= now()
    AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity
    AND d.consultation_fee_minor IS NOT NULL
    AND d.consultation_currency = 'INR';
END;
$$;

REVOKE ALL ON FUNCTION public.patient_bookable_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_bookable_slot(uuid) TO authenticated;
