import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { AssistantHeroBanner } from "@/components/assistant/assistant-hero-banner";

export const instant = false;

export default async function PatientAssistantPage() {
  await connection();
  await requireRole("patient");
  return (
    <div className="-my-2 sm:-my-3 flex flex-1 flex-col h-[calc(100svh-6rem)] sm:h-[calc(100svh-6.5rem)] max-h-[calc(100svh-6rem)] sm:max-h-[calc(100svh-6.5rem)] gap-2 sm:gap-2.5 overflow-hidden">
      <AssistantHeroBanner role="patient" />
      <AssistantChat role="patient" />
    </div>
  );
}
