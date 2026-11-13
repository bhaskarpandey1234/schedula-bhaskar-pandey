import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const instant = false;

export default async function PatientAssistantPage() {
  await connection();
  await requireRole("patient");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Patient hub</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">AI care assistant</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Find doctors, check real slots, and manage appointments with explicit confirmation.
        </p>
      </div>
      <AssistantChat role="patient" />
    </div>
  );
}
