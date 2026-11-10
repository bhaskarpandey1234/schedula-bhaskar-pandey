CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, scheduling_type availability_scheduling_type, payment_status payment_status, payment_amount_minor integer, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view appointments'; END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY
    SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, av.scheduling_type, payment.status, payment.amount_minor, refund.status, refund.amount_minor
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN profiles doctor_profile ON doctor_profile.id = d.id AND doctor_profile.role = 'doctor'
    JOIN appointment_slots s ON s.id = a.slot_id
    JOIN availability_sessions av ON av.id = s.availability_session_id
    LEFT JOIN LATERAL (SELECT p.status, p.amount_minor FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1) payment ON true
    LEFT JOIN LATERAL (SELECT rr.status, sum(r.amount_minor)::integer AS amount_minor FROM refund_requests rr JOIN refunds r ON r.request_id = rr.id WHERE rr.appointment_id = a.id GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1) refund ON true
    WHERE a.patient_id = auth.uid()
      AND ((p_tab = 'upcoming' AND a.status = 'confirmed' AND s.slot_end_at >= now()) OR (p_tab = 'past' AND a.status = 'confirmed' AND s.slot_end_at < now()) OR (p_tab = 'cancelled' AND a.status = 'cancelled'))
    ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC, CASE WHEN p_tab IN ('past', 'cancelled') THEN s.slot_start_at END DESC, a.id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.doctor_appointments(p_tab text DEFAULT 'upcoming')
RETURNS TABLE(appointment_id uuid, patient_name text, status public.appointment_status, reason text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, patient_profile.full_name, a.status, a.reason, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at
  FROM public.appointments a
  JOIN public.appointment_slots s ON s.id = a.slot_id
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles patient_profile ON patient_profile.id = a.patient_id
  WHERE a.doctor_id = auth.uid()
    AND (p_tab = 'cancelled' AND a.status = 'cancelled' OR p_tab = 'past' AND s.slot_end_at < now() AND a.status <> 'cancelled' OR p_tab = 'upcoming' AND s.slot_end_at >= now() AND a.status = 'confirmed')
  ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC, CASE WHEN p_tab IN ('past', 'cancelled') THEN s.slot_start_at END DESC, a.id;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.patient_appointments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_appointments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_appointments(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
