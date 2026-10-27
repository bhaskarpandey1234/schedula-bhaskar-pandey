ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'appointment_cancelled';--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.book_appointment(p_slot_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_patient_id uuid := auth.uid();
  v_slot record;
  v_appointment_id uuid;
  v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_patient_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_patient_id AND role = 'patient') OR NOT EXISTS (SELECT 1 FROM public.patients WHERE id = v_patient_id) THEN
    RAISE EXCEPTION 'Only onboarded patients can book appointments';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN RAISE EXCEPTION 'Visit reason must be 500 characters or fewer'; END IF;
  SELECT s.id, s.doctor_id, s.capacity, s.allocated_count, s.status AS slot_status, s.slot_start_at, a.status AS session_status
    INTO v_slot
    FROM public.appointment_slots s JOIN public.availability_sessions a ON a.id = s.availability_session_id
    WHERE s.id = p_slot_id FOR UPDATE OF s, a;
  IF NOT FOUND OR v_slot.slot_status <> 'available' OR v_slot.session_status <> 'active' OR v_slot.slot_start_at <= now() THEN RAISE EXCEPTION 'This slot is no longer available'; END IF;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = v_patient_id AND slot_id = p_slot_id) THEN RAISE EXCEPTION 'You have already booked this slot'; END IF;
  IF v_slot.allocated_count >= v_slot.capacity THEN RAISE EXCEPTION 'This slot is full'; END IF;
  UPDATE public.appointment_slots SET allocated_count = allocated_count + 1 WHERE id = p_slot_id AND allocated_count < capacity;
  INSERT INTO public.appointments (patient_id, doctor_id, slot_id, reason) VALUES (v_patient_id, v_slot.doctor_id, p_slot_id, v_reason) RETURNING id INTO v_appointment_id;
  INSERT INTO public.notifications (recipient_id, appointment_id, type, title, message)
  VALUES
    (v_patient_id, v_appointment_id, 'appointment_booked', 'Appointment confirmed', 'Your appointment has been booked successfully.'),
    (v_slot.doctor_id, v_appointment_id, 'appointment_booked', 'New appointment booked', 'A patient has booked one of your available slots.');
  RETURN v_appointment_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'You have already booked this slot';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Only authenticated patients can view appointments';
  END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY
  SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles doctor_profile ON doctor_profile.id = d.id AND doctor_profile.role = 'doctor'
  JOIN public.appointment_slots s ON s.id = a.slot_id
  WHERE a.patient_id = auth.uid()
    AND ((p_tab = 'upcoming' AND a.status = 'confirmed' AND s.slot_end_at >= now())
      OR (p_tab = 'past' AND a.status = 'confirmed' AND s.slot_end_at < now())
      OR (p_tab = 'cancelled' AND a.status = 'cancelled'))
  ORDER BY s.slot_start_at DESC;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.cancel_patient_appointment(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_patient_id uuid := auth.uid();
  v_appointment record;
BEGIN
  IF v_patient_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_patient_id AND role = 'patient') OR NOT EXISTS (SELECT 1 FROM public.patients WHERE id = v_patient_id) THEN
    RAISE EXCEPTION 'Only onboarded patients can cancel appointments';
  END IF;
  SELECT a.id, a.patient_id, a.doctor_id, a.status, a.slot_id, s.slot_start_at
    INTO v_appointment
    FROM public.appointments a
    JOIN public.appointment_slots s ON s.id = a.slot_id
    WHERE a.id = p_appointment_id
    FOR UPDATE OF a, s;
  IF NOT FOUND OR v_appointment.patient_id <> v_patient_id THEN RAISE EXCEPTION 'Appointment was not found'; END IF;
  IF v_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'This appointment is already cancelled'; END IF;
  IF v_appointment.slot_start_at <= now() THEN RAISE EXCEPTION 'Only future appointments can be cancelled'; END IF;
  UPDATE public.appointments SET status = 'cancelled' WHERE id = v_appointment.id AND status = 'confirmed';
  UPDATE public.appointment_slots SET allocated_count = allocated_count - 1 WHERE id = v_appointment.slot_id AND allocated_count > 0;
  EXECUTE 'INSERT INTO public.notifications (recipient_id, appointment_id, type, title, message) VALUES ($1, $2, $3::notification_type, $4, $5)'
    USING v_patient_id, v_appointment.id, 'appointment_cancelled', 'Appointment cancelled', 'Your appointment has been cancelled.';
  EXECUTE 'INSERT INTO public.notifications (recipient_id, appointment_id, type, title, message) VALUES ($1, $2, $3::notification_type, $4, $5)'
    USING v_appointment.doctor_id, v_appointment.id, 'appointment_cancelled', 'Appointment cancelled', 'A patient has cancelled an appointment in your schedule.';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.doctor_schedule_appointments(p_session_date date)
RETURNS TABLE(appointment_id uuid, slot_id uuid, patient_name text, status appointment_status, slot_start_at timestamptz, slot_end_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can view schedule appointments';
  END IF;
  RETURN QUERY
  SELECT a.id, s.id, patient_profile.full_name, a.status, s.slot_start_at, s.slot_end_at
  FROM public.appointments a
  JOIN public.appointment_slots s ON s.id = a.slot_id
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles patient_profile ON patient_profile.id = a.patient_id AND patient_profile.role = 'patient'
  WHERE a.doctor_id = auth.uid() AND (s.slot_start_at AT TIME ZONE d.timezone)::date = p_session_date
  ORDER BY s.slot_start_at, patient_profile.full_name;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.patient_appointments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_patient_appointment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_schedule_appointments(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_patient_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_schedule_appointments(date) TO authenticated;--> statement-breakpoint
