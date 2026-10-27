import { z } from "zod";

export const bookingSchema = z.object({
  slotId: z.string().uuid("Choose a valid appointment slot."),
  reason: z.string().trim().max(500, "Visit reason must be 500 characters or fewer.").optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;
