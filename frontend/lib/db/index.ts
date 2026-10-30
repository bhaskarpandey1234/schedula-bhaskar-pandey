import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

type SchedulaDb = ReturnType<typeof drizzle<typeof schema>>;

const globalDb = globalThis as typeof globalThis & {
  __schedulaDb?: SchedulaDb;
};

export function createDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  }

  // Vercel may keep a module warm across requests. Reusing one small pool per
  // instance prevents every action/route invocation from opening a new
  // Supavisor session and exhausting the project's session-mode limit.
  if (!globalDb.__schedulaDb) {
    const client = postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalDb.__schedulaDb = drizzle(client, { schema });
  }

  return globalDb.__schedulaDb;
}
