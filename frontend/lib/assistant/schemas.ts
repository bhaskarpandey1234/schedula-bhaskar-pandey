import { z } from "zod";

export const assistantRoleSchema = z.enum(["doctor", "patient"]);
export const assistantLanguageSchema = z.enum(["en-IN", "hi-IN", "hinglish"]).default("en-IN");
export const assistantMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z.string().trim().min(1).max(4_000),
});
export const assistantChatRequestSchema = z.object({
  role: assistantRoleSchema,
  language: assistantLanguageSchema,
  messages: z.array(assistantMessageSchema).min(1).max(20),
  selectedDoctorId: z.string().uuid().optional(),
  selectedSlotId: z.string().uuid().optional(),
  selectedProposalDecision: z.object({
    proposalId: z.string().uuid(),
    decision: z.enum(["approve", "cancel", "choose_slot"]),
    slotId: z.string().uuid().optional(),
  }).optional(),
  selectedPatientAppointment: z.object({ appointmentId: z.string().uuid(), action: z.enum(["cancel", "reschedule"]) }).optional(),
  selectedRescheduleSlot: z.object({ appointmentId: z.string().uuid(), slotId: z.string().uuid() }).optional(),
}).superRefine((value, ctx) => {
  const total = value.messages.reduce((sum, message) => sum + message.text.length, 0);
  if (total > 20_000) ctx.addIssue({ code: "custom", message: "Conversation is too long", path: ["messages"] });
  if ((value.selectedSlotId || value.selectedDoctorId || value.selectedProposalDecision || value.selectedPatientAppointment || value.selectedRescheduleSlot) && value.role !== "patient") {
    ctx.addIssue({ code: "custom", message: "Only patients can select doctors or appointment slots", path: ["selectedSlotId"] });
  }
  if (value.selectedSlotId && value.selectedDoctorId) {
    ctx.addIssue({ code: "custom", message: "Select either a doctor or a slot, not both", path: ["selectedSlotId"] });
  }
  if (value.selectedProposalDecision?.decision === "choose_slot" && !value.selectedProposalDecision.slotId) {
    ctx.addIssue({ code: "custom", message: "Choose an available slot", path: ["selectedProposalDecision", "slotId"] });
  }
  const selectionCount = [value.selectedDoctorId, value.selectedSlotId, value.selectedProposalDecision, value.selectedPatientAppointment, value.selectedRescheduleSlot].filter(Boolean).length;
  if (selectionCount > 1) ctx.addIssue({ code: "custom", message: "Submit one structured selection at a time", path: ["selectedSlotId"] });
});
export const assistantDecisionSchema = z.object({
  decision: z.enum(["confirm", "decline", "payment_verified"]),
  paymentId: z.string().uuid().optional(),
  orderId: z.string().min(1).max(200).optional(),
  providerPaymentId: z.string().min(1).max(200).optional(),
  signature: z.string().min(1).max(500).optional(),
});

export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;
