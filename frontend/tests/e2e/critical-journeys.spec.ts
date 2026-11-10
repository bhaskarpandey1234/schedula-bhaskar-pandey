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
  const email = `phase8${Date.now()}${Math.floor(Math.random() * 100000)}@example.com`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await choose(page, "I am joining as", role === "patient" ? "Patient" : "Doctor");
  await page.getByLabel("Email").fill(email);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  const invalidEmailMessage = page.getByText("Invalid email address", { exact: true });
  if (await invalidEmailMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Email").press("Tab");
    await page.getByRole("button", { name: "Create account" }).click();
  }

  await expect.poll(async () => {
    const { data, error } = await localAdmin().auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.some((candidate) => candidate.email === email);
  }, { timeout: 30000 }).toBe(true);

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

async function signInAs(page: Page, user: TestUser) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/doctor$/, { timeout: 15000 });
}

test.afterEach(async () => { await deleteTestUsers(createdUsers.splice(0)); });

test("patient can register, onboard, book, and cancel", async ({ page }) => {
  const doctor = await seedDoctorWithAvailability("browser-doctor");
  await signUpAndConfirm(page, "patient", "browser-patient");
  await page.getByLabel("Full name").fill("Phase 8 browser patient");
  await page.getByLabel("Phone number").fill("9876543210");
  await page.getByLabel("Date of birth").fill("1990-04-20");
  await page.getByRole("button", { name: "Continue to find doctors" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await page.goto("/doctors");
  await page.getByLabel("Doctor or Keyword").fill("Dr. Phase 8");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /View more information/i }).first().click();
  await expect(page.getByRole("heading", { name: "Dr. Phase 8" }).first()).toBeVisible();
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
  await page.getByRole("link", { name: "Schedule", exact: true }).first().click();
  await expect(page).toHaveURL(/\/doctor\/schedule$/);
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("10:00");
  await choose(page, "Slot interval", "60 minutes");
  await page.getByLabel("Patients per slot").fill("1");
  await page.getByRole("button", { name: "Create availability" }).click();
  await expect(page.getByText("Availability created.", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit window" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Current window");
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeVisible();
  await page.getByRole("button", { name: "Shrink availability" }).click();
  await expect(page.getByLabel("New availability start time")).toBeVisible();
  await expect(page.getByLabel("New availability end time")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("columnheader", { name: "Booked Patients" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Schedule type" })).toBeVisible();
  await choose(page, "Schedule type", "Wave");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/scheduleType=wave/);
  await page.getByRole("link", { name: "Appointments", exact: true }).first().click();
  await expect(page).toHaveURL(/\/doctor\/appointments/);
  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Dashboard navigation" })).toBeVisible();
});

test("doctor can guide an affected Wave booking to another available date and slot", async ({ page }) => {
  const doctor = await createTestUser("doctor", "elastic-browser-doctor");
  const patient = await createTestUser("patient", "elastic-browser-patient");
  const secondPatient = await createTestUser("patient", "elastic-browser-patient-two");
  createdUsers.push(doctor, patient, secondPatient);
  await onboardTestUser(doctor);
  await onboardTestUser(patient);
  await onboardTestUser(secondPatient);
  const sourceDate = futureDate();
  const firstAlternativeDate = futureDate(22);
  const secondAlternativeDate = futureDate(23);
  const unavailableDate = futureDate(24);
  const source = await doctor.client.rpc("create_availability_session_with_slots", { p_session_date: sourceDate, p_start_time: "09:00", p_end_time: "11:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 2 });
  const firstAlternative = await doctor.client.rpc("create_availability_session_with_slots", { p_session_date: firstAlternativeDate, p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1 });
  const secondAlternative = await doctor.client.rpc("create_availability_session_with_slots", { p_session_date: secondAlternativeDate, p_start_time: "09:00", p_end_time: "10:00", p_timezone: "Asia/Kolkata", p_interval_minutes: 60, p_capacity: 1 });
  if (source.error || firstAlternative.error || secondAlternative.error || !source.data) throw new Error(source.error?.message ?? firstAlternative.error?.message ?? secondAlternative.error?.message ?? "Could not create elastic scheduling test availability.");
  const { data: sourceSlots, error: sourceSlotsError } = await doctor.client.from("appointment_slots").select("id, slot_start_at").eq("availability_session_id", source.data).order("slot_start_at");
  if (sourceSlotsError || !sourceSlots?.[1]) throw new Error(sourceSlotsError?.message ?? "Could not find the affected Wave slot.");
  const { error: bookingError } = await patient.client.rpc("book_appointment", { p_slot_id: sourceSlots[1].id, p_reason: "Elastic browser test" });
  if (bookingError) throw new Error(bookingError.message);
  const { error: secondBookingError } = await secondPatient.client.rpc("book_appointment", { p_slot_id: sourceSlots[1].id, p_reason: "Elastic browser test two" });
  if (secondBookingError) throw new Error(secondBookingError.message);

  await signInAs(page, doctor);
  await page.goto(`/doctor/schedule?date=${sourceDate}`);
  await page.getByRole("button", { name: "Edit window" }).first().click();
  await page.getByRole("button", { name: "Shrink availability" }).click();
  await page.getByLabel("New availability end time").fill("10:00");
  await page.getByRole("button", { name: "Preview change" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Choose an outcome for each booking")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Move booking/ })).toHaveCount(2);
  await expect(dialog.getByText("Choose a new date")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Move booking/ }).first()).toContainText("Recommended");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: /Move booking/ }).first().click();
  await expect(dialog.getByText("Choose a new date")).toHaveCount(1);
  await expect(dialog.getByText("Choose a new date")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: unavailableDate, exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: secondAlternativeDate, exact: true }).click();
  await expect(dialog.getByText(`Available slots on ${new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "Asia/Kolkata" }).format(new Date(`${secondAlternativeDate}T12:00:00.000Z`))}`)).toBeVisible();
  await dialog.getByRole("button", { name: /9:00 AM.*10:00 AM.*place available/ }).first().click();
  await expect(dialog.getByText("Choose a new date")).toHaveCount(0);
  await expect(dialog.getByText(/Moved to:/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel + full refund" }).last().click();
  await expect(dialog.getByText("Cancel + full refund selected")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm change" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Change selection" }).first().click();
  await dialog.getByRole("button", { name: /Move booking/ }).first().click();
  await expect(dialog.getByText("Choose a new date")).toHaveCount(1);
});
