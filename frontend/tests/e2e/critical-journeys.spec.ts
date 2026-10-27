import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTestUser, deleteTestUsers, futureDate, localAdmin, onboardTestUser, type TestUser } from "../support/local-supabase";

const password = "SchedulaPhase8Test!";
const createdUsers: TestUser[] = [];

async function signUpAndConfirm(page: Page, role: TestUser["role"], label: string) {
  const email = `phase8-browser-${label}-${crypto.randomUUID()}@example.test`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Full name").fill(`Phase 8 ${label}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("I am joining as").selectOption(role);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-up-success$/);

  const { data, error } = await localAdmin().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error("The browser sign-up did not create a local user.");
  const { error: confirmationError } = await localAdmin().auth.admin.updateUserById(user.id, { email_confirm: true });
  if (confirmationError) throw new Error(confirmationError.message);

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);
  const testUser: TestUser = { id: user.id, email, role, client };
  createdUsers.push(testUser);
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15000 });
  return testUser;
}

async function seedDoctorWithAvailability(label: string) {
  const doctor = await createTestUser("doctor", label);
  createdUsers.push(doctor);
  await onboardTestUser(doctor);
  const { error } = await doctor.client.rpc("create_availability_session_with_slots", {
    p_session_date: futureDate(), p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 2,
  });
  if (error) throw new Error(error.message);
  return doctor;
}

test.afterEach(async () => {
  await deleteTestUsers(createdUsers.splice(0));
});

test("patient can register, onboard, search, book, and cancel", async ({ page }) => {
  const doctor = await seedDoctorWithAvailability("browser-doctor");
  await signUpAndConfirm(page, "patient", "browser-patient");
  await page.getByLabel("Phone number").fill("+14155552671");
  await page.getByLabel("Date of birth").fill("1990-04-20");
  await page.getByRole("button", { name: "Continue to patient portal" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await page.getByRole("link", { name: /Find a doctor/i }).click();
  await page.getByLabel("Search by doctor name").fill("Phase 8 browser-doctor");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /View profile/i }).click();
  await expect(page.getByRole("heading", { name: "Phase 8 browser-doctor" })).toBeVisible();
  await page.getByRole("link", { name: /9:00\s*AM.*left/i }).click();
  await page.getByLabel(/Visit reason/).fill("Phase 8 patient booking");
  await page.getByRole("button", { name: "Review appointment" }).click();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByRole("heading", { name: "Your appointment is booked." })).toBeVisible();
  await page.goto("/patient/appointments");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("link", { name: "Cancelled" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  expect(doctor.id).toBeTruthy();
});

test("doctor can register, create availability, and see a cancellation", async ({ page }) => {
  const doctor = await signUpAndConfirm(page, "doctor", "browser-schedule-doctor");
  await page.getByLabel("Specialty").fill("Cardiology");
  await page.getByLabel("Clinic name").fill("Browser Clinic");
  await page.getByLabel("Years of experience").fill("8");
  await page.getByLabel("Biography").fill("A test-only profile that validates the complete doctor scheduling experience.");
  await page.getByLabel("Timezone").fill("Asia/Kolkata");
  await page.getByRole("button", { name: "Continue to doctor portal" }).click();
  await expect(page).toHaveURL(/\/doctor$/);
  await page.getByLabel("Date", { exact: true }).fill(futureDate());
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("10:00");
  await page.getByLabel("Patients per slot").fill("1");
  await page.getByRole("button", { name: "Create availability" }).click();
  await expect(page.getByRole("heading", { name: "Manage your practice and availability." })).toBeVisible();

  const patient = await createTestUser("patient", "browser-schedule-patient");
  createdUsers.push(patient);
  await onboardTestUser(patient);
  const { data: slots, error: slotsError } = await doctor.client.from("appointment_slots").select("id").eq("doctor_id", doctor.id).limit(1);
  if (slotsError || !slots?.[0]) throw new Error(slotsError?.message ?? "Missing generated slot");
  const { data: appointmentId, error: bookingError } = await patient.client.rpc("book_appointment", { p_slot_id: slots[0].id, p_reason: "Doctor schedule test" });
  if (bookingError) throw new Error(bookingError.message);
  await patient.client.rpc("cancel_patient_appointment", { p_appointment_id: appointmentId! });
  await page.goto(`/doctor?date=${futureDate()}`);
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
});
