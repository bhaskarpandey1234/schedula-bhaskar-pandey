import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const password = "SchedulaPhase8Test!";

export type TestRole = "patient" | "doctor";
export type TestUser = { id: string; email: string; client: SupabaseClient; role: TestRole };

function localEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SCHEDULA_LOCAL_TESTS !== "true" || !url || !key || !serviceRoleKey) {
    throw new Error("Run integration and E2E tests through the local Supabase harness.");
  }
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") throw new Error("Tests refuse to use a non-local Supabase URL.");
  return { url, key, serviceRoleKey };
}

export function localAdmin() {
  const { url, serviceRoleKey } = localEnvironment();
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function publicClient() {
  const { url, key } = localEnvironment();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function createTestUser(role: TestRole, label: string): Promise<TestUser> {
  const { url, key } = localEnvironment();
  const admin = localAdmin();
  const email = `phase8-${label}-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 8 ${label}`, role },
  });
  if (error || !data.user) throw new Error(`Could not create ${role} test user: ${error?.message ?? "unknown error"}`);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Could not sign in ${role} test user: ${signInError.message}`);
  return { id: data.user.id, email, client, role };
}

export async function onboardTestUser(user: TestUser) {
  if (user.role === "patient") {
    const { error } = await user.client.rpc("complete_patient_onboarding", { p_full_name: `Phase 8 ${user.role}`, p_phone: "+14155552671", p_date_of_birth: "1990-04-20" });
    if (error) throw new Error(`Could not onboard patient: ${error.message}`);
    return;
  }
  const { error } = await user.client.rpc("complete_doctor_onboarding", { p_full_name: "Dr. Phase 8", p_phone: "+14155552671", p_specialty: "Cardiology", p_clinic_name: "Phase 8 Clinic", p_experience_years: 8, p_biography: "A test-only physician profile used to validate appointment scheduling behavior.", p_timezone: "Asia/Kolkata", p_consultation_fee_minor: 100000 });
  if (error) throw new Error(`Could not onboard doctor: ${error.message}`);
}

export async function deleteTestUsers(users: TestUser[]) {
  const admin = localAdmin();
  for (const user of users) {
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (!error) {
        lastError = undefined;
        break;
      }
      lastError = error.message;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    if (lastError) throw new Error(`Could not remove test user: ${lastError}`);
  }
}

export function futureDate(days = 21) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
