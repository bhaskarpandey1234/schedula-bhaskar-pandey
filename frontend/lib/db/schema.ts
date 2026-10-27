import {
  date,
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  time,
  uuid,
} from "drizzle-orm/pg-core";

const auth = pgSchema("auth");

const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
});

export const userRole = pgEnum("user_role", ["patient", "doctor"]);

function auditColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  role: userRole("role").notNull(),
  ...auditColumns(),
});

export const patients = pgTable("patients", {
  id: uuid("id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  ...auditColumns(),
});

export const doctors = pgTable("doctors", {
  id: uuid("id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  specialty: text("specialty").notNull(),
  clinicName: text("clinic_name").notNull(),
  experienceYears: integer("experience_years").notNull(),
  biography: text("biography").notNull(),
  timezone: text("timezone").notNull(),
  ...auditColumns(),
});

export const availabilitySessionStatus = pgEnum("availability_session_status", ["active", "cancelled"]);
export const appointmentSlotStatus = pgEnum("appointment_slot_status", ["available", "cancelled"]);

export const availabilitySessions = pgTable("availability_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  timezone: text("timezone").notNull(),
  intervalMinutes: integer("interval_minutes").notNull().default(30),
  capacity: integer("capacity").notNull().default(3),
  status: availabilitySessionStatus("status").notNull().default("active"),
  sessionStartAt: timestamp("session_start_at", { withTimezone: true }).notNull(),
  sessionEndAt: timestamp("session_end_at", { withTimezone: true }).notNull(),
  ...auditColumns(),
}, (table) => ({ doctorDateIdx: index("availability_sessions_doctor_date_idx").on(table.doctorId, table.sessionDate) }));

export const appointmentSlots = pgTable("appointment_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  availabilitySessionId: uuid("availability_session_id").notNull().references(() => availabilitySessions.id, { onDelete: "cascade" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  slotStartAt: timestamp("slot_start_at", { withTimezone: true }).notNull(),
  slotEndAt: timestamp("slot_end_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  allocatedCount: integer("allocated_count").notNull().default(0),
  status: appointmentSlotStatus("status").notNull().default("available"),
  ...auditColumns(),
}, (table) => ({ sessionStartIdx: index("appointment_slots_session_start_idx").on(table.availabilitySessionId, table.slotStartAt), doctorStartIdx: index("appointment_slots_doctor_start_idx").on(table.doctorId, table.slotStartAt) }));
