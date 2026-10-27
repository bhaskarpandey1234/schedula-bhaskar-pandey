import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUsers, futureDate, onboardTestUser, type TestUser } from "../support/local-supabase";

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

afterEach(async () => {
  await deleteTestUsers(users.splice(0));
});

describe("local Supabase scheduling RPCs", () => {
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
    const { error: repeatCancellation } = await patient.client.rpc("cancel_patient_appointment", { p_appointment_id: appointmentId! });
    expect(repeatCancellation?.message).toContain("already cancelled");
  });
});
