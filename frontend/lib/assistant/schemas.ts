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
}).superRefine((value, ctx) => {
  const total = value.messages.reduce((sum, message) => sum + message.text.length, 0);
  if (total > 20_000) ctx.addIssue({ code: "custom", message: "Conversation is too long", path: ["messages"] });
});
export const assistantDecisionSchema = z.object({
  decision: z.enum(["confirm", "decline", "payment_verified"]),
  paymentId: z.string().uuid().optional(),
  orderId: z.string().min(1).max(200).optional(),
  providerPaymentId: z.string().min(1).max(200).optional(),
  signature: z.string().min(1).max(500).optional(),
});

export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;
