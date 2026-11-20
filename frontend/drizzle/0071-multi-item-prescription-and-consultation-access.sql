CREATE OR REPLACE FUNCTION public.doctor_active_patient_clinical_record(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());

  SELECT a.patient_id INTO v_patient_id
  FROM public.appointments a
  JOIN public.profiles p ON p.id = auth.uid()
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND p.role = 'doctor'
    AND (
      e.status IN ('in_consultation', 'completed')
      OR a.status = 'completed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient clinical record is accessible to treating doctor during consultation or for completed visits' USING ERRCODE = '42501';
  END IF;

  RETURN public.patient_clinical_record(v_patient_id) || jsonb_build_object('patient_id', v_patient_id);
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_active_patient_clinical_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_active_patient_clinical_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_doctor_prescription_v2(
  p_appointment_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_diagnosis text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_prescription_id uuid;
  v_item jsonb;
  v_sort_order integer := 0;
  v_med_name text;
  v_dosage text;
  v_freq text;
  v_dur text;
  v_inst text;
  v_full_notes text;
  v_existing_id uuid;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());

  SELECT a.* INTO v_appointment
  FROM public.appointments a
  JOIN public.profiles p ON p.id = auth.uid()
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND p.role = 'doctor'
    AND (
      e.status IN ('in_consultation', 'completed')
      OR a.status = 'completed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescriptions can be issued during active consultation or for completed visits' USING ERRCODE = '42501';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one medication item is required to issue a prescription' USING ERRCODE = '22000';
  END IF;

  v_full_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
  IF NULLIF(trim(COALESCE(p_diagnosis, '')), '') IS NOT NULL THEN
    IF v_full_notes IS NOT NULL THEN
      v_full_notes := 'Diagnosis: ' || trim(p_diagnosis) || E'\n\n' || v_full_notes;
    ELSE
      v_full_notes := 'Diagnosis: ' || trim(p_diagnosis);
    END IF;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.prescriptions
  WHERE appointment_id = v_appointment.id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.prescriptions (
    appointment_id,
    doctor_id,
    patient_id,
    status,
    notes,
    supersedes_prescription_id,
    published_at
  )
  VALUES (
    v_appointment.id,
    auth.uid(),
    v_appointment.patient_id,
    'published',
    v_full_notes,
    v_existing_id,
    now()
  )
  RETURNING id INTO v_prescription_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_med_name := trim(COALESCE(v_item->>'medication_name', v_item->>'medicationName', ''));
    v_dosage := trim(COALESCE(v_item->>'dosage', ''));
    v_freq := trim(COALESCE(v_item->>'frequency', ''));
    v_dur := trim(COALESCE(v_item->>'duration', ''));
    v_inst := NULLIF(trim(COALESCE(v_item->>'instructions', '')), '');

    IF v_med_name = '' OR v_dosage = '' OR v_freq = '' OR v_dur = '' THEN
      RAISE EXCEPTION 'Medication name, dosage, frequency, and duration are required for all items' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.prescription_items (
      prescription_id,
      medication_name,
      dosage,
      frequency,
      duration,
      instructions,
      sort_order
    )
    VALUES (
      v_prescription_id,
      v_med_name,
      v_dosage,
      v_freq,
      v_dur,
      v_inst,
      v_sort_order
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  RETURN v_prescription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_doctor_prescription_v2(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_doctor_prescription_v2(uuid, jsonb, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_doctor_prescription(
  p_appointment_id uuid,
  p_medication_name text,
  p_dosage text,
  p_frequency text,
  p_duration text,
  p_instructions text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_prescription uuid;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());

  SELECT a.* INTO v_appointment
  FROM public.appointments a
  JOIN public.profiles p ON p.id = auth.uid()
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND p.role = 'doctor'
    AND (
      e.status IN ('in_consultation', 'completed')
      OR a.status = 'completed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescriptions can be issued during active consultation or for completed visits' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.prescriptions(appointment_id, doctor_id, patient_id, status, notes, published_at)
  VALUES (v_appointment.id, auth.uid(), v_appointment.patient_id, 'published', NULLIF(trim(p_notes), ''), now())
  RETURNING id INTO v_prescription;

  INSERT INTO public.prescription_items(prescription_id, medication_name, dosage, frequency, duration, instructions)
  VALUES (v_prescription, trim(p_medication_name), trim(p_dosage), trim(p_frequency), trim(p_duration), NULLIF(trim(p_instructions), ''));

  RETURN v_prescription;
END; $$;

REVOKE ALL ON FUNCTION public.publish_doctor_prescription(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_doctor_prescription(uuid, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
