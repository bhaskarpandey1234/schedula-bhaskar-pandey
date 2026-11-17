import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const productionProjectRef = "eqckoayhycvbkxqudocw";
export const productionConfirmation = `seed-admin:production:${productionProjectRef}`;
const adminFullName = "Schedula Production Admin";

/** @param {Record<string, string | undefined>} [env] */
export function validateAdminSeedEnvironment(env = process.env) {
  if ((env.CI && !["false", "0"].includes(env.CI.toLowerCase())) || env.VERCEL) {
    throw new Error("Admin seeding must be run manually from a trusted server environment.");
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const password = env.ADMIN_SEED_PASSWORD;
  if (!url || !serviceRoleKey || !password) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_SEED_PASSWORD in the runtime environment.");
  }
  if (password.length < 12) throw new Error("ADMIN_SEED_PASSWORD must be at least 12 characters.");

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${productionProjectRef}.supabase.co`) {
    throw new Error("Refusing to seed: NEXT_PUBLIC_SUPABASE_URL does not match the approved production project.");
  }
  if (env.ADMIN_SEED_PROJECT_REF !== productionProjectRef || env.ADMIN_SEED_CONFIRMATION !== productionConfirmation) {
    throw new Error("Refusing to seed: set the exact project ref and production confirmation value.");
  }
  return { url: parsedUrl.origin, serviceRoleKey, password };
}

export async function createSeedAdmin({ admin, password, suffix = randomBytes(8).toString("hex") }) {
  const email = `schedula-admin-${suffix}@mailinator.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "patient", full_name: adminFullName, synthetic: true },
  });
  if (error || !data.user) {
    throw new Error("Admin account creation failed. No existing account was changed.");
  }

  const userId = data.user.id;
  try {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role: "admin", full_name: adminFullName })
      .eq("id", userId)
      .eq("role", "patient")
      .select("id")
      .single();
    if (profileError) throw new Error("Admin profile promotion failed.");

    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { schedula_role: "admin" },
      user_metadata: { role: "admin", full_name: adminFullName, synthetic: true },
    });
    if (metadataError) throw new Error("Admin Auth metadata update failed.");
  } catch (error) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      throw new Error(`Admin setup failed and cleanup also failed. Inspect the new account ${email} in Supabase Auth before retrying.`);
    }
    throw error instanceof Error ? error : new Error("Admin account setup failed.");
  }

  return { email };
}

/** @param {Record<string, string | undefined>} [env] */
export async function seedAdmin(env = process.env) {
  const config = validateAdminSeedEnvironment(env);
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createSeedAdmin({ admin, password: config.password });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  seedAdmin()
    .then(({ email }) => {
      process.stdout.write(`Production admin created. Login email: ${email}\n`);
      process.stdout.write("Use the password supplied through ADMIN_SEED_PASSWORD. It was not printed or stored.\n");
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Admin seed failed."}\n`);
      process.exitCode = 1;
    });
}
