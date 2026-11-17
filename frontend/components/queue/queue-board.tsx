"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { queueAction, type QueueActionState } from "@/lib/queue/actions";
import type { QueueBoardRow } from "@/lib/queue/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type QueueCommand = "check_in" | "no_show" | "reverse_no_show" | "call_next" | "call_again" | "start" | "skip" | "return" | "complete";

const commandText: Record<QueueCommand, { label: string; impact: string }> = {
  check_in: { label: "Check in", impact: "Record arrival, issue a permanent queue token, and notify the patient by email if enabled." },
  no_show: { label: "Mark no-show", impact: "Record this patient as absent. The booking and payment will remain unchanged." },
  reverse_no_show: { label: "Reverse no-show", impact: "Reopen check-in for this patient and record your reason in the audit history." },
  call_next: { label: "Call next", impact: "Call this patient now. Other patients will remain waiting." },
  call_again: { label: "Call again", impact: "Record another call for this patient without changing their token or position." },
  start: { label: "Start consultation", impact: "Mark this patient as currently in consultation." },
  skip: { label: "Skip patient", impact: "Remove this patient from the active queue after five minutes. They can later return at the end." },
  return: { label: "Return to queue", impact: "Put this patient at the end of the waiting queue with their original token." },
  complete: { label: "Complete consultation", impact: "Complete the appointment and remove this patient from the active queue. This cannot be undone." },
};

function token(number: number | null) {
  return number === null ? "—" : `T${String(number).padStart(3, "0")}`;
}

function QueueActionControl({ row, command }: { row: QueueBoardRow; command: QueueCommand }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(queueAction, {} as QueueActionState);
  useEffect(() => {
    if (state.success) { setOpen(false); router.refresh(); }
  }, [state.success, router]);
  const details = commandText[command];
  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button type="button" size="sm" variant={command === "check_in" || command === "call_next" ? "default" : "outline"}>{details.label}</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{details.label}?</DialogTitle><DialogDescription>{details.impact}</DialogDescription></DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <strong>{row.patient_name}</strong> · {row.doctor_name}<br />
          Token {token(row.token_number)} · {row.queue_status?.replaceAll("_", " ") ?? "Not checked in"}
        </div>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="action" value={command} />
          <input type="hidden" name="appointmentId" value={row.appointment_id} />
          <input type="hidden" name="entryId" value={row.entry_id ?? ""} />
          {command === "reverse_no_show" && <label className="grid gap-1 text-sm font-medium">Reason
            <Input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required aria-invalid={Boolean(state.error && reason.length < 3)} />
          </label>}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          {state.stale && <Button type="button" variant="outline" onClick={() => { router.refresh(); setOpen(false); }}>Refresh current state</Button>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep current state</Button><Button type="submit" disabled={pending || (command === "reverse_no_show" && reason.trim().length < 3)}>{pending ? "Saving…" : `Confirm ${details.label.toLowerCase()}`}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {state.success && <span role="status" className="sr-only">{state.success}</span>}
  </>;
}

export function QueueBoard({ rows, role }: { rows: QueueBoardRow[]; role: "doctor" | "staff" | "admin" }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => { setNow(Date.now()); router.refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  const waiting = rows.filter((row) => row.queue_status === "waiting").sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
  const current = rows.filter((row) => row.queue_status === "in_consultation" || row.queue_status === "called");
  const filtered = useMemo(() => rows.filter((row) => `${row.patient_name} ${row.doctor_name} ${row.appointment_id}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  return <div className="space-y-6" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Patient check-in and queue</h1><p className="text-sm text-muted-foreground">Today’s booked visits · updates every 10 seconds</p></div><Button type="button" variant="outline" onClick={() => router.refresh()}>Refresh queue</Button></div>
    <section className="rounded-xl border p-4" aria-label="Current patient"><h2 className="font-semibold">Current patient</h2>{current.map((row) => <p key={row.appointment_id} className="mt-2 text-sm">{token(row.token_number)} · {row.patient_name} · {row.doctor_name} · {row.queue_status?.replaceAll("_", " ")}</p>)}{current.length === 0 && <p className="mt-2 text-sm">No patient is currently called or in consultation.</p>}</section>
    <section className="rounded-xl border p-4" aria-label="Upcoming patients"><h2 className="font-semibold">Upcoming patients ({waiting.length})</h2><ol className="mt-2 space-y-1 text-sm">{waiting.map((row) => <li key={row.appointment_id}>{row.queue_position}. {token(row.token_number)} · {row.patient_name} · {row.doctor_name}</li>)}</ol>{waiting.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No patients are waiting.</p>}</section>
    <label className="grid max-w-sm gap-1 text-sm font-medium">Find today’s appointment<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient, doctor, or appointment ID" /></label>
    <div className="grid gap-3">
      {filtered.map((row) => {
        const next = waiting.find((item) => item.doctor_id === row.doctor_id);
        const doctorHasCurrent = rows.some((item) => item.doctor_id === row.doctor_id && (item.queue_status === "called" || item.queue_status === "in_consultation"));
        const canNoShow = now >= new Date(row.no_show_eligible_at).getTime();
        const commands: QueueCommand[] = [];
        if (row.appointment_status === "confirmed") {
          if (row.attendance_status === "no_show") commands.push("reverse_no_show");
          else if (!row.entry_id) { commands.push("check_in"); if (canNoShow) commands.push("no_show"); }
          else if (row.queue_status === "waiting" && next?.entry_id === row.entry_id && !doctorHasCurrent) commands.push("call_next");
          else if (row.queue_status === "called") {
            commands.push("call_again");
            if (role !== "staff") commands.push("start");
            if (row.called_at && now >= new Date(row.called_at).getTime() + 5 * 60_000) commands.push("skip");
          } else if (row.queue_status === "in_consultation" && role !== "staff") commands.push("complete");
          else if (row.queue_status === "skipped") commands.push("return");
        }
        return <section key={row.appointment_id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{row.patient_name}</h3><p className="text-sm text-muted-foreground">{row.doctor_name} · {new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(row.slot_start_at))}</p></div><span className="text-sm font-bold">{token(row.token_number)}</span></div>
          <p className="mt-2 text-sm">{row.appointment_status === "cancelled" ? "Cancelled" : row.attendance_status === "no_show" ? "No-show" : row.queue_status ? row.queue_status.replaceAll("_", " ") : "Not checked in"}{row.queue_position ? ` · Position ${row.queue_position}` : ""}{row.checked_in_at ? ` · Checked in ${new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, timeStyle: "short" }).format(new Date(row.checked_in_at))}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">{commands.map((command) => <QueueActionControl key={command} row={row} command={command} />)}</div>
        </section>;
      })}
      {filtered.length === 0 && <p className="rounded-xl border p-6 text-sm text-muted-foreground">No matching appointments for today.</p>}
    </div>
  </div>;
}
