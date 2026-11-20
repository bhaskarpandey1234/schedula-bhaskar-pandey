-- Patient clinical record foundation. These records are append-only so that
-- corrections retain their prior clinical context and author.
DO $$ BEGIN
  CREATE TYPE public.medical_history_source AS ENUM ('patient_reported', 'doctor_recorded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.medical_history_verification AS ENUM ('self_reported', 'clinician_verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.visit_summary_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.patient_medical_history_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  allergies jsonb NOT NULL,
  conditions jsonb NOT NULL,
  medical_details text,
  source public.medical_history_source NOT NULL,
  verification_status public.medical_history_verification NOT NULL,
  authored_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, version),
  CHECK (jsonb_typeof(allergies) = 'object'),
  CHECK (jsonb_typeof(conditions) = 'object'),
  CHECK (verified_by IS NULL OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS patient_medical_history_versions_patient_created_idx
  ON public.patient_medical_history_versions(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.visit_summary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 4000),
  status public.visit_summary_status NOT NULL,
  authored_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, version),
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS visit_summary_versions_appointment_version_idx
  ON public.visit_summary_versions(appointment_id, version DESC);
CREATE INDEX IF NOT EXISTS visit_summary_versions_patient_created_idx
  ON public.visit_summary_versions(patient_id, created_at DESC);

ALTER TABLE public.patient_medical_history_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_summary_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_medical_history_versions, public.visit_summary_versions FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.can_access_active_patient_record(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() = p_patient_id
    OR EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.queue_entries e ON e.appointment_id = a.id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.patient_id = p_patient_id
        AND a.doctor_id = auth.uid()
        AND p.role = 'doctor'
        AND e.status = 'in_consultation'
    );
$$;
REVOKE ALL ON FUNCTION public.can_access_active_patient_record(uuid) FROM PUBLIC;

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
        -- A treating doctor may see their own draft, but a draft from a
        -- different clinician is not part of the shared patient record.
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

