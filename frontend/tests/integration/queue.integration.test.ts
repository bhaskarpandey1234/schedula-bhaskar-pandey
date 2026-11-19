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

async function staffForDoctor(doctor: TestUser) {
  const [admin, staff] = await Promise.all([privileged("admin"), privileged("staff")]);
  const { data: doctorRecord, error: doctorError } = await doctor.client.from("doctors").select("clinic_id").eq("id", doctor.id).single();
  expect(doctorError).toBeNull();
  expect((await admin.client.rpc("admin_assign_staff_clinic", {
    p_staff_id: staff.id,
    p_clinic_id: doctorRecord!.clinic_id,
  })).error).toBeNull();
  return staff;
}

async function person(role: TestUser["role"], label: string) {
  const result = await createTestUser(role, label);
  users.push(result);
  await onboardTestUser(result);
  return result;
}

async function appointment(doctor: TestUser, patient: TestUser, capacity = 2, serviceDateOffset = 0) {
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("Local database required");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + serviceDateOffset);
  const serviceDate = date.toISOString().slice(0, 10);
  const slotStartAt = `${serviceDate}T00:00:00+05:30`;
  const slotEndAt = `${serviceDate}T00:30:00+05:30`;
  try {
    return await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
      const [existingSlot] = await tx`SELECT id FROM public.appointment_slots
        WHERE doctor_id = ${doctor.id} AND slot_start_at = ${slotStartAt} AND slot_end_at = ${slotEndAt}
        FOR UPDATE`;
      let slotId = existingSlot?.id as string | undefined;
      if (slotId) {
        await tx`UPDATE public.appointment_slots SET allocated_count = allocated_count + 1 WHERE id = ${slotId}`;
      } else {
        const [session] = await tx`INSERT INTO public.availability_sessions(doctor_id,kind,scheduling_type,session_date,start_time,end_time,timezone,interval_minutes,capacity,status,session_start_at,session_end_at)
          VALUES (${doctor.id},'custom','wave',${serviceDate},'00:00','00:30','Asia/Kolkata',30,${capacity},'active',${slotStartAt},${slotEndAt}) RETURNING id`;
        const [slot] = await tx`INSERT INTO public.appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity,allocated_count)
          VALUES (${session.id},${doctor.id},${slotStartAt},${slotEndAt},${capacity},1) RETURNING id`;
        slotId = slot.id as string;
      }
      const [visit] = await tx`INSERT INTO public.appointments(patient_id,doctor_id,slot_id,status)
        VALUES (${patient.id},${doctor.id},${slotId},'confirmed') RETURNING id`;
      return visit.id as string;
    });
  } finally { await db.end(); }
}

