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

async function createStream(doctor: TestUser, capacity = 2) {
  const { data, error } = await doctor.client.rpc("create_availability_session_with_slots", {
    p_session_date: futureDate(), p_start_time: "10:00", p_end_time: "12:00", p_timezone: "Asia/Kolkata", p_capacity: capacity, p_scheduling_type: "stream",
  });
  expect(error).toBeNull();
  const { data: slots, error: slotsError } = await doctor.client.from("appointment_slots").select("id, slot_start_at, slot_end_at, capacity").eq("availability_session_id", data!).order("slot_start_at");
  expect(slotsError).toBeNull();
  expect(slots).toHaveLength(1);
  expect(slots?.[0]?.slot_end_at).not.toBe(slots?.[0]?.slot_start_at);
  return slots![0];
}

function futureWeekday(weekday: number, minimumDays = 7) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minimumDays);
  while (((date.getUTCDay() + 6) % 7) + 1 !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function recurrenceEnd(start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

afterEach(async () => {
  await deleteTestUsers(users.splice(0));
});

describe("local Supabase scheduling RPCs", () => {
  it("returns public doctors without an empty-array type error", async () => {
    const doctor = await user("doctor", "public-directory");
    await createSlot(doctor);
    const doctorWithoutSlots = await user("doctor", "public-directory-empty");
    const { data, error } = await publicClient().rpc("public_doctor_directory", { p_search: null, p_specialty: null });
    expect(error).toBeNull();
    expect(data?.some((row: { doctor_id: string }) => row.doctor_id === doctor.id)).toBe(true);
    expect(data?.some((row: { doctor_id: string }) => row.doctor_id === doctorWithoutSlots.id)).toBe(true);

    const { data: filtered, error: filteredError } = await publicClient().rpc("public_doctor_directory", { p_search: "Phase 8", p_specialty: "Cardiology" });
    expect(filteredError).toBeNull();
    expect(filtered?.some((row: { doctor_id: string }) => row.doctor_id === doctor.id)).toBe(true);
  });

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

  it("materializes weekly consulting days through the finite end date", async () => {
    const doctor = await user("doctor", "weekly-doctor");
    const weekday = 1;
    const start = futureWeekday(weekday);
    const { data: ruleIds, error } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [weekday], p_recurrence_start_date: start, p_recurrence_end_date: recurrenceEnd(start), p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
    });
    expect(error).toBeNull();
    expect(ruleIds).toHaveLength(1);
    const { data: slots } = await doctor.client.from("appointment_slots").select("slot_start_at").eq("availability_session_id", ruleIds![0]);
    expect(slots?.length).toBeGreaterThan(2);
  });

  it("materializes a monthly date range for Stream", async () => {
    const doctor = await user("doctor", "monthly-stream-doctor");
    const { data: sessionId, error } = await doctor.client.rpc("create_monthly_availability_with_slots", {
      p_recurrence_start_date: "2099-11-10", p_recurrence_end_date: "2099-12-20", p_monthly_range_end_day: 12,
      p_start_time: "10:00", p_end_time: "12:00", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(error).toBeNull();
    const { data: slots } = await doctor.client.from("appointment_slots").select("slot_start_at, slot_end_at, capacity").eq("availability_session_id", sessionId!).order("slot_start_at");
    expect(slots).toHaveLength(6);
    expect(slots?.every((slot) => slot.capacity === 2 && new Date(slot.slot_end_at).getTime() - new Date(slot.slot_start_at).getTime() === 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("materializes a recurring Stream as one shared window per occurrence", async () => {
    const doctor = await user("doctor", "weekly-stream-doctor");
    const start = futureWeekday(1);
    const { data: ruleIds, error } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [1], p_recurrence_start_date: start, p_recurrence_end_date: recurrenceEnd(start), p_start_time: "10:00", p_end_time: "12:00", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(error).toBeNull();
    const { data: slots } = await doctor.client.from("appointment_slots").select("slot_start_at, slot_end_at").eq("availability_session_id", ruleIds![0]);
    expect(slots?.length).toBeGreaterThan(2);
    expect(slots?.every((slot) => new Date(slot.slot_end_at).getTime() - new Date(slot.slot_start_at).getTime() === 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("enforces Stream capacity across the full window", async () => {
    const doctor = await user("doctor", "stream-capacity-doctor");
    const firstPatient = await user("patient", "stream-capacity-patient-a");
    const secondPatient = await user("patient", "stream-capacity-patient-b");
    const slot = await createStream(doctor, 1);
    const results = await Promise.all([
      firstPatient.client.rpc("book_appointment", { p_slot_id: slot.id, p_reason: "Stream first" }),
      secondPatient.client.rpc("book_appointment", { p_slot_id: slot.id, p_reason: "Stream second" }),
    ]);
    expect(results.filter((result) => result.data)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
  });

  it("lets a custom session replace an unbooked recurring date", async () => {
    const doctor = await user("doctor", "override-doctor");
    const date = futureWeekday(2);
    const recurrenceEndDate = recurrenceEnd(date);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [2], p_recurrence_start_date: date, p_recurrence_end_date: recurrenceEndDate, p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
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

  it("allows Stream elastic expansion over a cancelled recurring slot while preserving a booking", async () => {
    const doctor = await user("doctor", "elastic-stream-doctor");
    const patient = await user("patient", "elastic-stream-patient");
    const date = futureWeekday(4);
    const recurrenceEndDate = recurrenceEnd(date);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [4], p_recurrence_start_date: date, p_recurrence_end_date: recurrenceEndDate,
      p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(weeklyError).toBeNull();
    const { data: customSessionId, error: customError } = await doctor.client.rpc("create_custom_availability_with_slots", {
      p_session_date: date, p_start_time: "09:30", p_end_time: "10:30", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(customError).toBeNull();
    const { data: recurringSlots } = await doctor.client.from("appointment_slots").select("status").eq("availability_session_id", rules![0]);
    expect(recurringSlots?.every((slot) => slot.status === "cancelled")).toBe(true);
    const { data: customSlots } = await doctor.client.from("appointment_slots").select("id, slot_start_at, slot_end_at, allocated_count").eq("availability_session_id", customSessionId!).single();
    expect(customSlots).toBeTruthy();
    const { data: appointmentId, error: bookingError } = await patient.client.rpc("book_appointment", { p_slot_id: customSlots!.id, p_reason: "Elastic Stream regression" });
    expect(bookingError).toBeNull();

    const { data: preview, error: previewError } = await doctor.client.rpc("preview_doctor_occurrence_adjustment", {
      p_session_id: customSessionId, p_occurrence_date: date, p_start_time: "09:00", p_end_time: "10:30",
    });
    expect(previewError).toBeNull();
    expect(preview?.classification).toBe("expansion");
    expect(preview?.appointments).toHaveLength(1);
    expect(preview?.appointments[0]?.appointment_id).toBe(appointmentId);

    const { error: applyError } = await doctor.client.rpc("apply_doctor_occurrence_adjustment", {
      p_session_id: customSessionId, p_occurrence_date: date, p_start_time: "09:00", p_end_time: "10:30",
      p_assignments: [{ appointment_id: appointmentId, source_slot_id: customSlots!.id, target_slot_id: customSlots!.id, action: "moved" }],
    });
    expect(applyError).toBeNull();
    const { data: expandedSlot } = await doctor.client.from("appointment_slots").select("slot_start_at, slot_end_at, allocated_count").eq("id", customSlots!.id).single();
    expect(new Date(expandedSlot!.slot_end_at).getTime() - new Date(expandedSlot!.slot_start_at).getTime()).toBe(90 * 60 * 1000);
    expect(expandedSlot?.allocated_count).toBe(1);
    const { data: appointment } = await doctor.client.from("appointments").select("slot_id, status").eq("id", appointmentId!).single();
    expect(appointment).toEqual({ slot_id: customSlots!.id, status: "confirmed" });
  });

  it("still rejects Stream expansion into an active available overlap", async () => {
    const doctor = await user("doctor", "elastic-stream-overlap-doctor");
    const date = futureDate();
    const { data: sourceId, error: sourceError } = await doctor.client.rpc("create_custom_availability_with_slots", {
      p_session_date: date, p_start_time: "09:30", p_end_time: "10:30", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(sourceError).toBeNull();
    const { data: overlapId, error: overlapError } = await doctor.client.rpc("create_custom_availability_with_slots", {
      p_session_date: date, p_start_time: "09:00", p_end_time: "09:30", p_timezone: "Asia/Kolkata", p_capacity: 2, p_scheduling_type: "stream",
    });
    expect(overlapError).toBeNull();
    const { error: previewError } = await doctor.client.rpc("preview_doctor_occurrence_adjustment", {
      p_session_id: sourceId, p_occurrence_date: date, p_start_time: "09:00", p_end_time: "10:30",
    });
    expect(previewError?.message).toContain("overlaps");
    expect(overlapId).toBeTruthy();
  });

  it("lets the specific-date RPC replace an unbooked recurring date with a different window", async () => {
    const doctor = await user("doctor", "specific-date-override-doctor");
    const date = futureWeekday(1);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [1], p_recurrence_start_date: date, p_recurrence_end_date: recurrenceEnd(date), p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 30, p_capacity: 3,
    });
    expect(weeklyError).toBeNull();
    const { data: overrideIds, error: overrideError } = await doctor.client.rpc("create_specific_date_availability_with_slots", {
      p_session_dates: [date], p_start_time: "09:30", p_end_time: "10:30", p_timezone: "Asia/Kolkata", p_interval_minutes: 30, p_capacity: 3,
    });
    expect(overrideError).toBeNull();
    expect(overrideIds).toHaveLength(1);
    const { data: recurringSlots } = await doctor.client.from("appointment_slots").select("status").eq("availability_session_id", rules![0]);
    expect(recurringSlots?.every((slot) => slot.status === "cancelled")).toBe(true);
    const { data: overrideSlots } = await doctor.client.from("appointment_slots").select("slot_start_at, slot_end_at, capacity").eq("availability_session_id", overrideIds![0]).order("slot_start_at");
    expect(overrideSlots).toHaveLength(2);
    expect(overrideSlots?.every((slot) => slot.capacity === 3)).toBe(true);
  });

  it("protects booked recurring slots from a custom replacement", async () => {
    const doctor = await user("doctor", "booked-override-doctor");
    const patient = await user("patient", "booked-override-patient");
    const date = futureWeekday(3);
    const recurrenceEndDate = recurrenceEnd(date);
    const { data: rules, error: weeklyError } = await doctor.client.rpc("create_weekly_availability_with_slots", {
      p_consulting_days: [3], p_recurrence_start_date: date, p_recurrence_end_date: recurrenceEndDate, p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1,
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
    const unrelatedDoctor = await user("doctor", "unrelated-notification-doctor");
    const patient = await user("patient", "paid-notification-patient");
    const slot = await createSlot(doctor);
    const { error: preferenceError } = await patient.client.from("notification_preferences").upsert({ recipient_id: patient.id, operational_email: true, operational_sms: true, operational_whatsapp: true, reminder_email: true, reminder_sms: true });
    expect(preferenceError).toBeNull();
    const { error: doctorPreferenceError } = await doctor.client.from("notification_preferences").upsert({ recipient_id: doctor.id, operational_whatsapp: true });
    expect(doctorPreferenceError).toBeNull();
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
    expect(patientNotifications?.filter((notification) => notification.type === "appointment_booked")).toHaveLength(1);
    const { data: doctorNotifications } = await doctor.client.from("notifications").select("id, type, read_at").eq("appointment_id", reservation.appointment_id);
    expect(doctorNotifications?.filter((notification) => notification.type === "appointment_booked")).toHaveLength(1);
    const doctorNotification = doctorNotifications?.find((notification) => notification.type === "appointment_booked");
    expect(doctorNotification?.read_at).toBeNull();
    const { data: unrelatedNotifications, error: unrelatedError } = await unrelatedDoctor.client.from("notifications").select("id").eq("appointment_id", reservation.appointment_id);
    expect(unrelatedError).toBeNull();
    expect(unrelatedNotifications).toEqual([]);
    const { data: unauthorizedRead, error: unauthorizedReadError } = await patient.client.rpc("mark_notification_read", { p_notification_id: doctorNotification!.id });
    expect(unauthorizedReadError).toBeNull();
    expect(unauthorizedRead).toBe(false);
    const { data: markedRead, error: markedReadError } = await doctor.client.rpc("mark_notification_read", { p_notification_id: doctorNotification!.id });
    expect(markedReadError).toBeNull();
    expect(markedRead).toBe(true);
    const { data: replayedRead, error: replayedReadError } = await doctor.client.rpc("mark_notification_read", { p_notification_id: doctorNotification!.id });
    expect(replayedReadError).toBeNull();
    expect(replayedRead).toBe(true);
    const { data: refreshedDoctorNotification } = await doctor.client.from("notifications").select("read_at").eq("id", doctorNotification!.id).single();
    expect(refreshedDoctorNotification?.read_at).toBeTruthy();
    const { data: patientMarkedCount, error: patientMarkAllError } = await patient.client.rpc("mark_all_notifications_read");
    expect(patientMarkAllError).toBeNull();
    expect(patientMarkedCount).toBe(1);
    const { data: patientReplayCount } = await patient.client.rpc("mark_all_notifications_read");
    expect(patientReplayCount).toBe(0);
    const { data: deliveries } = await patient.client.from("notification_deliveries").select("channel, status").eq("appointment_id", reservation.appointment_id).order("channel");
    expect(deliveries?.map((delivery) => delivery.channel)).toEqual(["email", "sms", "whatsapp"]);
    expect(deliveries?.every((delivery) => delivery.status === "pending")).toBe(true);
    const { data: doctorDeliveries } = await doctor.client.from("notification_deliveries").select("channel").eq("appointment_id", reservation.appointment_id);
    expect(doctorDeliveries?.map((delivery) => delivery.channel)).toEqual(["whatsapp"]);
    const { data: doctorDetail, error: doctorDetailError } = await doctor.client.rpc("doctor_appointment_detail", { p_appointment_id: reservation.appointment_id });
    expect(doctorDetailError).toBeNull();
    expect(doctorDetail).toHaveLength(1);
    expect(doctorDetail?.[0]).toMatchObject({ appointment_id: reservation.appointment_id, patient_name: expect.any(String), clinic_name: expect.any(String) });
    const { data: unrelatedDetail, error: unrelatedDetailError } = await unrelatedDoctor.client.rpc("doctor_appointment_detail", { p_appointment_id: reservation.appointment_id });
    expect(unrelatedDetailError).toBeNull();
    expect(unrelatedDetail).toEqual([]);
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
