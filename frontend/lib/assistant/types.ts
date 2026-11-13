export type AssistantRole = "doctor" | "patient";

export type AssistantDisplayPayload = {
  kind: "appointments" | "slots" | "doctors" | "payments" | "prescriptions" | "stats" | "message";
  title: string;
  data?: unknown;
};

export type PendingAssistantAction = {
  id: string;
  actionType: "booking" | "reschedule" | "cancellation";
  preview: Record<string, unknown>;
  expiresAt: string;
};

export type AssistantToolResult = {
  modelSummary: string;
  display?: AssistantDisplayPayload;
  pendingAction?: PendingAssistantAction;
};
