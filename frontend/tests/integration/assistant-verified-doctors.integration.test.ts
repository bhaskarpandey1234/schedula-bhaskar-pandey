import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUsers, futureDate, localAdmin, onboardTestUser, type TestUser } from "../support/local-supabase";

const users: TestUser[] = [];

async function doctor(label: string) {
  const testUser = await createTestUser("doctor", label);
  users.push(testUser);
  await onboardTestUser(testUser);
  const { error } = await testUser.client.rpc("create_availability_session_with_slots", {
    p_session_date: futureDate(7),
    p_start_time: "09:00",
    p_end_time: "10:00",
    p_timezone: "Asia/Kolkata",
    p_interval_minutes: 30,
    p_capacity: 1,
  });
  expect(error).toBeNull();
  return testUser;
}

afterEach(async () => {
  await deleteTestUsers(users.splice(0));
});

describe("assistant verified doctor RPCs", () => {
  it("returns confirmed doctors and slots, excluding doctors with unconfirmed email", async () => {
    const patient = await createTestUser("patient", "assistant-doctor-filter-patient");
    users.push(patient);
    await onboardTestUser(patient);
    const confirmedDoctor = await doctor("assistant-confirmed-doctor");
    const unconfirmedDoctor = await doctor("assistant-unconfirmed-doctor");
    const { error: updateError } = await localAdmin().auth.admin.updateUserById(unconfirmedDoctor.id, { email_confirm: false });
    expect(updateError).toBeNull();

    const { data: doctors, error: doctorsError } = await patient.client.rpc("assistant_patient_doctor_directory", {
      p_search: null,
      p_specialty: "Cardiology",
    });
    expect(doctorsError).toBeNull();
    expect(doctors?.some((row: { doctor_id: string }) => row.doctor_id === confirmedDoctor.id)).toBe(true);
    expect(doctors?.some((row: { doctor_id: string }) => row.doctor_id === unconfirmedDoctor.id)).toBe(false);

    const { data: confirmedSlots, error: confirmedSlotsError } = await patient.client.rpc("assistant_patient_doctor_slots", {
      p_doctor_id: confirmedDoctor.id,
    });
    expect(confirmedSlotsError).toBeNull();
    expect(confirmedSlots?.length).toBeGreaterThan(0);
    const { data: unconfirmedSlots, error: unconfirmedSlotsError } = await patient.client.rpc("assistant_patient_doctor_slots", {
      p_doctor_id: unconfirmedDoctor.id,
    });
    expect(unconfirmedSlotsError).toBeNull();
    expect(unconfirmedSlots).toEqual([]);
  });
});
