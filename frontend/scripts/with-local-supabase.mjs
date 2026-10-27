import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args, options = {}) {
  const result = spawnSync(pnpm, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    if (options.capture) process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status || 1);
  }
  return result.stdout;
}

function parseStatus(output) {
  const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^['"]|['"]$/g, "")]];
  }));
  return {
    url: values.API_URL,
    databaseUrl: values.DB_URL,
    publishableKey: values.ANON_KEY ?? values.PUBLISHABLE_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
  };
}

function assertLocalUrl(value, name) {
  if (!value) throw new Error(`Local Supabase did not provide ${name}.`);
  const host = new URL(value).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`${name} must point to local Supabase; received ${host}.`);
  }
}

run(["exec", "supabase", "start"]);
const local = parseStatus(run(["exec", "supabase", "status", "-o", "env"], { capture: true }));
try {
  assertLocalUrl(local.url, "API_URL");
  assertLocalUrl(local.databaseUrl, "DB_URL");
  if (!local.publishableKey || !local.serviceRoleKey) throw new Error("Local Supabase did not provide API keys.");
} catch (error) {
  process.stderr.write(`Refusing to run tests: ${error instanceof Error ? error.message : "invalid local Supabase configuration"}\n`);
  process.exit(1);
}

const environment = {
  ...process.env,
  DATABASE_URL: local.databaseUrl,
  NEXT_PUBLIC_SUPABASE_URL: local.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  SCHEDULA_LOCAL_TESTS: "true",
};

run(["--dir", "frontend", "exec", "drizzle-kit", "migrate"], { env: environment });
const command = process.argv.slice(2);
if (!command.length) {
  process.stderr.write("Usage: node scripts/with-local-supabase.mjs <pnpm arguments>\n");
  process.exit(1);
}
run(command, { env: environment });
