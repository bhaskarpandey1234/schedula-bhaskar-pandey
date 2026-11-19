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
    {rows.length === 0 ? (
      <p className="mt-2 text-sm text-muted-foreground">
        Your appointment token will appear here on the service date. Clinic staff will check you in when you arrive.
      </p>
    ) : (
      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-xs sm:text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
              <th scope="col" className="w-28 px-3.5 py-2.5">Token</th>
              <th scope="col" className="px-3.5 py-2.5">Queue Status</th>
              <th scope="col" className="w-36 px-3.5 py-2.5">Position</th>
              <th scope="col" className="w-44 px-3.5 py-2.5 text-right">Checked In</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={row.appointment_id} className="transition-colors hover:bg-muted/20">
                <td className="px-3.5 py-3 align-middle font-mono font-bold whitespace-nowrap">
                  {row.token_number === null ? "—" : `Token T${String(row.token_number).padStart(3, "0")}`}
                </td>
                <td className="px-3.5 py-3 align-middle capitalize whitespace-nowrap">
                  {row.attendance_status === "no_show"
                    ? "Unavailable / no-show"
                    : !row.checked_in_at
                      ? "Booked · not arrived"
                      : row.queue_status?.replaceAll("_", " ") ?? "Checked in"}
                </td>
                <td className="px-3.5 py-3 align-middle text-xs whitespace-nowrap">
                  {row.queue_position
                    ? `Position ${row.queue_position} (${row.queue_position - 1} ahead)`
                    : "—"}
                </td>
                <td className="px-3.5 py-3 align-middle text-right text-xs text-muted-foreground whitespace-nowrap">
                  {row.checked_in_at ? new Date(row.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>;
}
