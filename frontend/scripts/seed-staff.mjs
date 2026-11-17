import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

export const productionProjectRef = "eqckoayhycvbkxqudocw";
export const productionConfirmation = `seed-staff:production:${productionProjectRef}`;
const staffFullName = "Schedula Queue Test Staff";

/** @param {Record<string, string | undefined>} [env] */
export function validateStaffSeedEnvironment(env = process.env) {
  if ((env.CI && !["false", "0"].includes(env.CI.toLowerCase())) || env.VERCEL) {
    throw new Error("Staff seeding must be run manually from a trusted server environment.");
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const password = env.STAFF_SEED_PASSWORD;
  if (!url || !serviceRoleKey || !password) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and STAFF_SEED_PASSWORD in the runtime environment.");
  }
  if (password.length < 12) throw new Error("STAFF_SEED_PASSWORD must be at least 12 characters.");

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${productionProjectRef}.supabase.co`) {
    throw new Error("Refusing to seed: NEXT_PUBLIC_SUPABASE_URL does not match the approved production project.");
  }
  if (env.STAFF_SEED_PROJECT_REF !== productionProjectRef || env.STAFF_SEED_CONFIRMATION !== productionConfirmation) {
    throw new Error("Refusing to seed: set the exact project ref and production confirmation value.");
  }

  return { url: parsedUrl.origin, serviceRoleKey, password };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function listSeedClinics(admin) {
  const { data, error } = await admin.from("clinics").select("id, name").order("name").order("id");
  if (error || !data) throw new Error("Could not load clinics from the confirmed Supabase project.");
  if (data.length === 0) throw new Error("No clinics exist yet. Create a clinic before seeding queue staff.");
  return data;
}

/** @param {{admin: import('@supabase/supabase-js').SupabaseClient, password: string, clinicId: string, suffix?: string}} input */
export async function createSeedStaff({ admin, password, clinicId, suffix = randomBytes(8).toString("hex") }) {
  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .select("id, name")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicError || !clinic) throw new Error("The selected clinic no longer exists. Refresh the clinic list and retry.");

  const email = `schedula-staff-${suffix}@mailinator.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // The auth.users trigger permits public roles during initial creation.
    // Promote to staff through the privileged server path below.
    user_metadata: { role: "patient", full_name: staffFullName, synthetic: true },
  });
  if (error || !data.user) {
    const status = Number.isInteger(error?.status) ? `HTTP ${error.status}` : "unknown HTTP status";
    const code = typeof error?.code === "string" && /^[a-z0-9_-]{1,64}$/i.test(error.code)
      ? `, code ${error.code}`
      : "";
    throw new Error(`Supabase Auth rejected staff account creation (${status}${code}). Verify the Supabase secret/service-role key and project Auth settings. No existing account was changed.`);
  }

  const userId = data.user.id;
  try {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .update({ role: "staff", full_name: staffFullName })
      .eq("id", userId)
      .eq("role", "patient")
      .select("id, role")
      .single();
    if (profileError || profile?.role !== "staff") throw new Error("The new account could not be promoted to the staff profile role.");

    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { schedula_role: "staff" },
      user_metadata: { role: "staff", full_name: staffFullName, synthetic: true },
    });
    if (metadataError) throw new Error("The new account's protected staff role could not be set.");

    const { data: verifiedProfile, error: verifyProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();
    if (verifyProfileError || verifiedProfile?.role !== "staff") throw new Error("The new account's staff profile role could not be verified.");

    const { error: membershipError } = await admin
      .from("staff_clinic_memberships")
      .insert({ staff_id: userId, clinic_id: clinic.id });
    if (membershipError) throw new Error("The staff clinic assignment could not be saved.");

    const { data: membership, error: verifyError } = await admin
      .from("staff_clinic_memberships")
      .select("staff_id, clinic_id")
      .eq("staff_id", userId)
      .maybeSingle();
    if (verifyError || membership?.clinic_id !== clinic.id) {
      throw new Error("The staff clinic assignment could not be verified.");
    }
  } catch (error) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      throw new Error("Staff setup failed and automatic cleanup also failed. Inspect the newest synthetic staff account in Supabase Auth before retrying.");
    }
    throw error instanceof Error ? error : new Error("Staff account setup failed.");
  }

  return { email, clinicName: clinic.name };
}

/** @param {Record<string, string | undefined>} [env] */
export async function seedStaff(env = process.env) {
  const config = validateStaffSeedEnvironment(env);
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clinics = await listSeedClinics(admin);
  for (const [index, clinic] of clinics.entries()) {
    stdout.write(`${index + 1}. ${clinic.name} (${clinic.id})\n`);
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question("Choose clinic number: ");
    const choice = Number(answer);
    if (!Number.isInteger(choice) || choice < 1 || choice > clinics.length) {
      throw new Error("Choose a valid clinic number from the list.");
    }
    return createSeedStaff({ admin, password: config.password, clinicId: clinics[choice - 1].id });
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  seedStaff()
    .then(({ email, clinicName }) => {
      process.stdout.write(`Queue test staff created for ${clinicName}. Login email: ${email}\n`);
      process.stdout.write("Use the password supplied through STAFF_SEED_PASSWORD. It was not printed or stored.\n");
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Staff seed failed."}\n`);
      process.exitCode = 1;
    });
}
