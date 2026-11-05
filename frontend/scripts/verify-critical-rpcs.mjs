import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const checks = [
  ["public_doctor_directory", () => client.rpc("public_doctor_directory", { p_search: null, p_specialty: null })],
  ["public_doctor_specialties", () => client.rpc("public_doctor_specialties")],
  ["public_doctor_detail", () => client.rpc("public_doctor_detail", { p_doctor_id: "00000000-0000-0000-0000-000000000000" })],
];

for (const [name, run] of checks) {
  const { error } = await run();
  if (error) throw new Error(`${name} preflight failed: ${error.message}`);
  console.log(`${name}: ok`);
}
