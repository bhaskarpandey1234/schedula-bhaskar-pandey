-- Secure appointment detail lookup for doctor notification navigation.
CREATE OR REPLACE FUNCTION public.doctor_appointment_detail(p_appointment_id uuid)
RETURNS TABLE(
  appointment_id uuid,
  status public.appointment_status,
  reason text,
  patient_name text,
  clinic_name text,
  timezone text,
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  is_cancellable boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'Only authenticated doctors can view appointment details' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.status, a.reason, patient_profile.full_name,
         d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at,
         a.status = 'confirmed' AND s.slot_end_at > now()
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles patient_profile ON patient_profile.id = a.patient_id AND patient_profile.role = 'patient'
  JOIN public.appointment_slots s ON s.id = a.slot_id
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_appointment_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_appointment_detail(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
