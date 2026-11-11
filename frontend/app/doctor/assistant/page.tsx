import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const instant = false;

export default async function DoctorAssistantPage() {
  await connection();
  await requireRole("doctor");
  return <div className="space-y-4"><div><p className="text-sm font-medium text-primary">Doctor workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">AI scheduling assistant</h1><p className="mt-2 text-sm text-muted-foreground">Ask about today&apos;s appointments, conflicts, availability, and schedule statistics.</p></div><AssistantChat role="doctor" /></div>;
}
