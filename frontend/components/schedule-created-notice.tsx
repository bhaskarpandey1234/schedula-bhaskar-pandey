"use client";

import { CheckCircle2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { useEffect } from "react";

export function ScheduleCreatedNotice({ date }: { date: string }) {
  const { notify } = useFeedback();
  useEffect(() => { notify({ type: "success", title: "Availability created", description: `Your schedule for ${date} is ready below.` }); }, [date, notify]);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden="true" /><span><strong>Availability created.</strong> Your generated slots are ready.</span></div><a href="#schedule" className="font-semibold text-primary underline-offset-4 hover:underline">View schedule</a></div>;
}
