import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

export const pilotUsers = {
  doctor: { email: "pilot.doctor@schedula.example", name: "Dr. Mira Sen" },
  patient: { email: "pilot.patient@schedula.example", name: "Arjun Pilot" },
};

export const queueDemoPatients = [
  { email: "pilot.queue.01@schedula.example", name: "Aarav Khanna", phone: "+919900000101", dateOfBirth: "1985-03-12" },
  { email: "pilot.queue.02@schedula.example", name: "Nisha Verma", phone: "+919900000102", dateOfBirth: "1992-07-28" },
  { email: "pilot.queue.03@schedula.example", name: "Kabir Rao", phone: "+919900000103", dateOfBirth: "1978-01-15" },
  { email: "pilot.queue.04@schedula.example", name: "Meera Joshi", phone: "+919900000104", dateOfBirth: "1990-10-05" },
  { email: "pilot.queue.05@schedula.example", name: "Ishaan Das", phone: "+919900000105", dateOfBirth: "1988-06-21" },
];

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const pilotTimezone = "Asia/Kolkata";

export function validateLocalEnvironment(env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const databaseUrl = env.DATABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const password = env.PILOT_SEED_PASSWORD;
  if (!supabaseUrl || !databaseUrl || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, DATABASE_URL, and SUPABASE_SERVICE_ROLE_KEY first.");
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
  if (password && password.length < 12) throw new Error("PILOT_SEED_PASSWORD must be at least 12 characters when set.");
  const today = dateInTimezone(new Date(), pilotTimezone);
  const queueDemoDate = env.PILOT_QUEUE_DEMO_DATE || today;
  const parsedDate = new Date(`${queueDemoDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(queueDemoDate)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== queueDemoDate
      || queueDemoDate < today) {
    throw new Error("PILOT_QUEUE_DEMO_DATE must be a valid date today or later in Asia/Kolkata.");
  }
  return { supabaseUrl, databaseUrl, serviceRoleKey, password, queueDemoDate };
}

const dateAt = (date, hour, minute) => `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;
const dateOffset = (days) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function dateInTimezone(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timeInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function timeMinutes(value) {
  const [hours, minutes] = String(value).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function sessionOccursOnDate(session, serviceDate) {
  if (session.status !== "active") return false;
  if (session.kind === "custom") return String(session.session_date).slice(0, 10) === serviceDate;
  if (serviceDate < String(session.recurrence_start_date).slice(0, 10)
      || serviceDate > String(session.recurrence_end_date).slice(0, 10)) return false;

  const date = new Date(`${serviceDate}T00:00:00.000Z`);
  const dayOfMonth = date.getUTCDate();
  if (session.kind === "weekly") {
    const isoWeekday = date.getUTCDay() || 7;
    return Number(session.day_of_week) === isoWeekday;
  }
  if (session.kind === "monthly") {
    if (Array.isArray(session.monthly_days)) return session.monthly_days.includes(dayOfMonth);
    const firstDay = Number(String(session.recurrence_start_date).slice(8, 10));
    return dayOfMonth >= firstDay && dayOfMonth <= Number(session.monthly_range_end_day);
  }
  return false;
}

export function findDemoQueueStartMinute(sessions, serviceDate, timezone, now = new Date()) {
  const occupied = sessions
    .filter((session) => sessionOccursOnDate(session, serviceDate))
    .map((session) => [timeMinutes(session.start_time), timeMinutes(session.end_time)]);
  const firstPreferred = Math.min(1260, Math.ceil(timeInTimezone(now, timezone) / 30) * 30);
  const candidates = [];
  for (let minute = firstPreferred; minute <= 1260; minute += 30) candidates.push(minute);
  for (let minute = 0; minute < firstPreferred; minute += 30) candidates.push(minute);
  return candidates.find((start) => {
    const end = start + 150;
    return !occupied.some(([occupiedStart, occupiedEnd]) => occupiedStart < end && occupiedEnd > start);
  }) ?? null;
}

async function assertQueueSchema(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [schema] = await sql`
      SELECT
        to_regclass('public.clinics') IS NOT NULL AS has_clinics,
        to_regclass('public.queue_sessions') IS NOT NULL AS has_queue_sessions,
        to_regclass('public.queue_entries') IS NOT NULL AS has_queue_entries,
        to_regclass('public.queue_events') IS NOT NULL AS has_queue_events,
        (SELECT is_nullable = 'YES' FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'queue_entries' AND column_name = 'checked_in_at') AS unchecked_in_tokens_supported,
        to_regprocedure('public.queue_appointment_board(uuid,uuid,date,uuid)') IS NOT NULL AS has_queue_board,
        to_regprocedure('public.doctor_queue_summary_for_slot(uuid,date,uuid)') IS NOT NULL AS has_doctor_slot_summary,
        to_regprocedure('public.transition_queue_entry(uuid,text)') IS NOT NULL AS has_queue_transitions,
        to_regprocedure('public.check_in_appointment(uuid)') IS NOT NULL AS has_check_in,
        to_regprocedure('public.patient_appointment_queue_token(uuid)') IS NOT NULL AS has_patient_tokens,
        COALESCE(position('token_reassigned' IN pg_get_functiondef(to_regprocedure('public.sync_appointment_queue()'))) > 0, false) AS has_queue_safety
    `;
    const required = [
      "has_clinics",
      "has_queue_sessions",
      "has_queue_entries",
      "has_queue_events",
      "unchecked_in_tokens_supported",
      "has_queue_board",
      "has_doctor_slot_summary",
      "has_queue_transitions",
      "has_check_in",
      "has_patient_tokens",
      "has_queue_safety",
    ];
    if (required.some((name) => schema[name] !== true)) {
      throw new Error("Local queue demo seed requires migrations 0058–0063. Missing queue schema or RPC support was detected; apply the pending migrations to local Supabase, then rerun. No seed records were written.");
    }
  } finally {
    await sql.end();
  }
}

async function ensureUser(admin, user, password, role, { disableLogin = false, preserveExistingPassword = false } = {}) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let existing = listed.users.find((candidate) => candidate.email?.toLowerCase() === user.email.toLowerCase());
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: password ?? randomBytes(48).toString("base64url"), email_confirm: true, user_metadata: { full_name: user.name, role, synthetic: true } });
    if (error || !data.user) throw error ?? new Error(`Could not create ${role} user.`);
    existing = data.user;
  } else {
    const updates = { email_confirm: true, user_metadata: { full_name: user.name, role, synthetic: true } };
    if (password && !preserveExistingPassword) updates.password = password;
    if (disableLogin) {
      updates.password = randomBytes(48).toString("base64url");
      updates.ban_duration = "876000h";
    }
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, updates);
    if (error || !data.user) throw error ?? new Error(`Could not update ${role} user.`);
    existing = data.user;
  }
  return existing.id;
}

