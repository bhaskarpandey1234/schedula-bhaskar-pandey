import { z } from "zod";

export const appointmentIdSchema = z.object({ appointmentId: z.string().uuid() });

export const appointmentTabSchema = z.enum(["upcoming", "past", "cancelled"]);

export type AppointmentTab = z.infer<typeof appointmentTabSchema>;
