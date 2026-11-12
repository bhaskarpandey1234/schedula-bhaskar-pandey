import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const instant = false;

export default async function DoctorAssistantPage() {
  await connection();
  await requireRole("doctor");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Doctor workspace</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">AI scheduling assistant</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Ask about today&apos;s appointments, conflicts, availability, and schedule statistics.
        </p>
      </div>
      <AssistantChat role="doctor" />
    </div>
  );
}