async function seedDatabase(databaseUrl, ids, serviceDate) {
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
    for (const patient of ids.queuePatients) {
      await tx`INSERT INTO public.profiles (id, full_name, role) VALUES (${patient.id}, ${patient.name}, 'patient') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`;
      await tx`INSERT INTO public.patients (id, phone, date_of_birth) VALUES (${patient.id}, ${patient.phone}, ${patient.dateOfBirth}) ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth`;
    }

    const existingDoctor = await tx`SELECT clinic_id FROM public.doctors WHERE id = ${ids.doctor} FOR UPDATE`;
    let clinicId = existingDoctor[0]?.clinic_id;
    if (!clinicId) {
      const [clinic] = await tx`INSERT INTO public.clinics (name, timezone) VALUES ('Cedar Pilot Clinic', ${pilotTimezone}) RETURNING id`;
      clinicId = clinic.id;
    }
    await tx`INSERT INTO public.doctors (id, clinic_id, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency, phone) VALUES (${ids.doctor}, ${clinicId}, 'Cardiology', 'Cedar Pilot Clinic', 12, 'Synthetic doctor account for local assistant testing.', ${pilotTimezone}, 100000, 'INR', '+919900000001') ON CONFLICT (id) DO UPDATE SET specialty = EXCLUDED.specialty, clinic_name = EXCLUDED.clinic_name, experience_years = EXCLUDED.experience_years, biography = EXCLUDED.biography, timezone = EXCLUDED.timezone, consultation_fee_minor = EXCLUDED.consultation_fee_minor, clinic_id = COALESCE(doctors.clinic_id, EXCLUDED.clinic_id)`;
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

    const priorDemoSession = await tx`
      SELECT av.id, av.start_time::text AS start_time
      FROM public.appointments a
      JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.availability_sessions av ON av.id = s.availability_session_id
      WHERE a.patient_id = ANY(${ids.queuePatients.map((patient) => patient.id)})
        AND a.doctor_id = ${ids.doctor}
        AND a.reason = 'Synthetic reception queue demo appointment'
        AND (s.slot_start_at AT TIME ZONE ${pilotTimezone})::date = ${serviceDate}
      ORDER BY av.start_time
      LIMIT 1
    `;
    let demoSessionId = priorDemoSession[0]?.id;
    let demoStartMinute;
    if (demoSessionId) {
      demoStartMinute = timeMinutes(priorDemoSession[0].start_time);
    } else {
      const sessions = await tx`
        SELECT kind::text AS kind, status::text AS status, session_date::text AS session_date,
          recurrence_start_date::text AS recurrence_start_date, recurrence_end_date::text AS recurrence_end_date,
          day_of_week, start_time::text AS start_time, end_time::text AS end_time,
          monthly_days, monthly_range_end_day
        FROM public.availability_sessions
        WHERE doctor_id = ${ids.doctor}
      `;
      demoStartMinute = findDemoQueueStartMinute(sessions, serviceDate, pilotTimezone);
      if (demoStartMinute === null) {
        throw new Error("No 2.5-hour availability gap was found for today. No queue demo appointments were written.");
      }
      const startTime = `${String(Math.floor(demoStartMinute / 60)).padStart(2, "0")}:${String(demoStartMinute % 60).padStart(2, "0")}`;
      const endMinute = demoStartMinute + 150;
      const endTime = `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
      const [demoSession] = await tx`
        INSERT INTO public.availability_sessions (
          doctor_id, kind, scheduling_type, session_date, start_time, end_time,
          timezone, interval_minutes, capacity, status, session_start_at, session_end_at
        ) VALUES (
          ${ids.doctor}, 'custom', 'wave', ${serviceDate}, ${startTime}::time, ${endTime}::time,
          ${pilotTimezone}, 30, 1, 'active',
          ${dateAt(serviceDate, Math.floor(demoStartMinute / 60), demoStartMinute % 60)},
          ${dateAt(serviceDate, Math.floor(endMinute / 60), endMinute % 60)}
        ) RETURNING id
      `;
      demoSessionId = demoSession.id;
    }

    const demoSlots = [];
    for (let index = 0; index < ids.queuePatients.length; index += 1) {
      const startMinute = demoStartMinute + index * 30;
      const slotId = await ensureSlot(
        demoSessionId,
        dateAt(serviceDate, Math.floor(startMinute / 60), startMinute % 60),
        dateAt(serviceDate, Math.floor((startMinute + 30) / 60), (startMinute + 30) % 60),
      );
      demoSlots.push(slotId);
    }

    const [insertedQueueSession] = await tx`
      INSERT INTO public.queue_sessions (clinic_id, doctor_id, service_date, timezone)
      VALUES (${clinicId}, ${ids.doctor}, ${serviceDate}, ${pilotTimezone})
      ON CONFLICT (doctor_id, service_date) DO NOTHING
      RETURNING id
    `;
    const existingQueueSession = insertedQueueSession ?? (await tx`
      SELECT id FROM public.queue_sessions WHERE doctor_id = ${ids.doctor} AND service_date = ${serviceDate} FOR UPDATE
    `)[0];
    await tx`
      UPDATE public.queue_sessions
      SET last_token = GREATEST(last_token, COALESCE((SELECT max(token_number) FROM public.queue_entries WHERE session_id = ${existingQueueSession.id}), 0))
      WHERE id = ${existingQueueSession.id}
    `;

    for (let index = 0; index < ids.queuePatients.length; index += 1) {
      const patient = ids.queuePatients[index];
      const slotId = demoSlots[index];
      const [existingAppointment] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient.id} AND doctor_id = ${ids.doctor} AND slot_id = ${slotId} LIMIT 1
      `;
      let appointmentId = existingAppointment?.id;
      if (appointmentId) {
        await tx`UPDATE public.appointments SET status = 'confirmed', completed_at = NULL, reason = 'Synthetic reception queue demo appointment', updated_at = now() WHERE id = ${appointmentId}`;
      } else {
        const [appointment] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot)
          VALUES (${patient.id}, ${ids.doctor}, ${slotId}, 'confirmed', 'Synthetic reception queue demo appointment', 'Local demo record; no payment collected')
          RETURNING id
        `;
        appointmentId = appointment.id;
      }

      const [existingEntry] = await tx`SELECT id FROM public.queue_entries WHERE appointment_id = ${appointmentId} FOR UPDATE`;
      let entryId = existingEntry?.id;
      const startMinute = demoStartMinute + index * 30;
      const priorityAt = dateAt(serviceDate, Math.floor(startMinute / 60), startMinute % 60);
      if (!entryId) {
        const [nextToken] = await tx`UPDATE public.queue_sessions SET last_token = last_token + 1 WHERE id = ${existingQueueSession.id} RETURNING last_token`;
        const [createdEntry] = await tx`
          INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at)
          VALUES (${existingQueueSession.id}, ${appointmentId}, ${nextToken.last_token}, 'waiting', ${priorityAt}, NULL)
          RETURNING id
        `;
        entryId = createdEntry.id;
        await tx`INSERT INTO public.queue_events (appointment_id, entry_id, actor_id, action) VALUES (${appointmentId}, ${entryId}, NULL, 'token_issued')`;
      }

      await tx`
        UPDATE public.queue_entries
        SET session_id = ${existingQueueSession.id}, status = 'waiting', checked_in_at = NULL,
          called_at = NULL, consultation_started_at = NULL, completed_at = NULL,
          priority_at = ${priorityAt}, updated_at = now()
        WHERE id = ${entryId}
      `;
      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status)
        VALUES (${appointmentId}, 'eligible')
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'eligible', checked_in_at = NULL,
          checked_in_by = NULL, no_show_at = NULL, no_show_by = NULL, updated_at = now()
      `;
      await tx`UPDATE public.appointment_slots SET allocated_count = 1 WHERE id = ${slotId}`;
    }

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
  await assertQueueSchema(config.databaseUrl);
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ids = {
    doctor: await ensureUser(admin, pilotUsers.doctor, config.password, "doctor", { preserveExistingPassword: true }),
    patient: await ensureUser(admin, pilotUsers.patient, config.password, "patient", { preserveExistingPassword: true }),
    queuePatients: [],
  };
  for (const patient of queueDemoPatients) {
    ids.queuePatients.push({
      ...patient,
      id: await ensureUser(admin, patient, undefined, "patient", { disableLogin: true }),
    });
  }
  await seedDatabase(config.databaseUrl, ids, config.queueDemoDate);
  return { ids, users: pilotUsers, queuePatients: queueDemoPatients, queueDemoDate: config.queueDemoDate };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seedAssistantPilot()
    .then(({ users, queuePatients, queueDemoDate }) => {
      console.log("Local assistant pilot seed complete.");
      console.log(`Queue demo service date: ${queueDemoDate} (${pilotTimezone}).`);
      console.log(`Doctor login: ${users.doctor.email}`);
      console.log(`Patient login: ${users.patient.email}`);
      console.log("Synthetic queue patients (profiles only; sign-in disabled):");
      for (const patient of queuePatients) console.log(`- ${patient.name}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
