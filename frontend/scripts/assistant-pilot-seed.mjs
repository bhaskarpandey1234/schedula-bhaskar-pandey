import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

export const pilotUsers = {
  doctor: { email: "pilot.doctor@schedula.example", name: "Dr. Mira Sen" },
  patient: { email: "pilot.patient@schedula.example", name: "Arjun Pilot" },
};

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function validateLocalEnvironment(env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const databaseUrl = env.DATABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const password = env.PILOT_SEED_PASSWORD;
  if (!supabaseUrl || !databaseUrl || !serviceRoleKey || !password) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PILOT_SEED_PASSWORD first.");
  }
  let supabaseHost;
  let databaseHost;
  try {
    supabaseHost = new URL(supabaseUrl).hostname;
    databaseHost = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("Supabase and database URLs must be valid URLs.");
  }
  if (!localHosts.has(supabaseHost) || !localHosts.has(databaseHost)) {
    throw new Error("Refusing to seed: both Supabase and DATABASE_URL must point to localhost.");
  }
  if (password.length < 12) throw new Error("PILOT_SEED_PASSWORD must be at least 12 characters.");
  return { supabaseUrl, databaseUrl, serviceRoleKey, password };
}

const dateAt = (date, hour, minute) => `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
const dateOffset = (days) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

async function ensureUser(admin, user, password, role) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let existing = listed.users.find((candidate) => candidate.email?.toLowerCase() === user.email.toLowerCase());
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({ email: user.email, password, email_confirm: true, user_metadata: { full_name: user.name, role, synthetic: true } });
    if (error || !data.user) throw error ?? new Error(`Could not create ${role} user.`);
    existing = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: user.name, role, synthetic: true } });
    if (error || !data.user) throw error ?? new Error(`Could not update ${role} user.`);
    existing = data.user;
  }
  return existing.id;
}

async function seedDatabase(databaseUrl, ids) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const completedDate = dateOffset(-7);
  const upcomingDate = dateOffset(3);
  const leaveDate = dateOffset(5);
  const pastSession = await sql`SELECT id FROM public.availability_sessions WHERE doctor_id = ${ids.doctor} AND session_date = ${completedDate} AND start_time = '09:00:00'::time LIMIT 1`;
  const upcomingSession = await sql`SELECT id FROM public.availability_sessions WHERE doctor_id = ${ids.doctor} AND session_date = ${upcomingDate} AND start_time = '09:00:00'::time LIMIT 1`;
  const leaveSession = await sql`SELECT id FROM public.availability_sessions WHERE doctor_id = ${ids.doctor} AND session_date = ${leaveDate} AND start_time = '14:00:00'::time LIMIT 1`;

  await sql.begin(async (tx) => {
    // Local synthetic data is inserted directly with the service role. Skip
    // production notification/profile gates whose trigger functions require a
    // signed-in browser session; the seed validates ownership through fixed
    // local Auth identities and never runs against hosted databases.
    await tx.unsafe("SET LOCAL session_replication_role = 'replica'");
    await tx`INSERT INTO public.profiles (id, full_name, role) VALUES (${ids.doctor}, ${pilotUsers.doctor.name}, 'doctor') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`;
    await tx`INSERT INTO public.profiles (id, full_name, role) VALUES (${ids.patient}, ${pilotUsers.patient.name}, 'patient') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`;
    await tx`INSERT INTO public.doctors (id, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency, phone) VALUES (${ids.doctor}, 'Cardiology', 'Cedar Pilot Clinic', 12, 'Synthetic doctor account for local assistant testing.', 'Asia/Kolkata', 100000, 'INR', '+919900000001') ON CONFLICT (id) DO UPDATE SET specialty = EXCLUDED.specialty, clinic_name = EXCLUDED.clinic_name, experience_years = EXCLUDED.experience_years, biography = EXCLUDED.biography, timezone = EXCLUDED.timezone, consultation_fee_minor = EXCLUDED.consultation_fee_minor`;
    await tx`INSERT INTO public.patients (id, phone, date_of_birth) VALUES (${ids.patient}, '+919900000002', '1990-04-20') ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth`;
    await tx`INSERT INTO public.assistant_pilot_access (user_id, label, enabled) VALUES (${ids.doctor}, 'synthetic-local-pilot', true), (${ids.patient}, 'synthetic-local-pilot', true) ON CONFLICT (user_id) DO UPDATE SET label = EXCLUDED.label, enabled = EXCLUDED.enabled`;

    async function ensureSession(sessionDate, startTime, endTime) {
      const existing = await tx`SELECT id FROM public.availability_sessions WHERE doctor_id = ${ids.doctor} AND session_date = ${sessionDate} AND start_time = ${startTime}::time LIMIT 1`;
      if (existing.length) return existing[0].id;
      const inserted = await tx`INSERT INTO public.availability_sessions (doctor_id, kind, scheduling_type, session_date, start_time, end_time, timezone, interval_minutes, capacity, session_start_at, session_end_at) VALUES (${ids.doctor}, 'custom', 'wave', ${sessionDate}, ${startTime}::time, ${endTime}::time, 'Asia/Kolkata', 30, 1, ${dateAt(sessionDate, Number(startTime.slice(0, 2)), Number(startTime.slice(3, 5)))}, ${dateAt(sessionDate, Number(endTime.slice(0, 2)), Number(endTime.slice(3, 5)))}) RETURNING id`;
      return inserted[0].id;
    }

    const pastSessionId = pastSession[0]?.id ?? await ensureSession(completedDate, '09:00', '11:00');
    const upcomingSessionId = upcomingSession[0]?.id ?? await ensureSession(upcomingDate, '09:00', '11:00');
    const leaveSessionId = leaveSession[0]?.id ?? await ensureSession(leaveDate, '14:00', '16:00');
    await tx`INSERT INTO public.doctor_leave_occurrences (doctor_id, availability_session_id, occurrence_date) VALUES (${ids.doctor}, ${leaveSessionId}, ${leaveDate}) ON CONFLICT (availability_session_id, occurrence_date) DO NOTHING`;

    async function ensureSlot(sessionId, startAt, endAt) {
      const existing = await tx`SELECT id FROM public.appointment_slots WHERE availability_session_id = ${sessionId} AND slot_start_at = ${startAt}::timestamptz LIMIT 1`;
      if (existing.length) return existing[0].id;
      const inserted = await tx`INSERT INTO public.appointment_slots (availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity, allocated_count, status) VALUES (${sessionId}, ${ids.doctor}, ${startAt}::timestamptz, ${endAt}::timestamptz, 1, 0, 'available') RETURNING id`;
      return inserted[0].id;
    }

    const completedSlot = await ensureSlot(pastSessionId, dateAt(completedDate, 9, 0), dateAt(completedDate, 9, 30));
    const cancelledSlot = await ensureSlot(pastSessionId, dateAt(completedDate, 10, 0), dateAt(completedDate, 10, 30));
    const upcomingSlot = await ensureSlot(upcomingSessionId, dateAt(upcomingDate, 9, 0), dateAt(upcomingDate, 9, 30));
    const overlappingSlot = await ensureSlot(upcomingSessionId, dateAt(upcomingDate, 9, 15), dateAt(upcomingDate, 9, 45));
    await ensureSlot(upcomingSessionId, dateAt(upcomingDate, 10, 0), dateAt(upcomingDate, 10, 30));

    async function ensureAppointment(slotId, status, reason, completedAt = null) {
      const existing = await tx`SELECT id FROM public.appointments WHERE patient_id = ${ids.patient} AND slot_id = ${slotId} LIMIT 1`;
      if (existing.length) {
        await tx`UPDATE public.appointments SET status = ${status}, reason = ${reason}, completed_at = ${completedAt} WHERE id = ${existing[0].id}`;
        return existing[0].id;
      }
      const inserted = await tx`INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot) VALUES (${ids.patient}, ${ids.doctor}, ${slotId}, ${status}, ${completedAt}, ${reason}, '24h full refund; 2h partial refund') RETURNING id`;
      return inserted[0].id;
    }

    const completedAppointment = await ensureAppointment(completedSlot, 'completed', 'Synthetic completed consultation', dateAt(completedDate, 9, 30));
    const cancelledAppointment = await ensureAppointment(cancelledSlot, 'cancelled', 'Synthetic cancelled appointment');
    await ensureAppointment(upcomingSlot, 'confirmed', 'Synthetic upcoming appointment');
    await ensureAppointment(overlappingSlot, 'confirmed', 'Synthetic overlapping appointment');
    await tx`UPDATE public.appointment_slots SET allocated_count = (SELECT count(*) FROM public.appointments WHERE slot_id = public.appointment_slots.id AND status IN ('confirmed', 'completed', 'payment_pending')) WHERE id IN (${completedSlot}, ${cancelledSlot}, ${upcomingSlot}, ${overlappingSlot})`;

    async function ensurePayment(appointmentId, idempotencyKey, orderId, paymentProviderId) {
      const existing = await tx`SELECT id FROM public.payments WHERE idempotency_key = ${idempotencyKey} LIMIT 1`;
      if (existing.length) return existing[0].id;
      const inserted = await tx`INSERT INTO public.payments (appointment_id, purpose, provider, status, amount_minor, currency, provider_order_id, provider_payment_id, idempotency_key, captured_at) VALUES (${appointmentId}, 'booking', 'razorpay_sandbox', 'captured', 100000, 'INR', ${orderId}, ${paymentProviderId}, ${idempotencyKey}, now()) RETURNING id`;
      return inserted[0].id;
    }
    await ensurePayment(completedAppointment, 'assistant-pilot-captured-payment', 'pilot_order_captured', 'pilot_payment_captured');
    const cancelledPaymentId = await ensurePayment(cancelledAppointment, 'assistant-pilot-cancelled-payment', 'pilot_order_cancelled', 'pilot_payment_cancelled');
    const refundRequest = await tx`SELECT id FROM public.refund_requests WHERE appointment_id = ${cancelledAppointment} AND reason = 'Synthetic sandbox refund' LIMIT 1`;
    let refundRequestId = refundRequest[0]?.id;
    if (!refundRequestId) {
      const inserted = await tx`INSERT INTO public.refund_requests (appointment_id, reason, amount_minor, currency, status) VALUES (${cancelledAppointment}, 'Synthetic sandbox refund', 100000, 'INR', 'processed') RETURNING id`;
      refundRequestId = inserted[0].id;
    }
    await tx`INSERT INTO public.refunds (request_id, payment_id, amount_minor, status, provider_refund_id, idempotency_key, processed_at) VALUES (${refundRequestId}, ${cancelledPaymentId}, 100000, 'processed', 'pilot_refund_processed', 'assistant-pilot-refund', now()) ON CONFLICT (idempotency_key) DO UPDATE SET status = EXCLUDED.status`;

    const prescription = await tx`SELECT id FROM public.prescriptions WHERE appointment_id = ${completedAppointment} AND status = 'published' LIMIT 1`;
    let prescriptionId = prescription[0]?.id;
    if (!prescriptionId) {
      const inserted = await tx`INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at) VALUES (${completedAppointment}, ${ids.doctor}, ${ids.patient}, 'published', 'Synthetic prescription for local testing only.', now()) RETURNING id`;
      prescriptionId = inserted[0].id;
    }
    await tx`INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order) SELECT ${prescriptionId}, 'Pilot Medication', '10 mg', 'Once daily', '7 days', 'Synthetic data. Do not use clinically.', 0 WHERE NOT EXISTS (SELECT 1 FROM public.prescription_items WHERE prescription_id = ${prescriptionId})`;
  });
  await sql.end();
}

export async function seedAssistantPilot(env = process.env) {
  const config = validateLocalEnvironment(env);
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ids = {
    doctor: await ensureUser(admin, pilotUsers.doctor, config.password, "doctor"),
    patient: await ensureUser(admin, pilotUsers.patient, config.password, "patient"),
  };
  await seedDatabase(config.databaseUrl, ids);
  return { ids, users: pilotUsers };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seedAssistantPilot()
    .then(({ users }) => {
      console.log("Local assistant pilot seed complete.");
      console.log(`Doctor login: ${users.doctor.email}`);
      console.log(`Patient login: ${users.patient.email}`);
      console.log("Password: the value supplied through PILOT_SEED_PASSWORD (not printed). ");
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
