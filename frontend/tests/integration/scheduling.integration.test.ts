import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUsers, futureDate, onboardTestUser, publicClient, type TestUser } from "../support/local-supabase";

const users: TestUser[] = [];

async function user(role: TestUser["role"], label: string) {
  const testUser = await createTestUser(role, label);
  users.push(testUser);
  await onboardTestUser(testUser);
  return testUser;
}

async function createSlot(doctor: TestUser, capacity = 1) {
  const { data, error } = await doctor.client.rpc("create_availability_session_with_slots", {
    p_session_date: futureDate(),
    p_start_time: "09:00",
    p_end_time: "10:00",
    p_timezone: "Asia/Kolkata",
    p_interval_minutes: 60,
    p_capacity: capacity,
  });
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  const { data: slots, error: slotsError } = await doctor.client.from("appointment_slots").select("id, allocated_count, slot_start_at").eq("availability_session_id", data!).order("slot_start_at");
  expect(slotsError).toBeNull();
  expect(slots).toHaveLength(1);
  return slots![0];
}

function futureWeekday(weekday: number, minimumDays = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minimumDays);
  while (((date.getUTCDay() + 6) % 7) + 1 !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

afterEach(async () => {
  await deleteTestUsers(users.splice(0));
});

describe("local Supabase scheduling RPCs", () => {
  it("exposes completed doctors through anonymous-safe discovery fields only", async () => {
    const doctor = await user("doctor", "public-discovery");
    const { data, error } = await publicClient().rpc("public_doctor_detail", { p_doctor_id: doctor.id });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(["biography", "clinic_name", "doctor_id", "experience_years", "full_name", "specialty", "timezone"]);
  });

  it("rejects an overlapping availability session for the same doctor", async () => {
    const doctor = await user("doctor", "overlap-doctor");
    await createSlot(doctor);
    const { error } = await doctor.client.rpc("create_availability_session_with_slots", {
      p_session_date: futureDate(),
      p_start_time: "09:30",
      p_end_time: "10:30",
      p_timezone: "Asia/Kolkata",
      p_interval_minutes: 30,
      p_capacity: 1,
    });
    expect(error?.message).toContain("overlaps");
  });

  it("materializes weekly consulting days across the rolling booking window", async () => {
    const doctor = await user("doctor", "weekly-doctor");
    const weekday = 1;
    const { data: ruleIds, error } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [weekday], p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
    });
    expect(error).toBeNull();
    expect(ruleIds).toHaveLength(1);
    const { data: slots } = await doctor.client.from("appointment_slots").select("slot_start_at").eq("availability_session_id", ruleIds![0]);
    expect(slots?.length).toBeGreaterThan(2);
  });

  it("lets a custom session replace an unbooked recurring date", async () => {
    const doctor = await user("doctor", "override-doctor");
    const date = futureWeekday(2);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [2], p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
    });
    expect(weeklyError).toBeNull();
    const { error: customError } = await doctor.client.rpc("create_custom_availability_with_slots", {
      p_session_date: date, p_start_time: "14:00", p_end_time: "15:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
    });
    expect(customError).toBeNull();
    const { data: sessions } = await doctor.client.from("availability_sessions").select("id, kind").eq("doctor_id", doctor.id).in("id", [rules![0]]);
    expect(sessions?.[0]?.kind).toBe("weekly");
    const { data: customSessions } = await doctor.client.from("availability_sessions").select("id, kind").eq("doctor_id", doctor.id).eq("session_date", date);
    const { data: customSlots } = await doctor.client.from("appointment_slots").select("slot_start_at, status, availability_session_id").in("availability_session_id", customSessions!.map((session) => session.id));
    expect(customSlots).toHaveLength(1);
    expect(customSessions?.[0]?.kind).toBe("custom");
  });

  it("protects booked recurring slots from a custom replacement", async () => {
    const doctor = await user("doctor", "booked-override-doctor");
    const patient = await user("patient", "booked-override-patient");
    const date = futureWeekday(3);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [3], p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
    });
    expect(weeklyError).toBeNull();
    const { data: weeklySlots } = await doctor.client.from("appointment_slots").select("id, slot_start_at").eq("availability_session_id", rules![0]);
    const slot = weeklySlots?.find((candidate) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(candidate.slot_start_at)) === date);
    expect(slot).toBeTruthy();
    const { error: bookingError } = await patient.client.rpc("book_appointment", { p_slot_id: slot!.id, p_reason: "Override protection" });
    expect(bookingError).toBeNull();
    const { error: overrideError } = await doctor.client.rpc("create_custom_availability_with_slots", { p_session_date: date, p_start_time: "14:00", p_end_time: "15:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1 });
    expect(overrideError?.message).toContain("existing bookings");
  });

  it("allows exactly one concurrent booking at final capacity", async () => {
    const doctor = await user("doctor", "capacity-doctor");
    const firstPatient = await user("patient", "capacity-patient-a");
    const secondPatient = await user("patient", "capacity-patient-b");
    const slot = await createSlot(doctor, 1);
    const results = await Promise.all([
      firstPatient.client.rpc("book_appointment", { p_slot_id: slot.id, p_reason: "First test booking" }),
      secondPatient.client.rpc("book_appointment", { p_slot_id: slot.id, p_reason: "Second test booking" }),
    ]);
    expect(results.filter((result) => result.data).map((result) => result.data)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
    const { data: currentSlot, error } = await doctor.client.from("appointment_slots").select("allocated_count, capacity").eq("id", slot.id).single();
    expect(error).toBeNull();
    expect(currentSlot).toMatchObject({ allocated_count: 1, capacity: 1 });
  });

  it("cancels once, releases one allocation, and persists cancellation notifications", async () => {
    const doctor = await user("doctor", "cancel-doctor");
    const patient = await user("patient", "cancel-patient");
    const slot = await createSlot(doctor, 2);
    const { data: appointmentId, error: bookingError } = await patient.client.rpc("book_appointment", { p_slot_id: slot.id, p_reason: "Cancellation test" });
    expect(bookingError).toBeNull();
    const { error: cancellationError } = await patient.client.rpc("cancel_patient_appointment", { p_appointment_id: appointmentId! });
    expect(cancellationError).toBeNull();
    const { data: currentSlot } = await doctor.client.from("appointment_slots").select("allocated_count").eq("id", slot.id).single();
    expect(currentSlot?.allocated_count).toBe(0);
    const { data: appointment } = await patient.client.from("appointments").select("status").eq("id", appointmentId!).single();
    expect(appointment?.status).toBe("cancelled");
    const { data: notifications } = await patient.client.from("notifications").select("type").eq("appointment_id", appointmentId!);
    expect(notifications?.filter((notification) => notification.type === "appointment_cancelled")).toHaveLength(1);
    const { data: doctorNotifications } = await doctor.client.from("notifications").select("type").eq("appointment_id", appointmentId!);
    expect(doctorNotifications?.filter((notification) => notification.type === "appointment_booked")).toHaveLength(1);
    const { error: repeatCancellation } = await patient.client.rpc("cancel_patient_appointment", { p_appointment_id: appointmentId! });
    expect(repeatCancellation?.message).toContain("already cancelled");
  });

  it("confirms paid bookings and deduplicates replayed payment notifications", async () => {
    const doctor = await user("doctor", "paid-notification-doctor");
    const patient = await user("patient", "paid-notification-patient");
    const slot = await createSlot(doctor);
    const { error: preferenceError } = await patient.client.from("notification_preferences").upsert({ recipient_id: patient.id, operational_email: true, operational_sms: true, reminder_email: true, reminder_sms: true });
    expect(preferenceError).toBeNull();
    const { data: reservationRows, error: reserveError } = await patient.client.rpc("reserve_paid_appointment", {
      p_slot_id: slot.id,
      p_reason: "Paid notification test",
      p_idempotency_key: `integration-paid-${Date.now()}`,
      p_expected_amount_minor: 100000,
    });
    expect(reserveError).toBeNull();
    const reservation = reservationRows?.[0];
    expect(reservation).toBeTruthy();
    const { error: attachError } = await patient.client.rpc("attach_payment_order", { p_payment_id: reservation.payment_id, p_order_id: `order-integration-${Date.now()}` });
    expect(attachError).toBeNull();
    const { error: completeError } = await patient.client.rpc("complete_payment", { p_payment_id: reservation.payment_id, p_provider_payment_id: `pay-integration-${Date.now()}`, p_outcome: "captured" });
    expect(completeError).toBeNull();
    const { error: replayError } = await patient.client.rpc("complete_payment", { p_payment_id: reservation.payment_id, p_provider_payment_id: "pay-integration-replay", p_outcome: "captured" });
    expect(replayError).toBeNull();
    const { data: appointment } = await patient.client.from("appointments").select("status").eq("id", reservation.appointment_id).single();
    expect(appointment?.status).toBe("confirmed");
    const { data: patientNotifications } = await patient.client.from("notifications").select("type").eq("appointment_id", reservation.appointment_id);
    expect(patientNotifications?.filter((notification) => notification.type === "payment_confirmed")).toHaveLength(1);
    const { data: doctorNotifications } = await doctor.client.from("notifications").select("type").eq("appointment_id", reservation.appointment_id);
    expect(doctorNotifications?.filter((notification) => notification.type === "appointment_booked")).toHaveLength(1);
    const { data: deliveries } = await patient.client.from("notification_deliveries").select("channel, status").eq("appointment_id", reservation.appointment_id).order("channel");
    expect(deliveries?.map((delivery) => delivery.channel)).toEqual(["email", "sms"]);
    expect(deliveries?.every((delivery) => delivery.status === "pending")).toBe(true);
  });

  it("creates one payment-failed notification for a failed payment replay", async () => {
    const doctor = await user("doctor", "failed-payment-doctor");
    const patient = await user("patient", "failed-payment-patient");
    const slot = await createSlot(doctor);
    const { data: reservationRows, error: reserveError } = await patient.client.rpc("reserve_paid_appointment", {
      p_slot_id: slot.id,
      p_reason: "Failed notification test",
      p_idempotency_key: `integration-failed-${Date.now()}`,
      p_expected_amount_minor: 100000,
    });
    expect(reserveError).toBeNull();
    const reservation = reservationRows?.[0];
    expect(reservation).toBeTruthy();
    const { error: failedError } = await patient.client.rpc("complete_payment", { p_payment_id: reservation.payment_id, p_provider_payment_id: null, p_outcome: "failed" });
    expect(failedError).toBeNull();
    const { error: replayError } = await patient.client.rpc("complete_payment", { p_payment_id: reservation.payment_id, p_provider_payment_id: null, p_outcome: "failed" });
    expect(replayError).toBeNull();
    const { data: notifications } = await patient.client.from("notifications").select("type").eq("appointment_id", reservation.appointment_id);
    expect(notifications?.filter((notification) => notification.type === "payment_failed")).toHaveLength(1);
  });
});
