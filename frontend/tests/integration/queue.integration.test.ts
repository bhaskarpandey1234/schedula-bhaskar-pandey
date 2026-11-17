import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { createTestUser, deleteTestUsers, localAdmin, onboardTestUser, type TestUser } from "../support/local-supabase";

const users: TestUser[] = [];
const privilegedIds: string[] = [];

async function privileged(role: "admin" | "staff") {
  const email = `phase8-queue-${role}-${crypto.randomUUID()}@example.test`;
  const password = "SchedulaPhase8Test!";
  const { data, error } = await localAdmin().auth.admin.inviteUserByEmail(email, {
    data: { full_name: `Queue ${role}`, role: "patient" },
  });
  expect(error).toBeNull();
  privilegedIds.push(data.user!.id);
  const promoted = await localAdmin().from("profiles").update({ role }).eq("id", data.user!.id).eq("role", "patient").select("id").single();
  expect(promoted.error).toBeNull();
  const updated = await localAdmin().auth.admin.updateUserById(data.user!.id, { password, email_confirm: true,
    user_metadata: { full_name: `Queue ${role}`, role } });
  expect(updated.error).toBeNull();
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return { id: data.user!.id, client };
}

async function person(role: TestUser["role"], label: string) {
  const result = await createTestUser(role, label);
  users.push(result);
  await onboardTestUser(result);
  return result;
}

async function appointment(doctor: TestUser, patient: TestUser, capacity = 2) {
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("Local database required");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });
  const serviceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const slotStartAt = `${serviceDate}T00:00:00+05:30`;
  const slotEndAt = `${serviceDate}T00:30:00+05:30`;
  try {
    return await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
      const [session] = await tx`INSERT INTO public.availability_sessions(doctor_id,kind,scheduling_type,session_date,start_time,end_time,timezone,interval_minutes,capacity,status,session_start_at,session_end_at)
        VALUES (${doctor.id},'custom','wave',${serviceDate},'00:00','00:30','Asia/Kolkata',30,${capacity},'active',${slotStartAt},${slotEndAt}) RETURNING id`;
      const [slot] = await tx`INSERT INTO public.appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity,allocated_count)
        VALUES (${session.id},${doctor.id},${slotStartAt},${slotEndAt},${capacity},1) RETURNING id`;
      const [visit] = await tx`INSERT INTO public.appointments(patient_id,doctor_id,slot_id,status)
        VALUES (${patient.id},${doctor.id},${slot.id},'confirmed') RETURNING id`;
      return visit.id as string;
    });
  } finally { await db.end(); }
}

afterEach(async () => {
  await deleteTestUsers(users.splice(0));
  for (const id of privilegedIds.splice(0)) await localAdmin().auth.admin.deleteUser(id);
});

