"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PatientQueueRow } from "@/lib/queue/queries";
import { Button } from "@/components/ui/button";

export function PatientQueuePanel({ rows }: { rows: PatientQueueRow[] }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <section className="rounded-2xl border bg-card p-5" aria-label="My check-in and queue status" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">My check-in and queue status</h2><Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>Refresh status</Button></div>
    {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No check-in for today’s visits yet. Clinic staff or your doctor will check you in when you arrive.</p> : <div className="mt-3 grid gap-2">{rows.map((row) => <div key={row.appointment_id} className="rounded-lg bg-muted/40 p-3 text-sm">
      <strong>{row.token_number === null ? "No token" : `Token T${String(row.token_number).padStart(3, "0")}`}</strong>
      <span className="ml-2 capitalize">{row.attendance_status === "no_show" ? "No-show recorded" : row.queue_status?.replaceAll("_", " ") ?? "Not checked in"}</span>
      {row.queue_position && <span> · Position {row.queue_position} · {row.queue_position - 1} ahead</span>}
      {row.checked_in_at && <p className="mt-1 text-xs text-muted-foreground">Checked in {new Date(row.checked_in_at).toLocaleString()}</p>}
    </div>)}</div>}
  </section>;
}
