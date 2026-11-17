import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.SCHEDULA_TEST_PORT ?? (process.env.SCHEDULA_LOCAL_TESTS === "true" ? "3001" : "3000");

export default defineConfig({
  testDir: "./tests/e2e",
  // The journeys share one disposable Supabase instance; serial workers keep
  // account cleanup and capacity assertions deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm dev --port ${testPort} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: !process.env.CI && process.env.SCHEDULA_LOCAL_TESTS !== "true",
    env: {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${testPort}`,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      SCHEDULA_TEST_DIST_DIR: ".next-e2e",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