describe("patient check-in queue", () => {
  it("exposes clinic assignment directories only to verified admins", async () => {
    const admin = await privileged("admin");
    const staff = await privileged("staff");
    const doctor = await person("doctor", "queue-directory-doctor");
    const patient = await person("patient", "queue-directory-patient");

    const directories = await Promise.all([
      admin.client.rpc("admin_clinic_directory"),
      admin.client.rpc("admin_doctor_assignments"),
      admin.client.rpc("admin_staff_assignments"),
    ]);
    expect(directories.every((result) => result.error === null)).toBe(true);
    expect(directories[0].data?.every((row: { id: string; name: string; timezone: string }) =>
      Object.keys(row).sort().join(",") === "id,name,timezone")).toBe(true);
    expect(directories[1].data?.some((row: { id: string }) => row.id === doctor.id)).toBe(true);
    expect(directories[2].data?.some((row: { id: string }) => row.id === staff.id)).toBe(true);

    for (const client of [staff.client, doctor.client, patient.client]) {
      for (const rpc of ["admin_clinic_directory", "admin_doctor_assignments", "admin_staff_assignments"] as const) {
        expect((await client.rpc(rpc)).error).not.toBeNull();
      }
    }

    const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    expect((await anonymous.rpc("admin_clinic_directory")).error).not.toBeNull();
  });

  it("issues one token under retries and concurrent check-in and keeps positions current", async () => {
    const doctor = await person("doctor", "queue-doctor");
    const first = await person("patient", "queue-first");
    const second = await person("patient", "queue-second");
    const firstId = await appointment(doctor, first);
    const admin = localAdmin();
    const { data: firstAppointment } = await admin.from("appointments").select("slot_id").eq("id", firstId).single();
    const { data: secondAppointment, error: secondError } = await admin.from("appointments")
      .insert({ patient_id: second.id, doctor_id: doctor.id, slot_id: firstAppointment!.slot_id, status: "confirmed" }).select("id").single();
    expect(secondError).toBeNull();
    const secondId = secondAppointment!.id as string;
    const attempts = await Promise.all([
      doctor.client.rpc("check_in_appointment", { p_appointment_id: firstId }),
      doctor.client.rpc("check_in_appointment", { p_appointment_id: firstId }),
    ]);
    expect(attempts.every((attempt) => !attempt.error)).toBe(true);
    expect(attempts[0].data?.[0].token_number).toBe(attempts[1].data?.[0].token_number);
    const next = await doctor.client.rpc("check_in_appointment", { p_appointment_id: secondId });
    expect(next.error).toBeNull();
    expect(next.data?.[0].token_number).toBe(2);
    const { data: board, error: boardError } = await doctor.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(boardError).toBeNull();
    const firstRow = board.find((row: { appointment_id: string }) => row.appointment_id === firstId);
    const secondRow = board.find((row: { appointment_id: string }) => row.appointment_id === secondId);
    expect(firstRow?.queue_position).toBe(1);
    expect(secondRow?.queue_position).toBe(2);
    const db = postgres(process.env.DATABASE_URL!, { prepare: false });
    let completionMessage = "";
    try {
      await db.begin(async (tx) => {
        // The fixture's midnight slot predates feature activation. Move only
        // the feature flag inside this transaction to verify new-visit gating.
        await tx`UPDATE public.queue_feature_config SET activated_at = now() - interval '1 day'`;
        await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
        try { await tx`SELECT public.complete_doctor_appointment(${firstId}::uuid)`; }
        catch (error) { completionMessage = error instanceof Error ? error.message : String(error); }
        throw new Error("ROLLBACK_QUEUE_GATE_TEST");
      });
    } catch (error) {
      expect((error as Error).message).toBe("ROLLBACK_QUEUE_GATE_TEST");
    } finally { await db.end(); }
    expect(completionMessage).toContain("Start consultation from the queue");
    expect((await doctor.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "call_next" })).error).not.toBeNull();
    expect((await doctor.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "call_next" })).error).toBeNull();
    const { data: refreshed } = await doctor.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(refreshed.find((row: { appointment_id: string }) => row.appointment_id === secondId)?.queue_position).toBe(1);
    expect((await doctor.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "start" })).error).toBeNull();
    expect((await doctor.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "complete" })).error).toBeNull();
    const { data: after } = await doctor.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(after.find((row: { appointment_id: string }) => row.appointment_id === firstId)?.appointment_status).toBe("completed");
    const { data: patientHistory } = await first.client.rpc("patient_queue_status");
    expect(patientHistory.find((row: { appointment_id: string }) => row.appointment_id === firstId)).toMatchObject({ token_number: 1, queue_status: "completed", queue_position: null });
  });

  it("enforces doctor isolation and operational email preference", async () => {
    const doctor = await person("doctor", "queue-owner");
    const other = await person("doctor", "queue-other");
    const patient = await person("patient", "queue-email");
    const appointmentId = await appointment(doctor, patient);
    expect((await other.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).not.toBeNull();
    const { error: preferenceError } = await patient.client.from("notification_preferences").upsert({ recipient_id: patient.id, operational_email: true });
    expect(preferenceError).toBeNull();
    expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).toBeNull();
    expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).toBeNull();
    const { data: deliveries, error } = await localAdmin().from("notification_deliveries").select("channel, template").eq("appointment_id", appointmentId).eq("template", "checkin_token");
    expect(error).toBeNull();
    expect(deliveries).toEqual([{ channel: "email", template: "checkin_token" }]);
    const { data: tokenNotification } = await localAdmin().from("notifications").select("metadata").eq("appointment_id", appointmentId).eq("type", "checkin_token").single();
    expect(tokenNotification?.metadata).toMatchObject({ token: "T001" });
    const { data: patientStatus } = await patient.client.rpc("patient_queue_status");
    expect(patientStatus?.find((row: { appointment_id: string }) => row.appointment_id === appointmentId)?.token_number).toBe(1);
  });

  it("records no-show without changing booking, reverses it, and removes a cancelled check-in", async () => {
    const doctor = await person("doctor", "queue-no-show-doctor");
    const patient = await person("patient", "queue-no-show-patient");
    const id = await appointment(doctor, patient);
    const absent = await doctor.client.rpc("mark_appointment_no_show", { p_appointment_id: id });
    expect(absent.error).toBeNull();
    expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: id })).error).not.toBeNull();
    const { data: booking } = await localAdmin().from("appointments").select("status").eq("id", id).single();
    expect(booking?.status).toBe("confirmed");
    expect((await doctor.client.rpc("reverse_appointment_no_show", { p_appointment_id: id, p_reason: "Patient arrived late" })).error).toBeNull();
    expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: id })).error).toBeNull();
    const { error: cancelled } = await localAdmin().from("appointments").update({ status: "cancelled" }).eq("id", id);
    expect(cancelled).toBeNull();
    const { data: entry } = await localAdmin().from("queue_entries").select("status, token_number").eq("appointment_id", id).single();
    expect(entry).toMatchObject({ status: "cancelled", token_number: 1 });
  });

  it("gives assigned staff access to all doctors in one clinic and denies other clinics", async () => {
    const admin = await privileged("admin");
    const staff = await privileged("staff");
    const firstDoctor = await person("doctor", "queue-clinic-one");
    const secondDoctor = await person("doctor", "queue-clinic-two");
    const outsideDoctor = await person("doctor", "queue-clinic-outside");
    const patient = await person("patient", "queue-clinic-patient");
    const { data: firstClinic } = await firstDoctor.client.from("doctors").select("clinic_id").eq("id", firstDoctor.id).single();
    expect((await admin.client.rpc("admin_assign_doctor_clinic", { p_doctor_id: secondDoctor.id, p_clinic_id: firstClinic!.clinic_id })).error).toBeNull();
    expect((await admin.client.rpc("admin_assign_staff_clinic", { p_staff_id: staff.id, p_clinic_id: firstClinic!.clinic_id })).error).toBeNull();
    const firstId = await appointment(firstDoctor, patient);
    const secondId = await appointment(secondDoctor, patient);
    const outsideId = await appointment(outsideDoctor, patient);
    expect((await staff.client.rpc("check_in_appointment", { p_appointment_id: firstId })).error).toBeNull();
    expect((await staff.client.rpc("check_in_appointment", { p_appointment_id: secondId })).error).toBeNull();
    expect((await staff.client.rpc("check_in_appointment", { p_appointment_id: outsideId })).error).not.toBeNull();
    const { data: board } = await staff.client.rpc("queue_appointment_board", { p_clinic_id: firstClinic!.clinic_id });
    expect(board.map((row: { appointment_id: string }) => row.appointment_id).sort()).toEqual([firstId, secondId].sort());
  });
});
