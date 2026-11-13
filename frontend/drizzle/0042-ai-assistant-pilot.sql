-- Free-tier AI assistant pilot foundation. Pilot access is explicit and synthetic-only.
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$ BEGIN CREATE TYPE public.prescription_status AS ENUM ('draft', 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.assistant_action_status AS ENUM ('pending', 'confirmed', 'executing', 'succeeded', 'failed', 'expired', 'declined'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.doctor_leave_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  availability_session_id uuid NOT NULL REFERENCES public.availability_sessions(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (availability_session_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status public.prescription_status NOT NULL DEFAULT 'draft',
  notes text,
  supersedes_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  dosage text NOT NULL,
  frequency text NOT NULL,
  duration text NOT NULL,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.assistant_pilot_access (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'synthetic',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant_action_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('booking', 'reschedule', 'cancellation')),
  payload jsonb NOT NULL,
  preview jsonb NOT NULL,
  status public.assistant_action_status NOT NULL DEFAULT 'pending',
  fingerprint text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role public.user_role,
  action_type text,
  event_type text NOT NULL,
  outcome text,
  model text,
  language text,
  error_code text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_leave_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_pilot_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_action_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_leave_occurrences_doctor_select ON public.doctor_leave_occurrences FOR SELECT TO authenticated USING (doctor_id = auth.uid());
CREATE POLICY prescriptions_doctor_select ON public.prescriptions FOR SELECT TO authenticated USING (doctor_id = auth.uid());
CREATE POLICY prescriptions_patient_select ON public.prescriptions FOR SELECT TO authenticated USING (patient_id = auth.uid() AND status = 'published');
CREATE POLICY prescription_items_authorized_select ON public.prescription_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND ((p.doctor_id = auth.uid()) OR (p.patient_id = auth.uid() AND p.status = 'published'))));
CREATE POLICY assistant_pilot_access_self_select ON public.assistant_pilot_access FOR SELECT TO authenticated USING (user_id = auth.uid() AND enabled);
CREATE POLICY assistant_action_intents_self_select ON public.assistant_action_intents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY assistant_action_intents_self_insert ON public.assistant_action_intents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY assistant_action_intents_self_update ON public.assistant_action_intents FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY assistant_audit_events_self_select ON public.assistant_audit_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY assistant_audit_events_self_insert ON public.assistant_audit_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.complete_doctor_appointment(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.appointments a
  SET status = 'completed', completed_at = now(), updated_at = now()
  FROM public.appointment_slots s
  WHERE a.id = p_appointment_id
    AND a.slot_id = s.id
    AND a.doctor_id = auth.uid()
    AND a.status = 'confirmed'
    AND s.slot_start_at <= now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment cannot be completed'; END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.complete_doctor_appointment(uuid) TO authenticated;
GRANT SELECT ON public.doctor_leave_occurrences, public.prescriptions, public.prescription_items, public.assistant_pilot_access, public.assistant_action_intents, public.assistant_audit_events TO authenticated;

-- Record leave whenever the established occurrence-cancellation flow is used.
CREATE OR REPLACE FUNCTION public.record_doctor_leave(p_session_id uuid, p_occurrence_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.availability_sessions WHERE id = p_session_id AND doctor_id = auth.uid()) THEN
    RAISE EXCEPTION 'Availability session was not found';
  END IF;
  INSERT INTO public.doctor_leave_occurrences(doctor_id, availability_session_id, occurrence_date)
  VALUES (auth.uid(), p_session_id, p_occurrence_date)
  ON CONFLICT (availability_session_id, occurrence_date) DO NOTHING;
END; $$;

GRANT EXECUTE ON FUNCTION public.record_doctor_leave(uuid, date) TO authenticated;

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
DECLARE v_appointment public.appointments%ROWTYPE; v_prescription uuid;
BEGIN
  SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id AND doctor_id = auth.uid() AND status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only completed doctor appointments can receive prescriptions'; END IF;
  INSERT INTO public.prescriptions(appointment_id, doctor_id, patient_id, status, notes, published_at)
  VALUES (v_appointment.id, auth.uid(), v_appointment.patient_id, 'published', NULLIF(trim(p_notes), ''), now())
  RETURNING id INTO v_prescription;
  INSERT INTO public.prescription_items(prescription_id, medication_name, dosage, frequency, duration, instructions)
  VALUES (v_prescription, trim(p_medication_name), trim(p_dosage), trim(p_frequency), trim(p_duration), NULLIF(trim(p_instructions), ''));
  RETURN v_prescription;
END; $$;

GRANT EXECUTE ON FUNCTION public.publish_doctor_prescription(uuid, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
