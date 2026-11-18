import { describe, expect, it } from "vitest";

const modulePath = "../scripts/assistant-pilot-seed.mjs";

describe("local assistant pilot seed guard", async () => {
  const { findDemoQueueStartMinute, pilotUsers, queueDemoPatients, validateLocalEnvironment } = await import(modulePath);

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

  it("requires the local service-role key but not a login password for queue-only demo patients", () => {
    expect(() => validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
    })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      PILOT_QUEUE_DEMO_DATE: "2026-11-18",
    }).queueDemoDate).toBe("2026-11-18");
  });

  it("accepts a valid local queue demo service date override", () => {
    expect(validateLocalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      PILOT_SEED_PASSWORD: "LocalPilotPassword!123",
      PILOT_QUEUE_DEMO_DATE: "2026-11-18",
    }).queueDemoDate).toBe("2026-11-18");
  });

  it("rejects invalid or past queue demo service dates", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      PILOT_SEED_PASSWORD: "LocalPilotPassword!123",
    };
    expect(() => validateLocalEnvironment({ ...env, PILOT_QUEUE_DEMO_DATE: "2026-02-31" })).toThrow(/valid date/);
    expect(() => validateLocalEnvironment({ ...env, PILOT_QUEUE_DEMO_DATE: "2000-01-01" })).toThrow(/today or later/);
  });

  it("uses stable synthetic queue patient identities", () => {
    expect(pilotUsers.doctor.email).toBe("pilot.doctor@schedula.example");
    expect(pilotUsers.patient.email).toBe("pilot.patient@schedula.example");
    expect(queueDemoPatients).toHaveLength(5);
    expect(new Set(queueDemoPatients.map((patient: { email: string }) => patient.email)).size).toBe(5);
    expect(queueDemoPatients.every((patient: { email: string }) => patient.email.endsWith("@schedula.example"))).toBe(true);
  });

  it("finds a five-slot demo block that does not overlap today's sessions", () => {
    const serviceDate = "2026-11-17";
    const minute = findDemoQueueStartMinute([
      { kind: "custom", status: "active", session_date: serviceDate, start_time: "09:00:00", end_time: "11:00:00" },
      { kind: "weekly", status: "active", recurrence_start_date: "2026-11-01", recurrence_end_date: "2026-12-31", day_of_week: 2, start_time: "13:00:00", end_time: "14:00:00" },
    ], serviceDate, "Asia/Kolkata", new Date("2026-11-17T02:00:00.000Z"));
    expect(minute).toBe(840);
  });

  it("returns no demo block when active availability occupies the whole day", () => {
    expect(findDemoQueueStartMinute([
      { kind: "custom", status: "active", session_date: "2026-11-17", start_time: "00:00:00", end_time: "24:00:00" },
    ], "2026-11-17", "Asia/Kolkata", new Date("2026-11-17T02:00:00.000Z"))).toBeNull();
  });
});