CREATE OR REPLACE FUNCTION public.save_patient_medical_history(
  p_patient_id uuid,
  p_expected_version integer,
  p_allergies jsonb,
  p_conditions jsonb,
  p_medical_details text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_current_version integer := 0;
  v_source public.medical_history_source;
  v_verification public.medical_history_verification;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF NOT public.can_access_active_patient_record(p_patient_id) THEN
    RAISE EXCEPTION 'Clinical record access is available only to the patient or the active treating doctor' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(jsonb_typeof(p_allergies), '') <> 'object'
      OR COALESCE(p_allergies->>'status', '') NOT IN ('unknown', 'none_known', 'recorded')
      OR COALESCE(jsonb_typeof(p_allergies->'items'), '') <> 'array'
      OR COALESCE(jsonb_typeof(p_conditions), '') <> 'object'
      OR COALESCE(jsonb_typeof(p_conditions->'items'), '') <> 'array' THEN
    RAISE EXCEPTION 'Invalid medical history format';
  END IF;
  IF (p_allergies->>'status' IN ('unknown', 'none_known') AND jsonb_array_length(p_allergies->'items') <> 0)
      OR (p_allergies->>'status' = 'recorded' AND jsonb_array_length(p_allergies->'items') = 0) THEN
    RAISE EXCEPTION 'Allergy status does not match the supplied allergy records';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  SELECT version INTO v_current_version
  FROM public.patient_medical_history_versions
  WHERE patient_id = p_patient_id
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;
  v_current_version := COALESCE(v_current_version, 0);
  IF p_expected_version IS DISTINCT FROM v_current_version THEN
    RAISE EXCEPTION 'Medical history changed; refresh and review the latest version' USING ERRCODE = '40001';
  END IF;

  v_source := CASE WHEN v_role = 'doctor' THEN 'doctor_recorded' ELSE 'patient_reported' END;
  v_verification := CASE WHEN v_role = 'doctor' THEN 'clinician_verified' ELSE 'self_reported' END;
  INSERT INTO public.patient_medical_history_versions(
    patient_id, version, allergies, conditions, medical_details, source, verification_status,
    authored_by, verified_by, verified_at
  ) VALUES (
    p_patient_id, v_current_version + 1, p_allergies, p_conditions,
    NULLIF(trim(COALESCE(p_medical_details, '')), ''), v_source, v_verification,
    auth.uid(), CASE WHEN v_role = 'doctor' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_role = 'doctor' THEN now() ELSE NULL END
  );
  RETURN v_current_version + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_visit_summary(p_appointment_id uuid)
RETURNS TABLE(version integer, summary text, status text, published_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_verified_user(auth.uid());
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE a.id = p_appointment_id AND a.doctor_id = auth.uid() AND p.role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'Only the treating doctor can view this visit summary' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.version, v.summary, v.status::text, v.published_at, v.created_at
    FROM public.visit_summary_versions v
    WHERE v.appointment_id = p_appointment_id
    ORDER BY v.version DESC
    LIMIT 1;
END;
$$;

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
  JOIN public.queue_entries e ON e.appointment_id = a.id
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND p.role = 'doctor'
    AND e.status = 'in_consultation';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient history is available while this patient is in consultation' USING ERRCODE = '42501';
  END IF;
  RETURN public.patient_clinical_record(v_patient_id) || jsonb_build_object('patient_id', v_patient_id);
END;
$$;

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
    trim(p_summary), (CASE WHEN p_publish THEN 'published' ELSE 'draft' END)::public.visit_summary_status, auth.uid(),
    CASE WHEN p_publish THEN now() ELSE NULL END
  );
  RETURN v_current_version + 1;
END;
$$;

-- The queue migration temporarily replaced this RPC and omitted completed visits.
-- Preserve the queue token enhancement while restoring completed clinical visits.
CREATE OR REPLACE FUNCTION public.patient_appointments(p_tab text)
RETURNS TABLE(
  appointment_id uuid, status public.appointment_status, reason text, doctor_name text,
  specialty text, clinic_name text, timezone text, slot_start_at timestamptz,
  slot_end_at timestamptz, scheduling_type public.availability_scheduling_type,
  payment_status public.payment_status, payment_amount_minor integer,
  refund_status public.refund_status, refund_amount_minor integer, token_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient'
  ) THEN RAISE EXCEPTION 'Only authenticated patients can view appointments'; END IF;
  IF p_tab NOT IN ('upcoming', 'past', 'cancelled') THEN RAISE EXCEPTION 'Invalid appointment tab'; END IF;
  RETURN QUERY
    SELECT a.id, a.status, a.reason, doctor_profile.full_name, d.specialty, d.clinic_name,
      d.timezone, s.slot_start_at, s.slot_end_at, av.scheduling_type, payment.status,
      payment.amount_minor, refund.status, refund.amount_minor,
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
      FROM public.refund_requests rr JOIN public.refunds r ON r.request_id = rr.id
      WHERE rr.appointment_id = a.id
      GROUP BY rr.status ORDER BY max(rr.created_at) DESC LIMIT 1
    ) refund ON true
    WHERE a.patient_id = auth.uid() AND (
      (p_tab = 'upcoming' AND a.status IN ('confirmed', 'reschedule_pending') AND s.slot_end_at >= now())
      OR (p_tab = 'past' AND (a.status = 'completed' OR (a.status IN ('confirmed', 'reschedule_pending') AND s.slot_end_at < now())))
      OR (p_tab = 'cancelled' AND a.status = 'cancelled')
    )
    ORDER BY CASE WHEN p_tab = 'upcoming' THEN s.slot_start_at END ASC,
      CASE WHEN p_tab IN ('past', 'cancelled') THEN s.slot_start_at END DESC, a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_clinical_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_patient_medical_history(uuid, integer, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_visit_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.doctor_active_patient_clinical_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_doctor_visit_summary(uuid, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_appointments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_clinical_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_patient_medical_history(uuid, integer, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_visit_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_active_patient_clinical_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_doctor_visit_summary(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_appointments(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
