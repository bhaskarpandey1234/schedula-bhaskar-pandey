-- Explicitly cast the CASE result for PostgreSQL enum assignment. This keeps
-- the stored procedure valid on databases that already applied 0066.
CREATE OR REPLACE FUNCTION public.save_doctor_visit_summary(
  p_appointment_id uuid,
  p_expected_version integer,
  p_summary text,
  p_publish boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_current_version integer := 0;
  v_active_consultation boolean := false;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT a.* INTO v_appointment
  FROM public.appointments a
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE a.id = p_appointment_id AND a.doctor_id = auth.uid() AND p.role = 'doctor';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the treating doctor can update this visit summary' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.queue_entries e
    WHERE e.appointment_id = p_appointment_id AND e.status = 'in_consultation'
  ) INTO v_active_consultation;
  IF NOT v_active_consultation AND v_appointment.status <> 'completed' THEN
    RAISE EXCEPTION 'Visit summaries can be drafted during consultation or updated after completion';
  END IF;
  IF p_publish AND v_appointment.status <> 'completed' THEN
    RAISE EXCEPTION 'Complete the consultation before publishing its patient summary';
  END IF;
  IF length(trim(COALESCE(p_summary, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Visit summary must be between 1 and 4000 characters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_appointment_id::text, 0));
  SELECT version INTO v_current_version
  FROM public.visit_summary_versions
  WHERE appointment_id = p_appointment_id
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;
  v_current_version := COALESCE(v_current_version, 0);
  IF p_expected_version IS DISTINCT FROM v_current_version THEN
    RAISE EXCEPTION 'Visit summary changed; refresh and review the latest version' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.visit_summary_versions(
    appointment_id, doctor_id, patient_id, version, summary, status, authored_by, published_at
  ) VALUES (
    p_appointment_id, v_appointment.doctor_id, v_appointment.patient_id, v_current_version + 1,
    trim(p_summary), (CASE WHEN p_publish THEN 'published' ELSE 'draft' END)::public.visit_summary_status,
    auth.uid(), CASE WHEN p_publish THEN now() ELSE NULL END
  );
  RETURN v_current_version + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.save_doctor_visit_summary(uuid, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_doctor_visit_summary(uuid, integer, text, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
