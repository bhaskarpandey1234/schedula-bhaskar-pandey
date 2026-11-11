import { describe, expect, it } from "vitest";

const modulePath = "../scripts/assistant-pilot-seed.mjs";

describe("local assistant pilot seed guard", async () => {
  const { pilotUsers, validateLocalEnvironment } = await import(modulePath);

  it("accepts local Supabase and database URLs", () => {
    expect(validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      PILOT_SEED_PASSWORD: "LocalPilotPassword!123",
    }).supabaseUrl).toBe("http://127.0.0.1:54321");
  });

  it("rejects hosted URLs before any write", () => {
    expect(() => validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      DATABASE_URL: "postgresql://postgres:secret@production.example/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      PILOT_SEED_PASSWORD: "LocalPilotPassword!123",
    })).toThrow(/localhost/);
  });

  it("requires a runtime password and service-role key", () => {
    expect(() => validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
    })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("uses stable synthetic login identities", () => {
    expect(pilotUsers.doctor.email).toBe("pilot.doctor@schedula.example");
    expect(pilotUsers.patient.email).toBe("pilot.patient@schedula.example");
  });
});
