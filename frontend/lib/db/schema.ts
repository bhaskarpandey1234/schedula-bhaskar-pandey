import {
  date,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
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
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  ...auditColumns(),
});

export const doctors = pgTable("doctors", {
  id: uuid("id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  specialty: text("specialty"),
  clinicName: text("clinic_name"),
  experienceYears: integer("experience_years"),
  biography: text("biography"),
  timezone: text("timezone"),
  ...auditColumns(),
});
