import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTestUser, deleteTestUsers, futureDate, localAdmin, onboardTestUser, type TestUser } from "../support/local-supabase";

const password = "SchedulaPhase8Test!";
const createdUsers: TestUser[] = [];

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function signUpAndConfirm(page: Page, role: TestUser["role"], label: string) {
  const email = `phase8-browser-${label}-${crypto.randomUUID()}@example.test`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await choose(page, "I am joining as", role === "patient" ? "Patient" : "Doctor");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("dialog")).toContainText("Account created", { timeout: 15000 });

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
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15000 });
  return testUser;
}

async function seedDoctorWithAvailability(label: string) {
  const doctor = await createTestUser("doctor", label);
  createdUsers.push(doctor);
  await onboardTestUser(doctor);
  const { error } = await doctor.client.rpc("create_availability_session_with_slots", { p_session_date: futureDate(), p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 2 });
  if (error) throw new Error(error.message);
  return doctor;
}

test.afterEach(async () => { await deleteTestUsers(createdUsers.splice(0)); });

test("patient can register, onboard, book, and cancel", async ({ page }) => {
  const doctor = await seedDoctorWithAvailability("browser-doctor");
  await signUpAndConfirm(page, "patient", "browser-patient");
  await page.getByLabel("Full name").fill("Phase 8 browser patient");
  await page.getByLabel("Phone number").fill("9876543210");
  await page.getByLabel("Date of birth").fill("1990-04-20");
  await page.getByRole("button", { name: "Continue to find doctors" }).click();
  await expect(page).toHaveURL(/\/doctors$/);
  await page.getByLabel("Doctor name").fill("Phase 8 browser-doctor");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /View profile/i }).click();
  await expect(page.getByRole("heading", { name: "Phase 8 browser-doctor" })).toBeVisible();
  await page.getByRole("link", { name: /9:00\s*AM.*left/i }).click();
  await page.getByLabel(/Visit reason/).fill("Phase 8 patient booking");
  await page.getByRole("button", { name: "Review appointment" }).click();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByRole("heading", { name: "Your appointment is booked." })).toBeVisible();
  await page.goto("/patient/appointments");
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByRole("dialog")).toContainText("Cancel this appointment?");
  await page.getByRole("button", { name: "Cancel appointment", exact: true }).last().click();
  await page.getByRole("link", { name: "Cancelled" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  expect(doctor.id).toBeTruthy();
});

test("doctor can register and create availability with keyboard-select controls", async ({ page }) => {
  await signUpAndConfirm(page, "doctor", "browser-schedule-doctor");
  await page.getByLabel("Full name").fill("Dr. Phase 8");
  await choose(page, "Specialty", "Cardiology");
  await page.getByLabel("Clinic name").fill("Browser Clinic");
  await choose(page, "Years of experience", "8 years");
  await page.getByLabel("Biography").fill("A test-only profile that validates the complete doctor scheduling experience.");
  await choose(page, "Timezone", "Asia/Kolkata");
  await page.getByRole("button", { name: "Open doctor workspace" }).click();
  await expect(page).toHaveURL(/\/doctor$/);
  await page.locator("#sessionDate").fill(futureDate());
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("10:00");
  await choose(page, "Slot interval", "60 minutes");
  await page.getByLabel("Patients per slot").fill("1");
  await page.getByRole("button", { name: "Create availability" }).click();
  await expect(page.getByText("Availability created")).toBeVisible();
});
