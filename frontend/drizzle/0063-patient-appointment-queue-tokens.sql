DROP FUNCTION public.patient_appointments(text);

CREATE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(
  appointment_id uuid,
  status public.appointment_status,
  reason text,
  doctor_name text,
  specialty text,
  clinic_name text,
  timezone text,
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  scheduling_type public.availability_scheduling_type,
  payment_status public.payment_status,
  payment_amount_minor integer,
  refund_status public.refund_status,
  refund_amount_minor integer,
  token_number integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Only authenticated patients can view appointments';
  END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid appointment tab';
  END IF;
  RETURN QUERY
    SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name, d.timezone,
      s.slot_start_at, s.slot_end_at, av.scheduling_type, payment.status, payment.amount_minor,
      refund.status, refund.amount_minor,
      CASE WHEN a.status = 'confirmed' THEN e.token_number ELSE NULL END
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    JOIN public.profiles doctor_profile ON doctor_profile.id = d.id AND doctor_profile.role = 'doctor'
    JOIN public.appointment_slots s ON s.id = a.slot_id
    JOIN public.availability_sessions av ON av.id = s.availability_session_id
    LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
    LEFT JOIN LATERAL (
      SELECT p.status, p.amount_minor FROM public.payments p
      WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1
    ) payment ON true
    LEFT JOIN LATERAL (
      SELECT rr.status, sum(r.amount_minor)::integer AS amount_minor
      FROM public.refund_requests rr
      JOIN public.refunds r ON r.request_id = rr.id
      WHERE rr.appointment_id = a.id
      GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1
    ) refund ON true
    WHERE a.patient_id = auth.uid()
      AND (
        (p_tab = 'upcoming' AND a.status = 'confirmed' AND s.slot_end_at >= now())
        OR (p_tab = 'past' AND a.status = 'confirmed' AND s.slot_end_at < now())
        OR (p_tab = 'cancelled' AND a.status = 'cancelled')
      )
    ORDER BY
      CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC,
      CASE WHEN p_tab IN ('past', 'cancelled') THEN s.slot_start_at END DESC,
      a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_appointments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
