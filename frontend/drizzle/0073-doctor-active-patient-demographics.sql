CREATE OR REPLACE FUNCTION public.doctor_active_patient_clinical_record(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id uuid;
  v_patient_dob date;
  v_patient_phone text;
  v_patient_name text;
  v_medical jsonb;
  v_revisions jsonb;
  v_visits jsonb;
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

  SELECT pt.date_of_birth, pt.phone, pr.full_name
  INTO v_patient_dob, v_patient_phone, v_patient_name
  FROM public.patients pt
  JOIN public.profiles pr ON pr.id = pt.id
  WHERE pt.id = v_patient_id;

  -- Do not call patient_clinical_record here. Its public access predicate
  -- deliberately limits a doctor to an active consultation, whereas this
  -- appointment-scoped RPC also permits the treating doctor after completion.
  -- Build the same record payload under the already-verified appointment scope
  -- so direct patient-record reads remain denied after a consultation ends.
  SELECT to_jsonb(v) INTO v_medical
  FROM (
    SELECT id, version, allergies, conditions, medical_details, source, verification_status,
      authored_by, verified_by, verified_at, created_at
    FROM public.patient_medical_history_versions
    WHERE patient_id = v_patient_id
    ORDER BY version DESC
    LIMIT 1
  ) v;

  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.version DESC), '[]'::jsonb) INTO v_revisions
  FROM (
    SELECT version, allergies, conditions, medical_details, source, verification_status,
      authored_by, verified_by, verified_at, created_at
    FROM public.patient_medical_history_versions
    WHERE patient_id = v_patient_id
    ORDER BY version DESC
  ) v;

  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.completed_at DESC, v.appointment_id DESC), '[]'::jsonb) INTO v_visits
  FROM (
    SELECT
      a.id AS appointment_id,
      a.completed_at,
      dp.full_name AS doctor_name,
      d.specialty,
      d.clinic_name,
      d.timezone,
      s.slot_start_at,
      s.slot_end_at,
      a.status::text AS appointment_status,
      summary.summary,
      summary.status::text AS summary_status,
      summary.published_at
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    JOIN public.profiles dp ON dp.id = d.id AND dp.role = 'doctor'
    JOIN public.appointment_slots s ON s.id = a.slot_id
    LEFT JOIN LATERAL (
      SELECT sv.summary, sv.status, sv.published_at
      FROM public.visit_summary_versions sv
      WHERE sv.appointment_id = a.id
        AND (sv.status = 'published' OR sv.doctor_id = auth.uid())
      ORDER BY sv.version DESC
      LIMIT 1
    ) summary ON true
    WHERE a.patient_id = v_patient_id AND a.status = 'completed'
  ) v;

  RETURN jsonb_build_object(
    'medical_history', v_medical,
    'medical_history_revisions', v_revisions,
    'visits', v_visits
  ) || jsonb_build_object(
    'patient_id', v_patient_id,
    'date_of_birth', v_patient_dob,
    'phone', v_patient_phone,
    'patient_name', v_patient_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_active_patient_clinical_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_active_patient_clinical_record(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
