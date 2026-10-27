CREATE TYPE "public"."availability_session_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."appointment_slot_status" AS ENUM('available', 'cancelled');--> statement-breakpoint
CREATE TABLE "availability_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "doctor_id" uuid NOT NULL,
  "session_date" date NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "timezone" text NOT NULL,
  "interval_minutes" integer DEFAULT 30 NOT NULL,
  "capacity" integer DEFAULT 3 NOT NULL,
  "status" "availability_session_status" DEFAULT 'active' NOT NULL,
  "session_start_at" timestamp with time zone NOT NULL,
  "session_end_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "availability_sessions_time_order" CHECK ("end_time" > "start_time"),
  CONSTRAINT "availability_sessions_interval" CHECK ("interval_minutes" IN (15, 30, 60)),
  CONSTRAINT "availability_sessions_capacity" CHECK ("capacity" BETWEEN 1 AND 10),
  CONSTRAINT "availability_sessions_bounds" CHECK ("session_end_at" > "session_start_at")
);--> statement-breakpoint
ALTER TABLE "availability_sessions" ADD CONSTRAINT "availability_sessions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "availability_sessions_doctor_date_idx" ON "availability_sessions" USING btree ("doctor_id", "session_date");--> statement-breakpoint
CREATE TABLE "appointment_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "availability_session_id" uuid NOT NULL,
  "doctor_id" uuid NOT NULL,
  "slot_start_at" timestamp with time zone NOT NULL,
  "slot_end_at" timestamp with time zone NOT NULL,
  "capacity" integer NOT NULL,
  "allocated_count" integer DEFAULT 0 NOT NULL,
  "status" "appointment_slot_status" DEFAULT 'available' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "appointment_slots_time_order" CHECK ("slot_end_at" > "slot_start_at"),
  CONSTRAINT "appointment_slots_capacity" CHECK ("capacity" BETWEEN 1 AND 10),
  CONSTRAINT "appointment_slots_allocated_count" CHECK ("allocated_count" BETWEEN 0 AND "capacity")
);--> statement-breakpoint
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_session_id_fk" FOREIGN KEY ("availability_session_id") REFERENCES "public"."availability_sessions"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "appointment_slots_session_start_idx" ON "appointment_slots" USING btree ("availability_session_id", "slot_start_at");--> statement-breakpoint
CREATE INDEX "appointment_slots_doctor_start_idx" ON "appointment_slots" USING btree ("doctor_id", "slot_start_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END; $$;--> statement-breakpoint
CREATE TRIGGER availability_sessions_set_updated_at BEFORE UPDATE ON public.availability_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER appointment_slots_set_updated_at BEFORE UPDATE ON public.appointment_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_availability_session_with_slots(
  p_session_date date,
  p_start_time time,
  p_end_time time,
  p_timezone text,
  p_interval_minutes integer DEFAULT 30,
  p_capacity integer DEFAULT 3
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor_id uuid := auth.uid();
  v_session_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
BEGIN
  IF v_doctor_id IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_doctor_id AND role = 'doctor') THEN
    RAISE EXCEPTION 'Only authenticated doctors can create availability';
  END IF;
  IF p_interval_minutes NOT IN (15, 30, 60) OR p_capacity NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid interval or capacity';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text, 0));
  v_start_at := (p_session_date + p_start_time) AT TIME ZONE p_timezone;
  v_end_at := (p_session_date + p_end_time) AT TIME ZONE p_timezone;
  IF p_end_time <= p_start_time OR v_start_at <= now() THEN
    RAISE EXCEPTION 'Availability must be a future, same-day window';
  END IF;
  IF EXISTS (SELECT 1 FROM availability_sessions WHERE doctor_id = v_doctor_id AND status = 'active' AND session_start_at < v_end_at AND session_end_at > v_start_at) THEN
    RAISE EXCEPTION 'Availability overlaps an existing session';
  END IF;
  INSERT INTO availability_sessions (doctor_id, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at)
  VALUES (v_doctor_id, p_session_date, p_start_time, p_end_time, p_timezone, p_interval_minutes, p_capacity, v_start_at, v_end_at)
  RETURNING id INTO v_session_id;
  v_slot_start := v_start_at;
  WHILE v_slot_start + make_interval(mins => p_interval_minutes) <= v_end_at LOOP
    v_slot_end := v_slot_start + make_interval(mins => p_interval_minutes);
    INSERT INTO appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity)
    VALUES (v_session_id, v_doctor_id, v_slot_start, v_slot_end, p_capacity);
    v_slot_start := v_slot_end;
  END LOOP;
  RETURN v_session_id;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_availability_session_with_slots(date, time, time, text, integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_availability_session_with_slots(date, time, time, text, integer, integer) TO authenticated;--> statement-breakpoint
ALTER TABLE public.availability_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY availability_sessions_select_own ON public.availability_sessions FOR SELECT TO authenticated USING (doctor_id = auth.uid());--> statement-breakpoint
CREATE POLICY availability_sessions_update_own ON public.availability_sessions FOR UPDATE TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());--> statement-breakpoint
CREATE POLICY availability_sessions_delete_own ON public.availability_sessions FOR DELETE TO authenticated USING (doctor_id = auth.uid());--> statement-breakpoint
CREATE POLICY appointment_slots_select_own ON public.appointment_slots FOR SELECT TO authenticated USING (doctor_id = auth.uid());--> statement-breakpoint
CREATE POLICY appointment_slots_update_own ON public.appointment_slots FOR UPDATE TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());--> statement-breakpoint
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
