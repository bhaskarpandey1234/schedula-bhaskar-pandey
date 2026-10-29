import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The local Supabase harness opts in after starting and migrating the
    // disposable database. Keep integration tests out of the fast unit run.
    exclude: process.env.SCHEDULA_LOCAL_TESTS === "true" ? [] : ["tests/integration/**"],
  },
});
