import {
  date,
  index,
  uniqueIndex,
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
  // A name is collected during role onboarding, after the minimal auth signup.
  fullName: text("full_name"),
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
  consultationFeeMinor: integer("consultation_fee_minor"),
  consultationCurrency: text("consultation_currency").notNull().default("INR"),
  ...auditColumns(),
});

export const availabilitySessionStatus = pgEnum("availability_session_status", ["active", "cancelled"]);
export const availabilitySessionKind = pgEnum("availability_session_kind", ["weekly", "custom"]);
export const appointmentSlotStatus = pgEnum("appointment_slot_status", ["available", "cancelled"]);
export const appointmentStatus = pgEnum("appointment_status", ["payment_pending", "confirmed", "cancelled", "expired"]);
export const notificationType = pgEnum("notification_type", ["appointment_booked", "appointment_cancelled", "payment_confirmed", "payment_failed", "refund_pending", "refund_processed", "refund_failed", "appointment_rescheduled", "appointment_reminder"]);
export const reservationStatus = pgEnum("reservation_status", ["active", "converted", "released", "expired"]);
export const reservationPurpose = pgEnum("reservation_purpose", ["booking", "reschedule"]);
export const paymentStatus = pgEnum("payment_status", ["creating", "pending", "captured", "failed", "abandoned", "expired", "captured_unallocated"]);
export const paymentPurpose = pgEnum("payment_purpose", ["booking", "reschedule_adjustment"]);
export const refundStatus = pgEnum("refund_status", ["requested", "pending", "processed", "failed"]);
export const rescheduleStatus = pgEnum("reschedule_status", ["pending", "completed", "expired", "failed"]);
export const notificationChannel = pgEnum("notification_channel", ["email", "sms", "whatsapp"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "processing", "sent", "failed", "cancelled"]);

export const refundPolicies = pgTable("refund_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullHours: integer("full_hours").notNull().default(24),
  partialHours: integer("partial_hours").notNull().default(2),
  partialPercent: integer("partial_percent").notNull().default(50),
  active: integer("active").notNull().default(1),
  ...auditColumns(),
});

export const availabilitySessions = pgTable("availability_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  kind: availabilitySessionKind("kind").notNull().default("custom"),
  sessionDate: date("session_date"),
  dayOfWeek: integer("day_of_week"),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  timezone: text("timezone").notNull(),
  intervalMinutes: integer("interval_minutes").notNull().default(30),
  capacity: integer("capacity").notNull().default(3),
  status: availabilitySessionStatus("status").notNull().default("active"),
  sessionStartAt: timestamp("session_start_at", { withTimezone: true }),
  sessionEndAt: timestamp("session_end_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => ({ doctorDateIdx: index("availability_sessions_doctor_date_idx").on(table.doctorId, table.sessionDate), doctorWeekdayIdx: index("availability_sessions_doctor_weekday_idx").on(table.doctorId, table.dayOfWeek) }));

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
}, (table) => ({ sessionStartIdx: index("appointment_slots_session_start_idx").on(table.availabilitySessionId, table.slotStartAt), doctorStartIdx: index("appointment_slots_doctor_start_idx").on(table.doctorId, table.slotStartAt), sessionStartUnique: uniqueIndex("appointment_slots_session_start_unique").on(table.availabilitySessionId, table.slotStartAt) }));

export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => appointmentSlots.id, { onDelete: "cascade" }),
  status: appointmentStatus("status").notNull().default("confirmed"),
  reason: text("reason"),
  refundPolicySnapshot: text("refund_policy_snapshot"),
  ...auditColumns(),
}, (table) => ({
  patientSlotUnique: uniqueIndex("appointments_patient_slot_unique").on(table.patientId, table.slotId),
  patientIdx: index("appointments_patient_idx").on(table.patientId, table.createdAt),
  doctorIdx: index("appointments_doctor_idx").on(table.doctorId, table.createdAt),
}));

export const slotReservations = pgTable("slot_reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => appointmentSlots.id, { onDelete: "cascade" }),
  purpose: reservationPurpose("purpose").notNull().default("booking"),
  status: reservationStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...auditColumns(),
}, (table) => ({ slotIdx: index("slot_reservations_slot_idx").on(table.slotId, table.status), patientIdx: index("slot_reservations_patient_idx").on(table.patientId, table.status) }));

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  reservationId: uuid("reservation_id").references(() => slotReservations.id, { onDelete: "set null" }),
  purpose: paymentPurpose("purpose").notNull().default("booking"),
  provider: text("provider").notNull().default("razorpay"),
  status: paymentStatus("status").notNull().default("creating"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("INR"),
  providerOrderId: text("provider_order_id"),
  providerPaymentId: text("provider_payment_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  failureReason: text("failure_reason"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => ({ appointmentIdx: index("payments_appointment_idx").on(table.appointmentId, table.createdAt), orderUnique: uniqueIndex("payments_provider_order_unique").on(table.provider, table.providerOrderId), idempotencyUnique: uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey) }));

export const refundRequests = pgTable("refund_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: refundStatus("status").notNull().default("requested"),
  ...auditColumns(),
}, (table) => ({ appointmentIdx: index("refund_requests_appointment_idx").on(table.appointmentId, table.createdAt) }));

export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => refundRequests.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  amountMinor: integer("amount_minor").notNull(),
  status: refundStatus("status").notNull().default("requested"),
  providerRefundId: text("provider_refund_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  failureReason: text("failure_reason"),
  attempts: integer("attempts").notNull().default(0),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => ({ requestIdx: index("refunds_request_idx").on(table.requestId), providerUnique: uniqueIndex("refunds_provider_unique").on(table.providerRefundId), idempotencyUnique: uniqueIndex("refunds_idempotency_unique").on(table.idempotencyKey) }));

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().default("razorpay"),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  entityId: text("entity_id"),
  payload: text("payload").notNull(),
  status: deliveryStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  ...auditColumns(),
}, (table) => ({ providerEventUnique: uniqueIndex("payment_webhook_provider_event_unique").on(table.provider, table.providerEventId) }));

export const rescheduleRequests = pgTable("reschedule_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  targetSlotId: uuid("target_slot_id").notNull().references(() => appointmentSlots.id, { onDelete: "cascade" }),
  targetReservationId: uuid("target_reservation_id").references(() => slotReservations.id, { onDelete: "set null" }),
  oldFeeMinor: integer("old_fee_minor").notNull(),
  newFeeMinor: integer("new_fee_minor").notNull(),
  status: rescheduleStatus("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...auditColumns(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientId: uuid("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  type: notificationType("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  dedupeKey: text("dedupe_key"),
  readAt: timestamp("read_at", { withTimezone: true }),
  ...auditColumns(),
}, (table) => ({ recipientIdx: index("notifications_recipient_idx").on(table.recipientId, table.createdAt) }));

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
  channel: notificationChannel("channel").notNull().default("email"),
  template: text("template").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: deliveryStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  dedupeKey: text("dedupe_key").notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  providerMessageId: text("provider_message_id"),
  ...auditColumns(),
}, (table) => ({ dedupeUnique: uniqueIndex("notification_delivery_dedupe_unique").on(table.dedupeKey), dueIdx: index("notification_delivery_due_idx").on(table.status, table.scheduledAt) }));
