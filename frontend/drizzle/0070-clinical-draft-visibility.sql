-- Draft summaries remain visible only to their author. An active treating
-- doctor can review the shared chart, but must not inherit another doctor's
-- unpublished notes for a previous visit.
CREATE OR REPLACE FUNCTION public.patient_clinical_record(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_medical jsonb;
  v_revisions jsonb;
  v_visits jsonb;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT public.can_access_active_patient_record(p_patient_id) THEN
    RAISE EXCEPTION 'Clinical record access is available only to the patient or the active treating doctor' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(v) INTO v_medical
  FROM (
    SELECT id, version, allergies, conditions, medical_details, source, verification_status,
      authored_by, verified_by, verified_at, created_at
    FROM public.patient_medical_history_versions
    WHERE patient_id = p_patient_id
    ORDER BY version DESC
    LIMIT 1
  ) v;

  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.version DESC), '[]'::jsonb) INTO v_revisions
  FROM (
    SELECT version, allergies, conditions, medical_details, source, verification_status,
      authored_by, verified_by, verified_at, created_at
    FROM public.patient_medical_history_versions
    WHERE patient_id = p_patient_id
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
    WHERE a.patient_id = p_patient_id AND a.status = 'completed'
  ) v;

  RETURN jsonb_build_object(
    'medical_history', v_medical,
    'medical_history_revisions', v_revisions,
    'visits', v_visits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.patient_clinical_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_clinical_record(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
