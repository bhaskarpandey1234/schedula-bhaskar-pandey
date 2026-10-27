CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('appointment_booked');--> statement-breakpoint

CREATE TABLE "appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" uuid NOT NULL,
  "doctor_id" uuid NOT NULL,
  "slot_id" uuid NOT NULL,
  "status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "appointments_reason_length" CHECK ("reason" IS NULL OR char_length("reason") <= 500)
);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_appointment_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."appointment_slots"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("patient_id", "created_at");--> statement-breakpoint
CREATE INDEX "appointments_doctor_idx" ON "appointments" USING btree ("doctor_id", "created_at");--> statement-breakpoint
CREATE INDEX "appointments_slot_idx" ON "appointments" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_patient_slot_unique" ON "appointments" USING btree ("patient_id", "slot_id");--> statement-breakpoint

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_id" uuid NOT NULL,
  "appointment_id" uuid NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id", "created_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END; $$;--> statement-breakpoint
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

DROP FUNCTION IF EXISTS public.patient_doctor_slots(uuid);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.patient_doctor_slots(p_doctor_id uuid)
RETURNS TABLE(slot_id uuid, slot_start_at timestamptz, slot_end_at timestamptz, timezone text, capacity integer, remaining_capacity integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT s.id, s.slot_start_at, s.slot_end_at, d.timezone, s.capacity, s.capacity - s.allocated_count
  FROM public.appointment_slots s
  JOIN public.availability_sessions a ON a.id = s.availability_session_id
  JOIN public.doctors d ON d.id = s.doctor_id
  WHERE s.doctor_id = p_doctor_id AND s.status = 'available' AND a.status = 'active'
    AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity
  ORDER BY s.slot_start_at;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_bookable_slot(p_slot_id uuid)
RETURNS TABLE(slot_id uuid, doctor_id uuid, full_name text, specialty text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, capacity integer, remaining_capacity integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.require_patient_directory_access();
  RETURN QUERY
  SELECT s.id, d.id, p.full_name, d.specialty, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, s.capacity, s.capacity - s.allocated_count
  FROM public.appointment_slots s
  JOIN public.availability_sessions a ON a.id = s.availability_session_id
  JOIN public.doctors d ON d.id = s.doctor_id
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  WHERE s.id = p_slot_id AND s.status = 'available' AND a.status = 'active'
    AND s.slot_start_at >= now() AND s.slot_start_at < now() + interval '30 days'
    AND s.allocated_count < s.capacity;
END;
$$;--> statement-breakpoint

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
  INSERT INTO public.notifications (recipient_id, appointment_id, type, title, message) VALUES (v_patient_id, v_appointment_id, 'appointment_booked', 'Appointment confirmed', 'Your appointment has been booked successfully.');
  RETURN v_appointment_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'You have already booked this slot';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.patient_appointment_confirmation(p_appointment_id uuid)
RETURNS TABLE(appointment_id uuid, status appointment_status, reason text, doctor_name text, clinic_name text, timezone text, slot_start_at timestamptz, slot_end_at timestamptz, notification_title text, notification_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'Only authenticated patients can view appointment confirmations';
  END IF;
  RETURN QUERY
  SELECT a.id, a.status, a.reason, p.full_name, d.clinic_name, d.timezone, s.slot_start_at, s.slot_end_at, n.title, n.message
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  JOIN public.profiles p ON p.id = d.id AND p.role = 'doctor'
  JOIN public.appointment_slots s ON s.id = a.slot_id
  LEFT JOIN public.notifications n ON n.appointment_id = a.id AND n.recipient_id = auth.uid()
  WHERE a.id = p_appointment_id AND a.patient_id = auth.uid();
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.patient_bookable_slot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_appointment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_appointment_confirmation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_doctor_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_bookable_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, text) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_appointment_confirmation(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.patient_doctor_slots(uuid) TO authenticated;--> statement-breakpoint

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_select_patient ON public.appointments FOR SELECT TO authenticated USING (patient_id = auth.uid());
CREATE POLICY appointments_select_doctor ON public.appointments FOR SELECT TO authenticated USING (doctor_id = auth.uid());
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
