import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { createTestUser, deleteTestUsers, localAdmin, onboardTestUser, type TestUser } from "../support/local-supabase";

const users: TestUser[] = [];
const privilegedIds: string[] = [];
const password = "SchedulaPhase8Test!";
test.setTimeout(60_000);

async function makePerson(role: TestUser["role"], label: string) {
  const user = await createTestUser(role, label);
  users.push(user);
  await onboardTestUser(user);
  return user;
}

async function makeAdmin() {
  const email = `phase8-queue-browser-admin-${crypto.randomUUID()}@example.test`;
  const { data, error } = await localAdmin().auth.admin.inviteUserByEmail(email, {
    data: { role: "patient", full_name: "Queue Administrator" },
  });
  expect(error).toBeNull();
  privilegedIds.push(data.user!.id);
  const promoted = await localAdmin().from("profiles").update({ role: "admin" }).eq("id", data.user!.id).eq("role", "patient");
  expect(promoted.error).toBeNull();
  const updated = await localAdmin().auth.admin.updateUserById(data.user!.id, {
    password, email_confirm: true, user_metadata: { role: "admin", full_name: "Queue Administrator" },
  });
  expect(updated.error).toBeNull();
  return { id: data.user!.id, email, role: "admin" as const };
}

async function makeStaffForDoctor(doctor: TestUser, label: string) {
  const email = `phase8-${label}-${crypto.randomUUID()}@example.test`;
  const admin = localAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: "patient", full_name: "Queue Receptionist" },
  });
  expect(error).toBeNull();
  privilegedIds.push(data.user!.id);
  expect((await admin.from("profiles").update({ role: "staff" }).eq("id", data.user!.id).eq("role", "patient")).error).toBeNull();
  expect((await admin.auth.admin.updateUserById(data.user!.id, {
    password, email_confirm: true, user_metadata: { role: "staff", full_name: "Queue Receptionist" },
  })).error).toBeNull();
  const { data: doctorRecord, error: doctorError } = await admin.from("doctors").select("clinic_id").eq("id", doctor.id).single();
  expect(doctorError).toBeNull();
  expect((await admin.from("staff_clinic_memberships").insert({ staff_id: data.user!.id, clinic_id: doctorRecord!.clinic_id })).error).toBeNull();
  return { id: data.user!.id, email, role: "staff" as const };
}

function dateInKolkata(offsetDays = 0) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function makeAppointment(
  doctor: TestUser,
  patient: TestUser,
  options: { date?: string; startTime?: string; capacity?: number } = {},
) {
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("Local Supabase required");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });
  const day = options.date ?? dateInKolkata();
  const startTime = options.startTime ?? "00:00";
  const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
  const endMinutes = startMinutes + 30;
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const capacity = options.capacity ?? 1;
  const start = `${day}T${startTime}:00+05:30`;
  const end = `${day}T${endTime}:00+05:30`;
  try {
    return await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
      const [session] = await tx`INSERT INTO public.availability_sessions(doctor_id,kind,scheduling_type,session_date,start_time,end_time,timezone,interval_minutes,capacity,status,session_start_at,session_end_at)
        VALUES (${doctor.id},'custom','wave',${day},${startTime},${endTime},'Asia/Kolkata',30,${capacity},'active',${start},${end}) RETURNING id`;
      const [slot] = await tx`INSERT INTO public.appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity,allocated_count)
        VALUES (${session.id},${doctor.id},${start},${end},${capacity},1) RETURNING id`;
      const [visit] = await tx`INSERT INTO public.appointments(patient_id,doctor_id,slot_id,status)
        VALUES (${patient.id},${doctor.id},${slot.id},'confirmed') RETURNING id`;
      return visit.id as string;
    });
  } finally { await db.end(); }
}

async function noShowEligibility(appointmentId: string) {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    const [row] = await db`
      SELECT LEAST(s.slot_end_at, s.slot_start_at + interval '15 minutes') AS eligible_at
      FROM public.appointments a
      JOIN public.appointment_slots s ON s.id = a.slot_id
      WHERE a.id = ${appointmentId}`;
    if (!(row?.eligible_at instanceof Date)) throw new Error("Could not load no-show eligibility time.");
    return row.eligible_at;
  } finally { await db.end(); }
}

