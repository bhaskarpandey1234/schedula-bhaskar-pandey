-- Patient acknowledgements expose safe refund references and timestamps, never payment instruments.
DROP FUNCTION IF EXISTS public.patient_payment_detail(uuid);
DROP FUNCTION IF EXISTS public.patient_payment_history();

CREATE OR REPLACE FUNCTION public.patient_payment_history()
RETURNS TABLE(payment_id uuid, appointment_id uuid, payment_purpose payment_purpose, payment_status payment_status, amount_minor integer, currency text, provider text, provider_order_id text, provider_payment_id text, failure_reason text, captured_at timestamptz, created_at timestamptz, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, refund_status refund_status, refund_amount_minor integer, provider_refund_id text, refund_processed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view payment history'; END IF;
  RETURN QUERY
  SELECT p.id, a.id, p.purpose, p.status, p.amount_minor, p.currency, p.provider, p.provider_order_id, p.provider_payment_id, p.failure_reason, p.captured_at, p.created_at, dp.full_name, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at,
    refund.status, COALESCE(refund.amount_minor, 0), refund.provider_refund_id, refund.processed_at
  FROM payments p
  JOIN appointments a ON a.id = p.appointment_id
  JOIN doctors d ON d.id = a.doctor_id
  JOIN profiles dp ON dp.id = d.id
  JOIN appointment_slots s ON s.id = a.slot_id
  LEFT JOIN LATERAL (
    SELECT r.status, r.amount_minor, r.provider_refund_id, r.processed_at
    FROM refunds r WHERE r.payment_id = p.id ORDER BY r.created_at DESC LIMIT 1
  ) refund ON true
  WHERE a.patient_id = auth.uid()
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_payment_detail(p_payment_id uuid)
RETURNS TABLE(payment_id uuid, appointment_id uuid, payment_purpose payment_purpose, payment_status payment_status, amount_minor integer, currency text, provider text, provider_order_id text, provider_payment_id text, failure_reason text, captured_at timestamptz, created_at timestamptz, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, refund_status refund_status, refund_amount_minor integer, provider_refund_id text, refund_processed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.patient_payment_history() h WHERE h.payment_id = p_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_payment_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_payment_detail(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
