import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The local Supabase harness opts in after starting and migrating the
    // disposable database. Keep integration tests out of the fast unit run.
    exclude: process.env.SCHEDULA_LOCAL_TESTS === "true" ? [] : ["tests/integration/**"],
  },
});
