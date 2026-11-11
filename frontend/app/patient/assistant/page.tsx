import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const instant = false;

export default async function PatientAssistantPage() {
  await connection();
  await requireRole("patient");
  return <div className="space-y-4"><div><p className="text-sm font-medium text-primary">Patient hub</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">AI care assistant</h1><p className="mt-2 text-sm text-muted-foreground">Find doctors, check real slots, and manage appointments with explicit confirmation.</p></div><AssistantChat role="patient" /></div>;
}