async function pendingAppointment(doctor: TestUser, patient: TestUser) {
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("Local database required");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });
  const serviceDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const slotStartAt = `${serviceDate}T10:00:00+05:30`;
  const slotEndAt = `${serviceDate}T10:30:00+05:30`;
  try {
    return await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
      const [session] = await tx`INSERT INTO public.availability_sessions(doctor_id,kind,scheduling_type,session_date,start_time,end_time,timezone,interval_minutes,capacity,status,session_start_at,session_end_at)
        VALUES (${doctor.id},'custom','wave',${serviceDate},'10:00','10:30','Asia/Kolkata',30,2,'active',${slotStartAt},${slotEndAt}) RETURNING id`;
      const [slot] = await tx`INSERT INTO public.appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity,allocated_count)
        VALUES (${session.id},${doctor.id},${slotStartAt},${slotEndAt},2,1) RETURNING id`;
      const [visit] = await tx`INSERT INTO public.appointments(patient_id,doctor_id,slot_id,status)
        VALUES (${patient.id},${doctor.id},${slot.id},'payment_pending') RETURNING id`;
      const [reservation] = await tx`INSERT INTO public.slot_reservations(appointment_id,patient_id,doctor_id,slot_id,expires_at)
        VALUES (${visit.id},${patient.id},${doctor.id},${slot.id},now() + interval '15 minutes') RETURNING id`;
      const [payment] = await tx`INSERT INTO public.payments(appointment_id,reservation_id,status,amount_minor,currency,idempotency_key)
        VALUES (${visit.id},${reservation.id},'pending',100000,'INR',${crypto.randomUUID()}) RETURNING id`;
      return { appointmentId: visit.id as string, paymentId: payment.id as string };
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
    const operator = await staffForDoctor(doctor);
    const firstId = await appointment(doctor, first);
    const admin = localAdmin();
    const secondId = await appointment(doctor, second);
    const { data: bookedEntries } = await admin.from("queue_entries")
      .select("appointment_id, token_number, checked_in_at")
      .in("appointment_id", [firstId, secondId])
      .order("token_number");
    expect(bookedEntries).toEqual([
      { appointment_id: firstId, token_number: 1, checked_in_at: null },
      { appointment_id: secondId, token_number: 2, checked_in_at: null },
    ]);
    const { data: beforeArrival } = await first.client.rpc("patient_queue_status");
    expect(beforeArrival?.find((row: { appointment_id: string }) => row.appointment_id === firstId)).toMatchObject({
      token_number: 1,
      checked_in_at: null,
      queue_status: "waiting",
      queue_position: null,
    });

    expect(await first.client.rpc("patient_appointment_queue_token", { p_appointment_id: firstId })).toMatchObject({ data: 1, error: null });
    expect((await doctor.client.rpc("queue_doctor_directory")).error).not.toBeNull();
    expect((await operator.client.rpc("queue_doctor_directory")).data?.some((row: { doctor_id: string }) => row.doctor_id === doctor.id)).toBe(true);
    expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: firstId })).error).not.toBeNull();
    const attempts = await Promise.all([
      operator.client.rpc("check_in_appointment", { p_appointment_id: firstId }),
      operator.client.rpc("check_in_appointment", { p_appointment_id: firstId }),
    ]);
    expect(attempts.every((attempt) => !attempt.error)).toBe(true);
    expect(attempts[0].data?.[0].token_number).toBe(attempts[1].data?.[0].token_number);
    const next = await operator.client.rpc("check_in_appointment", { p_appointment_id: secondId });
    expect(next.error).toBeNull();
    expect(next.data?.[0].token_number).toBe(2);
    const { data: board, error: boardError } = await operator.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(boardError).toBeNull();
    const doctorBoard = await doctor.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(doctorBoard.error).toBeNull();
    expect(doctorBoard.data).toEqual([]);
    const { data: summary, error: summaryError } = await doctor.client.rpc("doctor_queue_summary", { p_doctor_id: doctor.id });
    expect(summaryError).toBeNull();
    expect(Object.keys(summary?.[0] ?? {}).sort()).toEqual([
      "completed", "current_token", "next_token", "remaining", "slot_end_at", "slot_start_at", "timezone", "total", "waiting",
    ]);
    expect(summary?.[0]).toMatchObject({
      total: 2,
      remaining: 2,
      waiting: 2,
      completed: 0,
      current_token: null,
      next_token: 1,
    });
    const { data: appointmentSlot, error: appointmentSlotError } = await localAdmin()
      .from("appointments").select("slot_id").eq("id", firstId).single();
    expect(appointmentSlotError).toBeNull();
    const serviceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const selectedSlotSummary = await doctor.client.rpc("doctor_queue_summary_for_slot", {
      p_doctor_id: doctor.id,
      p_service_date: serviceDate,
      p_slot_id: appointmentSlot!.slot_id,
    });
    expect(selectedSlotSummary.error).toBeNull();
    expect(selectedSlotSummary.data?.[0]).toMatchObject({
      total: 2,
      remaining: 2,
      waiting: 2,
      completed: 0,
    });
    const wrongDateSummary = await doctor.client.rpc("doctor_queue_summary_for_slot", {
      p_doctor_id: doctor.id,
      p_service_date: "1900-01-01",
      p_slot_id: appointmentSlot!.slot_id,
    });
    expect(wrongDateSummary.error).toBeNull();
    expect(wrongDateSummary.data).toEqual([]);
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
    expect((await doctor.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "call_next" })).error).not.toBeNull();
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "call_next" })).error).not.toBeNull();
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "skip" })).error).toBeNull();
    const { data: skipped } = await operator.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(skipped.find((row: { appointment_id: string }) => row.appointment_id === secondId)?.queue_status).toBe("skipped");
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "return" })).error).toBeNull();
    expect((await localAdmin().from("queue_entries").update({ status: "called", called_at: new Date().toISOString() }).eq("id", secondRow.entry_id)).error).toBeNull();
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "skip" })).error).toBeNull();
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: secondRow.entry_id, p_action: "return" })).error).toBeNull();
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "call_next" })).error).toBeNull();
    const { data: refreshed } = await operator.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(refreshed.find((row: { appointment_id: string }) => row.appointment_id === secondId)?.queue_position).toBe(1);
    expect(refreshed.find((row: { appointment_id: string }) => row.appointment_id === firstId)?.queue_status).toBe("in_consultation");
    expect((await operator.client.rpc("transition_queue_entry", { p_entry_id: firstRow.entry_id, p_action: "complete" })).error).toBeNull();
    const { data: after } = await operator.client.rpc("queue_appointment_board", { p_doctor_id: doctor.id });
    expect(after.find((row: { appointment_id: string }) => row.appointment_id === firstId)?.appointment_status).toBe("completed");
    const { data: completedSummary, error: completedSummaryError } = await doctor.client.rpc("doctor_queue_summary", { p_doctor_id: doctor.id });
    expect(completedSummaryError).toBeNull();
    expect(completedSummary?.[0]).toMatchObject({
      total: 2,
      remaining: 1,
      waiting: 1,
      completed: 1,
      current_token: null,
      next_token: 2,
    });
    const { data: patientHistory } = await first.client.rpc("patient_queue_status");
    expect(patientHistory.find((row: { appointment_id: string }) => row.appointment_id === firstId)).toMatchObject({ token_number: 1, queue_status: "completed", queue_position: null });
  });

  it("rejects check-in outside the appointment service date", async () => {
    const doctor = await person("doctor", "queue-future-checkin-doctor");
    const patient = await person("patient", "queue-future-checkin-patient");
    const operator = await staffForDoctor(doctor);
    const appointmentId = await appointment(doctor, patient, 2, 1);

    const result = await operator.client.rpc("check_in_appointment", { p_appointment_id: appointmentId });
    expect(result.error?.message).toContain("Check-in opens on the appointment service date");
  });

  it("assigns the first daily token only after payment confirms the appointment", async () => {
    const doctor = await person("doctor", "queue-confirmed-token-doctor");
    const patient = await person("patient", "queue-confirmed-token-patient");
    const pending = await pendingAppointment(doctor, patient);
    const admin = localAdmin();
    expect((await admin.from("queue_entries").select("id").eq("appointment_id", pending.appointmentId)).data).toEqual([]);
    const confirmed = await patient.client.rpc("complete_payment", {
      p_payment_id: pending.paymentId,
      p_provider_payment_id: "provider-payment-confirmed",
      p_outcome: "captured",
    });
    expect(confirmed).toMatchObject({ data: "confirmed", error: null });
    const { data: token, error } = await admin.from("queue_entries")
      .select("token_number, checked_in_at")
      .eq("appointment_id", pending.appointmentId)
      .single();
    expect(error).toBeNull();
    expect(token).toEqual({ token_number: 1, checked_in_at: null });
    expect(await patient.client.rpc("patient_appointment_queue_token", { p_appointment_id: pending.appointmentId }))
      .toMatchObject({ data: 1, error: null });
  });

  it("enforces doctor isolation and operational email preference", async () => {
    const doctor = await person("doctor", "queue-owner");
    const other = await person("doctor", "queue-other");
    const patient = await person("patient", "queue-email");
    const operator = await staffForDoctor(doctor);
    const { error: preferenceError } = await patient.client.from("notification_preferences").upsert({ recipient_id: patient.id, operational_email: true });
    expect(preferenceError).toBeNull();
    const appointmentId = await appointment(doctor, patient);
    expect((await other.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).not.toBeNull();
    expect((await operator.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).toBeNull();
    expect((await operator.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).toBeNull();
    const { data: deliveries, error } = await localAdmin().from("notification_deliveries").select("channel, template").eq("appointment_id", appointmentId).eq("template", "checkin_token");
    expect(error).toBeNull();
    expect(deliveries).toEqual([{ channel: "email", template: "checkin_token" }]);
    const { data: tokenNotification } = await localAdmin().from("notifications").select("metadata").eq("appointment_id", appointmentId).eq("type", "checkin_token").single();
    expect(tokenNotification?.metadata).toMatchObject({ token: "T001" });
    const { data: patientStatus } = await patient.client.rpc("patient_queue_status");
    expect(patientStatus?.find((row: { appointment_id: string }) => row.appointment_id === appointmentId)?.token_number).toBe(1);
    const patientAppointmentLists = await Promise.all([
      patient.client.rpc("patient_appointments", { p_tab: "upcoming" }),
      patient.client.rpc("patient_appointments", { p_tab: "past" }),
    ]);
    const appointmentCard = patientAppointmentLists.flatMap((result) => result.data ?? [])
      .find((row: { appointment_id: string }) => row.appointment_id === appointmentId);
    expect(appointmentCard).toMatchObject({ status: "confirmed", token_number: 1 });
  });

  it("records no-show without changing booking, reverses it, and removes a cancelled check-in", async () => {
    const doctor = await person("doctor", "queue-no-show-doctor");
    const patient = await person("patient", "queue-no-show-patient");
    const operator = await staffForDoctor(doctor);
    const id = await appointment(doctor, patient, 1);
    const { data: appointmentSlot, error: appointmentSlotError } = await localAdmin()
      .from("appointments").select("slot_id").eq("id", id).single();
    expect(appointmentSlotError).toBeNull();
    const { data: slot, error: slotError } = await localAdmin()
      .from("appointment_slots").select("slot_start_at, slot_end_at").eq("id", appointmentSlot!.slot_id).single();
    expect(slotError).toBeNull();
    const { data: queueBoard, error: queueBoardError } = await operator.client.rpc("queue_appointment_board", {
      p_doctor_id: doctor.id,
    });
    expect(queueBoardError).toBeNull();
    const queueRow = queueBoard?.find((row: { appointment_id: string }) => row.appointment_id === id);
    const expectedEligibleAt = Math.min(
      new Date(slot!.slot_end_at).getTime(),
      new Date(slot!.slot_start_at).getTime() + 15 * 60_000,
    );
    expect(new Date(queueRow!.no_show_eligible_at).getTime()).toBe(expectedEligibleAt);
    expect((await doctor.client.rpc("mark_appointment_no_show", { p_appointment_id: id })).error).not.toBeNull();
    const absent = await operator.client.rpc("mark_appointment_no_show", { p_appointment_id: id });
    expect(absent.error).toBeNull();
    expect((await operator.client.rpc("check_in_appointment", { p_appointment_id: id })).error).not.toBeNull();
    const { data: booking } = await localAdmin().from("appointments").select("status").eq("id", id).single();
    expect(booking?.status).toBe("confirmed");
    expect((await operator.client.rpc("reverse_appointment_no_show", { p_appointment_id: id, p_reason: "Patient arrived late" })).error).toBeNull();
    expect((await operator.client.rpc("check_in_appointment", { p_appointment_id: id })).error).toBeNull();
    const { error: cancelled } = await localAdmin().from("appointments").update({ status: "cancelled" }).eq("id", id);
    expect(cancelled).toBeNull();
    const { data: entry } = await localAdmin().from("queue_entries").select("status, token_number").eq("appointment_id", id).single();
    expect(entry).toMatchObject({ status: "cancelled", token_number: 1 });
  });

  it("limits a patient to one active appointment with the same doctor on a service date", async () => {
    const doctor = await person("doctor", "queue-daily-limit-doctor");
    const patient = await person("patient", "queue-daily-limit-patient");
    const firstId = await appointment(doctor, patient);
    await expect(appointment(doctor, patient)).rejects.toThrow("active appointment with this doctor");
    expect((await localAdmin().from("appointments").update({ status: "cancelled" }).eq("id", firstId)).error).toBeNull();
    await expect(appointment(doctor, patient)).resolves.toBeTruthy();
  });

  it("reassigns an unchecked-in token when rescheduled to another doctor on the same local date", async () => {
    const firstDoctor = await person("doctor", "queue-reschedule-first-doctor");
    const nextDoctor = await person("doctor", "queue-reschedule-next-doctor");
    const patient = await person("patient", "queue-reschedule-patient");
    const otherPatient = await person("patient", "queue-reschedule-other-patient");
    const firstAppointment = await appointment(firstDoctor, patient);
    const nextAppointment = await appointment(nextDoctor, otherPatient);
    const admin = localAdmin();
    const { data: nextBooking } = await admin.from("appointments").select("slot_id").eq("id", nextAppointment).single();
    expect(nextBooking?.slot_id).toBeTruthy();
    const { error: rescheduleError } = await admin.from("appointments").update({
      doctor_id: nextDoctor.id,
      slot_id: nextBooking!.slot_id,
    }).eq("id", firstAppointment);
    expect(rescheduleError).toBeNull();
    const { data: reassigned } = await admin.from("queue_entries")
      .select("token_number, session_id")
      .eq("appointment_id", firstAppointment)
      .single();
    expect(reassigned?.token_number).toBe(2);
    const { data: session } = await admin.from("queue_sessions").select("doctor_id").eq("id", reassigned!.session_id).single();
    expect(session?.doctor_id).toBe(nextDoctor.id);
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
