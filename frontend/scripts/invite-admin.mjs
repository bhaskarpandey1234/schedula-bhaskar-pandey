import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const email = process.argv[2]?.trim().toLowerCase();
const fullName = process.argv.slice(3).join(" ").trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2) {
  process.stderr.write("Usage: pnpm --filter frontend invite:admin <email> <full name>\n");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  process.stderr.write("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.\n");
  process.exit(1);
}

const service = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
  data: { role: "patient", full_name: fullName },
  redirectTo: `${site}/auth/confirm?next=/auth/update-password`,
});
if (error || !data.user) {
  process.stderr.write("Admin invitation failed. Check Auth configuration and whether the account already exists.\n");
  process.exit(1);
}
const promoted = await service.from("profiles").update({ role: "admin" })
  .eq("id", data.user.id).eq("role", "patient").select("id").single();
if (promoted.error) {
  process.stderr.write("Invitation sent, but profile promotion failed. Repair this account before using it.\n");
  process.exit(1);
}
const metadata = await service.auth.admin.updateUserById(data.user.id, {
  user_metadata: { role: "admin", full_name: fullName },
});
if (metadata.error) {
  process.stderr.write("Admin profile created, but Auth metadata update failed. Repair this account before using it.\n");
  process.exit(1);
}
process.stdout.write("Admin invitation sent. The invited user can set a password and sign in.\n");
