-- Fee-aware discovery, exact checkout quotes, and patient payment history.
DROP FUNCTION IF EXISTS public.patient_appointments(text);
CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, payment_status payment_status, payment_amount_minor integer, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view appointments'; END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, payment.status, payment.amount_minor, refund.status, refund.amount_minor
  FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN profiles doctor_profile ON doctor_profile.id = d.id AND doctor_profile.role = 'doctor' JOIN appointment_slots s ON s.id = a.slot_id
  LEFT JOIN LATERAL (SELECT p.status, p.amount_minor FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1) payment ON true
  LEFT JOIN LATERAL (SELECT rr.status, sum(r.amount_minor)::integer AS amount_minor FROM refund_requests rr JOIN refunds r ON r.request_id = rr.id WHERE rr.appointment_id = a.id GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1) refund ON true
  WHERE a.patient_id = auth.uid() AND ((p_tab = 'upcoming' AND a.status = 'confirmed' AND s.slot_end_at >= now()) OR (p_tab = 'past' AND a.status = 'confirmed' AND s.slot_end_at < now()) OR (p_tab = 'cancelled' AND a.status = 'cancelled'))
  ORDER BY s.slot_start_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.public_doctor_directory(text, text);
CREATE OR REPLACE FUNCTION public.public_doctor_directory(p_search text DEFAULT NULL, p_specialty text DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, available_dates date[], consultation_fee_minor integer, consultation_currency text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, COALESCE(availability.available_dates, ARRAY[]::date[]), d.consultation_fee_minor, d.consultation_currency
  FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LEFT JOIN LATERAL (SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = d.id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR') availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%') AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY cardinality(COALESCE(availability.available_dates, ARRAY[]::date[])) DESC, p.full_name;
$$;

DROP FUNCTION IF EXISTS public.patient_doctor_directory(text, text);
CREATE OR REPLACE FUNCTION public.patient_doctor_directory(p_search text DEFAULT NULL, p_specialty text DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, available_dates date[], consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, COALESCE(availability.available_dates, ARRAY[]::date[]), d.consultation_fee_minor, d.consultation_currency
  FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor'
  LEFT JOIN LATERAL (SELECT array_agg(DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date) AS available_dates FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id WHERE s.doctor_id = d.id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR') availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%') AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY p.full_name;
END;
$$;

DROP FUNCTION IF EXISTS public.public_doctor_detail(uuid);
CREATE OR REPLACE FUNCTION public.public_doctor_detail(p_doctor_id uuid)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, biography text, timezone text, consultation_fee_minor integer, consultation_currency text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, d.biography, d.timezone, d.consultation_fee_minor, d.consultation_currency
  FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  WHERE d.id = p_doctor_id;
$$;

DROP FUNCTION IF EXISTS public.public_doctor_slots(uuid);
CREATE OR REPLACE FUNCTION public.public_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency
  FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor' AND NULLIF(trim(p.full_name), '') IS NOT NULL
  WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR'
  ORDER BY s.slot_start_at;
$$;

DROP FUNCTION IF EXISTS public.patient_doctor_detail(uuid);
CREATE OR REPLACE FUNCTION public.patient_doctor_detail(p_doctor_id uuid)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, biography text, timezone text, consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years, d.biography, d.timezone, d.consultation_fee_minor, d.consultation_currency FROM doctors d JOIN profiles p ON p.id = d.id AND p.role = 'doctor' WHERE d.id = p_doctor_id;
END;
$$;

DROP FUNCTION IF EXISTS public.patient_doctor_slots(uuid);
CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency
  FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id
  WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR'
  ORDER BY s.slot_start_at;
END;
$$;

DROP FUNCTION IF EXISTS public.patient_bookable_slot(uuid);
CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer, consultation_fee_minor integer, consultation_currency text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count, d.consultation_fee_minor, d.consultation_currency
  FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id JOIN profiles p ON p.id = d.id AND p.role = 'doctor'
  WHERE s.id = p_slot_id AND s.status = 'available' AND a.status = 'active' AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days' AND s.allocated_count < s.capacity AND d.consultation_fee_minor IS NOT NULL AND d.consultation_currency = 'INR';
END;
$$;

DROP FUNCTION IF EXISTS public.reserve_paid_appointment(uuid, text, text);
CREATE OR REPLACE FUNCTION public.reserve_paid_appointment(p_slot_id uuid, p_reason text DEFAULT NULL, p_idempotency_key text DEFAULT NULL, p_expected_amount_minor integer DEFAULT NULL)
RETURNS TABLE(appointment_id uuid, payment_id uuid, reservation_id uuid, amount_minor integer, currency text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_patient uuid := auth.uid(); v_slot record; v_appointment uuid; v_reservation uuid; v_payment uuid; v_expires timestamptz := now() + interval '15 minutes';
BEGIN
  IF v_patient IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_patient AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can book appointments'; END IF;
  SELECT s.id, s.doctor_id, s.capacity, s.allocated_count, s.status slot_status, s.slot_start_at, a.status session_status, d.consultation_fee_minor, d.consultation_currency INTO v_slot FROM appointment_slots s JOIN availability_sessions a ON a.id = s.availability_session_id JOIN doctors d ON d.id = s.doctor_id WHERE s.id = p_slot_id FOR UPDATE OF s, a;
  IF NOT FOUND OR v_slot.slot_status <> 'available' OR v_slot.session_status <> 'active' OR v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'This slot is no longer available'; END IF;
  IF v_slot.consultation_fee_minor IS NULL OR v_slot.consultation_currency <> 'INR' THEN RAISE EXCEPTION 'This doctor has not configured a consultation fee'; END IF;
  IF p_expected_amount_minor IS NOT NULL AND p_expected_amount_minor <> v_slot.consultation_fee_minor THEN RAISE EXCEPTION 'The consultation fee changed. Please review the updated fee before paying.'; END IF;
  SELECT a.id, p.id, r.id INTO v_appointment, v_payment, v_reservation FROM appointments a JOIN slot_reservations r ON r.appointment_id = a.id AND r.status = 'active' JOIN payments p ON p.appointment_id = a.id WHERE a.patient_id = v_patient AND a.slot_id = p_slot_id AND a.status = 'payment_pending' AND r.expires_at > now() ORDER BY a.created_at DESC LIMIT 1;
  IF v_appointment IS NOT NULL THEN RETURN QUERY SELECT v_appointment, v_payment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, (SELECT expires_at FROM slot_reservations WHERE id = v_reservation); RETURN; END IF;
  IF EXISTS (SELECT 1 FROM appointments WHERE patient_id = v_patient AND slot_id = p_slot_id AND status = 'confirmed') THEN RAISE EXCEPTION 'You have already booked this slot'; END IF;
  IF v_slot.allocated_count >= v_slot.capacity THEN RAISE EXCEPTION 'This slot is full'; END IF;
  INSERT INTO appointments(patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot) VALUES (v_patient, v_slot.doctor_id, p_slot_id, 'payment_pending', NULLIF(trim(p_reason), ''), '{"full_hours":24,"partial_hours":2,"partial_percent":50}') RETURNING id INTO v_appointment;
  INSERT INTO slot_reservations(appointment_id, patient_id, doctor_id, slot_id, expires_at) VALUES (v_appointment, v_patient, v_slot.doctor_id, p_slot_id, v_expires) RETURNING id INTO v_reservation;
  UPDATE appointment_slots SET allocated_count = allocated_count + 1 WHERE id = p_slot_id;
  INSERT INTO payments(appointment_id, reservation_id, amount_minor, currency, idempotency_key) VALUES (v_appointment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, COALESCE(NULLIF(p_idempotency_key, ''), v_appointment::text)) RETURNING id INTO v_payment;
  RETURN QUERY SELECT v_appointment, v_payment, v_reservation, v_slot.consultation_fee_minor, v_slot.consultation_currency, v_expires;
END;
$$;

DROP FUNCTION IF EXISTS public.patient_payment_history();
CREATE OR REPLACE FUNCTION public.patient_payment_history()
RETURNS TABLE(payment_id uuid, appointment_id uuid, payment_purpose payment_purpose, payment_status payment_status, amount_minor integer, currency text, provider text, provider_order_id text, provider_payment_id text, failure_reason text, captured_at timestamptz, created_at timestamptz, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient') THEN RAISE EXCEPTION 'Only authenticated patients can view payment history'; END IF;
  RETURN QUERY SELECT p.id, a.id, p.purpose, p.status, p.amount_minor, p.currency, p.provider, p.provider_order_id, p.provider_payment_id, p.failure_reason, p.captured_at, p.created_at, dp.full_name, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, (array_agg(rr.status ORDER BY rr.created_at DESC))[1], coalesce(sum(r.amount_minor), 0)::integer
  FROM payments p JOIN appointments a ON a.id = p.appointment_id JOIN doctors d ON d.id = a.doctor_id JOIN profiles dp ON dp.id = d.id JOIN appointment_slots s ON s.id = a.slot_id LEFT JOIN refunds r ON r.payment_id = p.id LEFT JOIN refund_requests rr ON rr.id = r.request_id
  WHERE a.patient_id = auth.uid() GROUP BY p.id, a.id, d.id, dp.id, s.id ORDER BY p.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.patient_payment_detail(uuid);
CREATE OR REPLACE FUNCTION public.patient_payment_detail(p_payment_id uuid)
RETURNS TABLE(payment_id uuid, appointment_id uuid, payment_purpose payment_purpose, payment_status payment_status, amount_minor integer, currency text, provider text, provider_order_id text, provider_payment_id text, failure_reason text, captured_at timestamptz, created_at timestamptz, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, refund_status refund_status, refund_amount_minor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.patient_payment_history() h WHERE h.payment_id = p_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_doctor_directory(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_directory(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_detail(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_doctor_slots(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_doctor_slots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_bookable_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paid_appointment(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_payment_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_payment_detail(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