async function signIn(page: Page, user: { email: string; role: "patient" | "doctor" | "staff" | "admin" }) {
  await page.goto("/auth/login");
  await page.waitForFunction(() => Boolean((document.querySelector('input[name="email"]') as HTMLInputElement & { _valueTracker?: unknown } | null)?._valueTracker));
  await page.getByLabel("Email").fill(user.email);
  await expect(page.getByLabel("Email")).toHaveValue(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (await page.getByText("Invalid email address", { exact: true }).first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Email").press("Tab");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).toHaveURL(new RegExp(`/${user.role}$`), { timeout: 15_000 });
}

async function selectCustomOption(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

test.afterEach(async () => {
  await deleteTestUsers(users.splice(0));
  for (const id of privilegedIds.splice(0)) expect((await localAdmin().auth.admin.deleteUser(id)).error).toBeNull();
});

test("reception staff manage the queue while doctor and patient portals stay read-only", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const doctor = await makePerson("doctor", "queue-browser-doctor");
  const patient = await makePerson("patient", "queue-browser-patient");
  const staff = await makeStaffForDoctor(doctor, "queue-browser-staff");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, staff);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Patient queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Schedula Receptionist Portal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a doctor and date to load the queue" })).toBeVisible();
  await expect(page.getByText("+14155552671")).toHaveCount(0);
  await selectCustomOption(page, "Doctor", "Dr. Phase 8");
  await page.getByRole("button", { name: "Show queue" }).click();
  const row = page.locator("article").filter({ hasText: "T001" });
  await expect(row).toContainText("Not arrived");
  await expect(row).not.toContainText("Patient ID:");
  await expect(row).toContainText("+14155552671");
  for (const action of ["Check-in", "Unavailable", "Call", "Skip", "Complete"]) {
    await expect(row.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  await expect(row.getByRole("button", { name: "Return", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Reverse unavailable", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Call again", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Call", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Skip", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Complete", exact: true })).toBeDisabled();
  await page.locator("#queue-slot").click();
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Show queue" }).click();
  await expect(row.getByRole("button", { name: "Check-in", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Check-in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("existing token");
  await dialog.getByRole("button", { name: "Keep current state" }).click();
  await expect(dialog).not.toBeVisible();
  await row.getByRole("button", { name: "Check-in", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm check-in" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Checked in", { timeout: 15_000 });
  await expect(row.getByRole("button", { name: "Check-in", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Call", exact: true })).toBeEnabled();
  await expect(row.getByRole("button", { name: "Skip", exact: true })).toBeEnabled();

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await signIn(patientPage, patient);
  await expect(patientPage.getByRole("region", { name: "My check-in and queue status" })).toContainText("Token T001");

  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();
  await signIn(doctorPage, doctor);
  await doctorPage.goto("/doctor/queue");
  await expect(doctorPage.getByRole("heading", { name: "Your patient queue" })).toBeVisible();
  await expect(doctorPage.getByLabel("Date", { exact: true })).toHaveValue(dateInKolkata());
  await expect(doctorPage.getByLabel("Time slot")).not.toHaveText("No slots for this date");
  const doctorQueue = doctorPage.getByRole("region", { name: "Queue overview" });
  await expect(doctorQueue).toContainText("Current token");
  await expect(doctorQueue).toContainText("Next token");
  await expect(doctorQueue).toContainText("Waiting");
  await expect(doctorQueue).toContainText("Completed");
  await expect(doctorQueue).toContainText("Remaining");
  await expect(doctorPage.getByText("Phase 8 patient")).toHaveCount(0);
  await expect(doctorPage.getByRole("button", { name: "Check-in", exact: true })).toHaveCount(0);
  await expect(doctorPage.getByText("T001")).toBeVisible();

  await row.getByRole("button", { name: "Skip", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm skip" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Skipped");
  await expect(row.getByRole("button", { name: "Return", exact: true })).toBeEnabled();
  await row.getByRole("button", { name: "Return", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm return" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Checked in");
  await expect(row.getByRole("button", { name: "Return", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Call", exact: true })).toBeEnabled();
  await row.getByRole("button", { name: "Call", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm call" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("In consultation");
  await expect(row.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Complete", exact: true })).toBeEnabled();
  await row.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Confirm complete" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("completed", { timeout: 30_000 });
  await expect(row).toContainText("Completed");
  await expect(row.getByRole("button", { name: "Check-in", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Complete", exact: true })).toBeDisabled();
  const { data: completedAppointment } = await localAdmin().from("appointments").select("status").eq("id", appointmentId).single();
  expect(completedAppointment?.status).toBe("completed");
  await patientPage.getByRole("button", { name: "Refresh status" }).click();
  await expect(patientPage.getByRole("region", { name: "My check-in and queue status" })).toContainText("completed", { timeout: 30_000 });
  await doctorContext.close();
  await patientContext.close();
});

test("doctor can filter the queue by service date and slot", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-filter-doctor");
  const todayPatient = await makePerson("patient", "queue-filter-today-patient");
  const tomorrowPatient = await makePerson("patient", "queue-filter-tomorrow-patient");
  const todayAppointmentId = await makeAppointment(doctor, todayPatient);
  const tomorrow = dateInKolkata(1);
  const tomorrowAppointmentId = await makeAppointment(doctor, tomorrowPatient, { date: tomorrow, startTime: "09:00", capacity: 2 });
  const appointments = await localAdmin().from("appointments").select("id, slot_id").in("id", [todayAppointmentId, tomorrowAppointmentId]);
  expect(appointments.error).toBeNull();
  const todaySlotId = appointments.data?.find((item) => item.id === todayAppointmentId)?.slot_id;
  const tomorrowSlotId = appointments.data?.find((item) => item.id === tomorrowAppointmentId)?.slot_id;
  expect(todaySlotId).toBeTruthy();
  expect(tomorrowSlotId).toBeTruthy();
  await signIn(page, doctor);
  await page.goto("/doctor/queue");
  const date = page.getByLabel("Date", { exact: true });
  const slot = page.getByLabel("Time slot");
  await expect(date).toHaveValue(dateInKolkata());
  await expect(slot).not.toHaveText("No slots for this date");

  const documentTime = await page.evaluate(() => performance.timeOrigin);
  await date.fill(tomorrow);
  await expect(date).toHaveValue(tomorrow);
  await expect(slot).not.toHaveText("No slots for this date");
  await expect(page.getByRole("region", { name: "Queue overview" })).toContainText(
    "Choose a time slot and select Show queue to load its queue.",
  );
  await expect(page.getByRole("button", { name: "Show queue" })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
  await page.getByRole("button", { name: "Show queue" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe(tomorrow);
  await expect.poll(() => new URL(page.url()).searchParams.get("slot")).toBe(tomorrowSlotId);
  await expect.poll(() => new URL(page.url()).searchParams.get("showQueue")).toBe("1");
  await expect(page.getByRole("region", { name: "Queue overview" })).toContainText("1 / 1");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
});

test("reception check-in is disabled outside the appointment service date", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-future-checkin-doctor");
  const patient = await makePerson("patient", "queue-future-checkin-patient");
  const staff = await makeStaffForDoctor(doctor, "queue-future-checkin-staff");
  const tomorrow = dateInKolkata(1);
  await makeAppointment(doctor, patient, { date: tomorrow, startTime: "09:00" });

  await signIn(page, staff);
  await page.goto("/staff");
  await selectCustomOption(page, "Doctor", "Dr. Phase 8");
  await page.getByLabel("Service date").fill(tomorrow);
  await page.getByRole("button", { name: "Show queue" }).click();

  const row = page.locator("article").filter({ hasText: "T001" });
  const checkIn = row.getByRole("button", { name: "Check-in", exact: true });
  await expect(checkIn).toBeDisabled();
  await expect(checkIn).toHaveAccessibleDescription("Check-in is available only on the appointment date.");
});

test("patient appointment card shows its confirmed queue token", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-token-card-doctor");
  const patient = await makePerson("patient", "queue-token-card-patient");
  await makeAppointment(doctor, patient, { date: dateInKolkata(1), startTime: "09:00" });

  await signIn(page, patient);
  await page.goto("/patient/appointments");
  await expect(page.getByText("Queue token", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Queue token T001")).toBeVisible();
});

test("reception staff can mark a missed patient unavailable", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-no-show-browser-doctor");
  const patient = await makePerson("patient", "queue-no-show-browser-patient");
  const staff = await makeStaffForDoctor(doctor, "queue-no-show-staff");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, staff);
  await page.goto("/staff");
  await selectCustomOption(page, "Doctor", "Dr. Phase 8");
  await page.getByRole("button", { name: "Show queue" }).click();
  const row = page.locator("article").filter({ hasText: "T001" });
  await expect(row.getByRole("button", { name: "Reverse unavailable", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Unavailable", exact: true })).toBeEnabled();
  await row.getByRole("button", { name: "Unavailable", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirm unavailable" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("button", { name: "Unavailable", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Check-in", exact: true })).toBeDisabled();
  const { data: visit } = await localAdmin().from("appointments").select("status").eq("id", appointmentId).single();
  expect(visit?.status).toBe("confirmed");
});

test("unavailable shows the exact local eligibility time until grace expires", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-grace-doctor");
  const patient = await makePerson("patient", "queue-grace-patient");
  const staff = await makeStaffForDoctor(doctor, "queue-grace-staff");
  const appointmentId = await makeAppointment(doctor, patient);
  const eligibleAt = await noShowEligibility(appointmentId);
  await signIn(page, staff);
  await page.clock.install({ time: new Date(eligibleAt.getTime() - 60_000) });
  await page.goto("/staff");
  await selectCustomOption(page, "Doctor", "Dr. Phase 8");
  await page.getByRole("button", { name: "Show queue" }).click();
  const row = page.locator("article").filter({ hasText: "T001" });
  const unavailable = row.getByRole("button", { name: "Unavailable", exact: true });
  const eligibleTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(eligibleAt);
  const hint = `Unavailable after ${eligibleTime}`;
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveAccessibleDescription(hint);
  if (!test.info().project.name.includes("mobile")) {
    await unavailable.locator("..").focus();
    await expect(page.getByRole("tooltip")).toHaveText(hint);
  }
  await page.clock.fastForward(2 * 60_000);
  await expect(unavailable).toBeEnabled();
});

test("stale no-show action gives a recoverable error", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-stale-doctor");
  const patient = await makePerson("patient", "queue-stale-patient");
  const staff = await makeStaffForDoctor(doctor, "queue-stale-staff");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, staff);
  await page.goto("/staff");
  await selectCustomOption(page, "Doctor", "Dr. Phase 8");
  await page.getByRole("button", { name: "Show queue" }).click();
  await page.getByRole("button", { name: "Unavailable", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("grace period");
  expect((await localAdmin().from("queue_entries").update({ checked_in_at: new Date().toISOString() }).eq("appointment_id", appointmentId)).error).toBeNull();
  await dialog.getByRole("button", { name: "Confirm unavailable" }).click();
  await expect(dialog.getByRole("alert")).toContainText("refresh", { ignoreCase: true });
  await dialog.getByRole("button", { name: "Refresh current state" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("T001").first()).toBeVisible();
});

test("admin invites clinic staff who can check in the clinic's patient", async ({ page, browser }) => {
  const admin = await makeAdmin();
  const doctor = await makePerson("doctor", "queue-admin-browser-doctor");
  const patient = await makePerson("patient", "queue-admin-browser-patient");
  const clinicName = `Queue admin clinic ${crypto.randomUUID()}`;
  const { data: doctorRecord, error: doctorError } = await localAdmin().from("doctors").select("clinic_id").eq("id", doctor.id).single();
  expect(doctorError).toBeNull();
  expect((await localAdmin().from("clinics").update({ name: clinicName }).eq("id", doctorRecord!.clinic_id)).error).toBeNull();
  await makeAppointment(doctor, patient);
  const staffEmail = `phase8-queue-browser-staff-${crypto.randomUUID()}@example.test`;
  await signIn(page, admin);
  await expect(page.getByRole("heading", { name: "Clinic administration" })).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Staff full name" }).fill("Queue Receptionist");
  await selectCustomOption(page, "Clinic", `${clinicName} · Asia/Kolkata`);
  await dialog.getByRole("textbox", { name: "Staff email" }).fill(staffEmail);
  await expect(dialog).toContainText("all doctors in the selected clinic");
  await dialog.getByRole("button", { name: "Confirm invite staff" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff" }).locator("..")).toContainText("Queue Receptionist");

  const { data: invited, error: listError } = await localAdmin().auth.admin.listUsers({ perPage: 1000 });
  expect(listError).toBeNull();
  const staffUser = invited.users.find((user) => user.email === staffEmail);
  expect(staffUser).toBeTruthy();
  privilegedIds.push(staffUser!.id);
  expect((await localAdmin().auth.admin.updateUserById(staffUser!.id, { password, email_confirm: true })).error).toBeNull();
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, { email: staffEmail, role: "staff" });
  await selectCustomOption(staffPage, "Doctor", "Dr. Phase 8");
  await staffPage.getByRole("button", { name: "Show queue" }).click();
  await expect(staffPage.getByRole("button", { name: "Check-in", exact: true })).toBeVisible();
  await staffPage.getByRole("button", { name: "Check-in", exact: true }).click();
  await staffPage.getByRole("dialog").getByRole("button", { name: "Confirm check-in" }).click();
  await expect(staffPage.getByText("T001").first()).toBeVisible();
  await staffContext.close();
});
