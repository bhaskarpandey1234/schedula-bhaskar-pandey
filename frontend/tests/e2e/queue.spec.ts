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

async function makeAppointment(doctor: TestUser, patient: TestUser) {
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("Local Supabase required");
  const db = postgres(process.env.DATABASE_URL, { prepare: false });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = `${day}T00:00:00+05:30`;
  const end = `${day}T00:30:00+05:30`;
  try {
    return await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${doctor.id}, true)`;
      const [session] = await tx`INSERT INTO public.availability_sessions(doctor_id,kind,scheduling_type,session_date,start_time,end_time,timezone,interval_minutes,capacity,status,session_start_at,session_end_at)
        VALUES (${doctor.id},'custom','wave',${day},'00:00','00:30','Asia/Kolkata',30,2,'active',${start},${end}) RETURNING id`;
      const [slot] = await tx`INSERT INTO public.appointment_slots(availability_session_id,doctor_id,slot_start_at,slot_end_at,capacity,allocated_count)
        VALUES (${session.id},${doctor.id},${start},${end},2,1) RETURNING id`;
      const [visit] = await tx`INSERT INTO public.appointments(patient_id,doctor_id,slot_id,status)
        VALUES (${patient.id},${doctor.id},${slot.id},'confirmed') RETURNING id`;
      return visit.id as string;
    });
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

test.afterEach(async () => {
  await deleteTestUsers(users.splice(0));
  for (const id of privilegedIds.splice(0)) expect((await localAdmin().auth.admin.deleteUser(id)).error).toBeNull();
});

test("doctor checks in, calls, starts, and completes while the patient sees the token", async ({ page, browser }) => {
  const doctor = await makePerson("doctor", "queue-browser-doctor");
  const patient = await makePerson("patient", "queue-browser-patient");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, doctor);
  await page.goto("/doctor/queue");
  await expect(page.getByRole("heading", { name: "Patient check-in and queue" })).toBeVisible();
  await page.getByRole("button", { name: "Check in" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("issue a permanent queue token");
  await dialog.getByRole("button", { name: "Keep current state" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Check in" }).click();
  await dialog.getByRole("button", { name: "Confirm check in" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("T001").first()).toBeVisible();

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();
  await signIn(patientPage, patient);
  await expect(patientPage.getByRole("region", { name: "My check-in and queue status" })).toContainText("Token T001");

  await page.getByRole("button", { name: "Call next" }).click();
  await dialog.getByRole("button", { name: "Confirm call next" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Current patient" })).toContainText("T001", { timeout: 15_000 });
  await page.getByRole("button", { name: "Call again" }).click();
  await dialog.getByRole("button", { name: "Confirm call again" }).click();
  await expect(dialog).not.toBeVisible();
  const oldCall = new Date(Date.now() - 6 * 60_000).toISOString();
  expect((await localAdmin().from("queue_entries").update({ called_at: oldCall }).eq("appointment_id", appointmentId)).error).toBeNull();
  await page.getByRole("button", { name: "Refresh queue" }).click();
  await page.getByRole("button", { name: "Skip patient" }).click();
  await dialog.getByRole("button", { name: "Confirm skip patient" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Return to queue" })).toBeVisible();
  await page.getByRole("button", { name: "Return to queue" }).click();
  await dialog.getByRole("button", { name: "Confirm return to queue" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Call next" })).toBeVisible();
  await page.getByRole("button", { name: "Call next" }).click();
  await dialog.getByRole("button", { name: "Confirm call next" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Start consultation" })).toBeVisible();
  await page.getByRole("button", { name: "Start consultation" }).click();
  await dialog.getByRole("button", { name: "Confirm start consultation" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Complete consultation" }).click();
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Confirm complete consultation" }).click();
  await expect(page.getByRole("region", { name: "Current patient" })).toContainText("No patient is currently");
  await patientPage.getByRole("button", { name: "Refresh status" }).click();
  await expect(patientPage.getByRole("region", { name: "My check-in and queue status" })).toContainText("completed");
  await patientContext.close();
});

test("doctor records and reverses a no-show with a required reason", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-no-show-browser-doctor");
  const patient = await makePerson("patient", "queue-no-show-browser-patient");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, doctor);
  await page.goto("/doctor/queue");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirm mark no-show" }).click();
  await expect(page.getByRole("button", { name: "Reverse no-show" })).toBeVisible();
  await page.getByRole("button", { name: "Reverse no-show" }).click();
  await expect(dialog.getByRole("button", { name: "Confirm reverse no-show" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Reason" }).fill("Patient arrived late");
  await dialog.getByRole("button", { name: "Confirm reverse no-show" }).click();
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
  const { data: visit } = await localAdmin().from("appointments").select("status").eq("id", appointmentId).single();
  expect(visit?.status).toBe("confirmed");
});

test("stale no-show action gives a recoverable error", async ({ page }) => {
  const doctor = await makePerson("doctor", "queue-stale-doctor");
  const patient = await makePerson("patient", "queue-stale-patient");
  const appointmentId = await makeAppointment(doctor, patient);
  await signIn(page, doctor);
  await page.goto("/doctor/queue");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("booking and payment will remain unchanged");
  expect((await doctor.client.rpc("check_in_appointment", { p_appointment_id: appointmentId })).error).toBeNull();
  await dialog.getByRole("button", { name: "Confirm mark no-show" }).click();
  await expect(dialog.getByRole("alert")).toContainText("refresh", { ignoreCase: true });
  await dialog.getByRole("button", { name: "Refresh current state" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("T001").first()).toBeVisible();
});

test("admin invites clinic staff who can check in the clinic's patient", async ({ page, browser }) => {
  const admin = await makeAdmin();
  const doctor = await makePerson("doctor", "queue-admin-browser-doctor");
  const patient = await makePerson("patient", "queue-admin-browser-patient");
  await makeAppointment(doctor, patient);
  const { data: doctorRecord } = await doctor.client.from("doctors").select("clinic_id").eq("id", doctor.id).single();
  const staffEmail = `phase8-queue-browser-staff-${crypto.randomUUID()}@example.test`;
  await signIn(page, admin);
  await expect(page.getByRole("heading", { name: "Clinic administration" })).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Staff full name" }).fill("Queue Receptionist");
  await dialog.getByRole("combobox", { name: "Clinic" }).selectOption(doctorRecord!.clinic_id);
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
  await expect(staffPage.getByRole("button", { name: "Check in" })).toBeVisible();
  await staffPage.getByRole("button", { name: "Check in" }).click();
  await staffPage.getByRole("dialog").getByRole("button", { name: "Confirm check in" }).click();
  await expect(staffPage.getByText("T001").first()).toBeVisible();
  await staffContext.close();
});
