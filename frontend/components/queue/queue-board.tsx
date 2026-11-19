"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { queueAction, autoSyncExpiredNoShows, type QueueActionState } from "@/lib/queue/actions";
import type { QueueBoardRow, QueueDoctor } from "@/lib/queue/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueueCommand = "check_in" | "no_show" | "call_next" | "skip" | "return" | "complete";

export type QueueActionRow = {
  appointment_id: string;
  patient_name: string;
  token_number: number | null;
  entry_id: string | null;
  appointment_status: string;
  checked_in_at: string | null;
  timezone: string;
  slot_start_at: string;
  attendance_status: string | null;
  no_show_eligible_at?: string;
  queue_status: string | null;
};

export const commandText: Record<QueueCommand, { label: string; impact: string }> = {
  check_in: { label: "Check-in", impact: "Record the patient's arrival and move their existing token into the active queue." },
  no_show: { label: "Unavailable", impact: "Record that the patient did not arrive within the appointment's grace period. Their appointment and payment remain unchanged." },
  call_next: { label: "Call", impact: "Call the next checked-in patient for this doctor. Other patients remain in their current order." },
  skip: { label: "Skip", impact: "Move this checked-in patient out of the active queue. They can later return at the end." },
  return: { label: "Return", impact: "Put this patient at the end of the waiting queue with their existing token." },
  complete: { label: "Complete", impact: "Complete the consultation and remove this patient from the active queue. This cannot be undone." },
};

export function commandDisabledReason(
  command: QueueCommand,
  row: QueueActionRow,
  context: { now: number; canCallNext: boolean },
) {
  if (row.appointment_status !== "confirmed") return "This appointment is no longer active.";
  switch (command) {
    case "check_in":
      if (row.checked_in_at) return "The patient is already checked in.";
      if (context.now > 0) {
        const formatDate = (value: string | number) => new Intl.DateTimeFormat("en-CA", {
          timeZone: row.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value));
        if (formatDate(context.now) !== formatDate(row.slot_start_at)) {
          return "Check-in is available only on the appointment date.";
        }
      }
      return null;
    case "no_show":
      if (row.attendance_status === "no_show") return "Unavailable is already recorded.";
      if (row.checked_in_at) return "A checked-in patient cannot be marked unavailable.";
      if (!row.no_show_eligible_at) return null;
      return context.now >= new Date(row.no_show_eligible_at).getTime()
        ? null
        : `Unavailable after ${dateTime(row.no_show_eligible_at, row.timezone)}`;
    case "call_next":
      if (!row.checked_in_at) return "Check in the patient before calling them.";
      if (row.queue_status !== "waiting") return "The patient must be waiting in the queue.";
      return context.canCallNext ? null : "Only the next eligible patient can be called when no consultation is active.";
    case "skip":
      return row.checked_in_at && (row.queue_status === "waiting" || row.queue_status === "called")
        ? null
        : "Only checked-in waiting or called patients can be skipped.";
    case "return":
      return row.queue_status === "skipped" ? null : "Only a skipped patient can return to the queue.";
    case "complete":
      return row.queue_status === "in_consultation" ? null : "Call the patient from the queue before completing it.";
  }
}

function token(number: number | null) {
  return number === null ? "—" : `T${String(number).padStart(3, "0")}`;
}

function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export type QueueStatusRow = {
  appointment_status: string;
  attendance_status: string | null;
  checked_in_at: string | null;
  no_show_eligible_at?: string;
  queue_status?: string | null;
};

export function isGraceExpired(row: QueueStatusRow, now: number): boolean {
  if (row.attendance_status === "no_show") return true;
  if (!row.checked_in_at && row.appointment_status === "confirmed") {
    if (now > 0 && row.no_show_eligible_at) {
      return new Date(row.no_show_eligible_at).getTime() <= now;
    }
  }
  return false;
}

function timeRange(row: { slot_start_at: string; slot_end_at: string; timezone: string }) {
  const formatter = new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, timeStyle: "short" });
  return `${formatter.format(new Date(row.slot_start_at))}–${formatter.format(new Date(row.slot_end_at))}`;
}

function queueLabel(row: QueueStatusRow, now?: number) {
  if (row.appointment_status === "cancelled") return "Cancelled";
  if (row.attendance_status === "no_show" || (now && isGraceExpired(row, now))) return "Unavailable";
  if (!row.checked_in_at) return "Not arrived";
  switch (row.queue_status) {
    case "waiting": return "Checked in";
    case "called": return "Called";
    case "in_consultation": return "In consultation";
    case "skipped": return "Skipped";
    case "completed": return "Completed";
    default: return "Checked in";
  }
}

function QueueActionDialog({
  row,
  command,
  now,
  onClose,
}: {
  row: QueueActionRow;
  command: QueueCommand;
  now: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(queueAction, {} as QueueActionState);
  useEffect(() => {
    if (state.success) { onClose(); router.refresh(); }
  }, [state.success, onClose, router]);
  const details = commandText[command];
  return (
    <DialogContent className="max-w-md text-left whitespace-normal">
      <DialogHeader className="text-left whitespace-normal">
        <DialogTitle>{details.label}?</DialogTitle>
        <DialogDescription className="text-left whitespace-normal">
          {command === "check_in" && (row.attendance_status === "no_show" || isGraceExpired(row, now))
            ? "Patient was marked unavailable. Confirming check-in will restore their availability and place their token into the active queue."
            : details.impact}
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-left whitespace-normal">
        <strong className="block font-semibold text-foreground">{row.patient_name}</strong>
        <span className="text-muted-foreground">{token(row.token_number)} · {queueLabel(row, now)}</span>
      </div>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="action" value={command} />
        <input type="hidden" name="appointmentId" value={row.appointment_id} />
        <input type="hidden" name="entryId" value={row.entry_id ?? ""} />
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state.stale && <Button type="button" variant="outline" onClick={() => { router.refresh(); onClose(); }}>Refresh current state</Button>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Keep current state</Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : `Confirm ${details.label.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </form>
      {state.success && <span role="status" className="sr-only">{state.success}</span>}
    </DialogContent>
  );
}

export function QueueActionControls({
  row,
  canCallNext,
  now,
  commands,
  compact = false,
}: {
  row: QueueActionRow;
  canCallNext: boolean;
  now: number;
  commands: readonly QueueCommand[];
  compact?: boolean;
}) {
  const [command, setCommand] = useState<QueueCommand | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setCommand(null);
  }, []);
  return (
    <>
      <div className={cn(
        compact ? "flex flex-wrap items-center gap-1 sm:flex-nowrap" : "grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      )}>
        {commands.map((candidate) => {
          const details = commandText[candidate];
          const disabledReason = commandDisabledReason(candidate, row, { now, canCallNext });
          const control = (
            <Button
              type="button"
              size="sm"
              variant={candidate === "check_in" || candidate === "call_next" || candidate === "return" ? "default" : "outline"}
              className={cn(
                compact
                  ? "h-7 whitespace-nowrap px-2 py-0.5 text-xs font-medium"
                  : "h-auto min-h-8 w-full whitespace-normal px-2 py-1 text-center text-xs leading-tight"
              )}
              disabled={Boolean(disabledReason)}
              aria-label={details.label}
              aria-describedby={disabledReason ? `queue-action-reason-${row.appointment_id}-${candidate}` : undefined}
              onClick={() => { setCommand(candidate); setOpen(true); }}
            >
              {details.label}
              {disabledReason && (
                <span id={`queue-action-reason-${row.appointment_id}-${candidate}`} className="sr-only">
                  {disabledReason}
                </span>
              )}
            </Button>
          );
          return (
            disabledReason ? (
              <Tooltip key={candidate}>
                <TooltipTrigger asChild><span className="block shrink-0" tabIndex={0}>{control}</span></TooltipTrigger>
                <TooltipContent>{disabledReason}</TooltipContent>
              </Tooltip>
            ) : <span key={candidate} className="block shrink-0">{control}</span>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
        {command && <QueueActionDialog key={command} row={row} command={command} now={now} onClose={close} />}
      </Dialog>
    </>
  );
}

function QueueLiveColumn({
  rows,
  nextByDoctor,
  activeByDoctor,
  now,
  pageSize = 10,
}: {
  rows: QueueBoardRow[];
  nextByDoctor: Map<string, QueueBoardRow>;
  activeByDoctor: Set<string>;
  now: number;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, rows.length);
  const paginatedRows = rows.slice(startIndex, endIndex);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:h-[calc(100vh-13rem)] lg:min-h-[500px]">
      <div className="flex items-center justify-between border-b bg-muted/25 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold sm:text-base">Live Patient Queue</h3>
          <Badge variant="default" className="shrink-0 text-xs">
            {rows.length}
          </Badge>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-48 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            No patients currently waiting or in consultation.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground sticky top-0 z-10 backdrop-blur-xs">
                <th scope="col" className="w-16 px-2.5 py-2">Token</th>
                <th scope="col" className="min-w-[110px] px-2.5 py-2">Patient</th>
                <th scope="col" className="w-32 px-2.5 py-2">Slot & Time</th>
                <th scope="col" className="w-24 px-2.5 py-2">Status</th>
                <th scope="col" className="w-40 px-2.5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedRows.map((row) => {
                const next = nextByDoctor.get(row.doctor_id);
                const canCallNext = row.appointment_status === "confirmed"
                  && row.checked_in_at !== null
                  && row.queue_status === "waiting"
                  && next?.entry_id === row.entry_id
                  && !activeByDoctor.has(row.doctor_id);
                const commands: QueueCommand[] = [
                  "call_next",
                  row.queue_status === "skipped" ? "return" : "skip",
                  "complete",
                ];
                const isInConsultation = row.queue_status === "in_consultation";
                const isCalled = row.queue_status === "called";

                return (
                  <tr
                    key={row.appointment_id}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      isInConsultation && "bg-primary/5 font-medium border-l-4 border-l-primary",
                      isCalled && "bg-amber-500/5 font-medium border-l-4 border-l-amber-500",
                    )}
                  >
                    {/* Token & Pos */}
                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs font-bold">
                        <span>{token(row.token_number)}</span>
                        {row.queue_position !== null && row.checked_in_at && (
                          <span className="text-[10px] text-muted-foreground font-normal">#{row.queue_position}</span>
                        )}
                      </div>
                    </td>

                    {/* Patient */}
                    <td className="px-3 py-2.5 align-middle">
                      <div className="font-semibold text-foreground leading-tight">{row.patient_name}</div>
                      {row.patient_phone && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{row.patient_phone}</div>
                      )}
                    </td>

                    {/* Slot & Time */}
                    <td className="px-3 py-2.5 align-middle text-muted-foreground whitespace-nowrap">
                      <div>{timeRange(row)}</div>
                      {row.checked_in_at && (
                        <div className="text-[10px] text-foreground/80 mt-0.5 font-medium">
                          In: {time(row.checked_in_at, row.timezone)}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      {isInConsultation && (
                        <Badge variant="default" className="animate-pulse px-1.5 py-0 text-[10px]">
                          In Room
                        </Badge>
                      )}
                      {isCalled && (
                        <Badge variant="outline" className="border-amber-500 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400">
                          Calling
                        </Badge>
                      )}
                      {!isInConsultation && !isCalled && (
                        <Badge
                          variant={row.attendance_status === "no_show" ? "destructive" : row.checked_in_at ? "secondary" : "outline"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {queueLabel(row)}
                        </Badge>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 align-middle text-right whitespace-nowrap">
                      <div className="inline-flex justify-end">
                        <QueueActionControls row={row} canCallNext={canCallNext} now={now} commands={commands} compact />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between border-t bg-muted/10 p-2 text-xs text-muted-foreground">
          <span>{startIndex + 1}–{endIndex} of {rows.length}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="px-1 font-medium">{currentPage}/{totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueActivityColumn({
  upcomingRows,
  completedRows,
  unavailableRows,
  now,
  pageSize = 10,
}: {
  upcomingRows: QueueBoardRow[];
  completedRows: QueueBoardRow[];
  unavailableRows: QueueBoardRow[];
  now: number;
  pageSize?: number;
}) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "completed" | "unavailable">("upcoming");
  const [page, setPage] = useState(1);

  const currentRows = activeTab === "upcoming"
    ? upcomingRows
    : activeTab === "completed"
      ? completedRows
      : unavailableRows;

  const totalPages = Math.max(1, Math.ceil(currentRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, currentRows.length);
  const paginatedRows = currentRows.slice(startIndex, endIndex);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:h-[calc(100vh-13rem)] lg:min-h-[500px]">
      <div className="flex flex-col gap-2 border-b bg-muted/25 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold sm:text-base">Activity</h3>
          <Badge variant="outline" className="text-xs capitalize">
            {currentRows.length} {activeTab}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => { setActiveTab("upcoming"); setPage(1); }}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
              activeTab === "upcoming" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Upcoming arrivals tab"
          >
            <span className="truncate">Upcoming</span>
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", activeTab === "upcoming" ? "bg-primary/10 text-primary font-bold" : "bg-muted text-muted-foreground")}>
              {upcomingRows.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("completed"); setPage(1); }}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
              activeTab === "completed" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Completed visits tab"
          >
            <span className="truncate">Completed</span>
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", activeTab === "completed" ? "bg-primary/10 text-primary font-bold" : "bg-muted text-muted-foreground")}>
              {completedRows.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("unavailable"); setPage(1); }}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
              activeTab === "unavailable" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Unavailable patients tab"
          >
            <span className="truncate">Unavailable</span>
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", activeTab === "unavailable" ? "bg-destructive/10 text-destructive font-bold" : "bg-muted text-muted-foreground")}>
              {unavailableRows.length}
            </span>
          </button>
        </div>
      </div>

      <div className="truncate border-b bg-muted/10 px-3 py-1 text-[11px] text-muted-foreground">
        {activeTab === "upcoming" && "Confirmed bookings awaiting arrival. Click Check-in upon arrival."}
        {activeTab === "completed" && "Finished doctor consultations."}
        {activeTab === "unavailable" && "No-show / unavailable patients. Late arrivals can still check in."}
      </div>

      <div className="flex-1 overflow-auto">
        {currentRows.length === 0 ? (
          <div className="flex h-48 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {activeTab === "upcoming" && "No upcoming arrivals awaiting check-in."}
            {activeTab === "completed" && "No completed appointments."}
            {activeTab === "unavailable" && "No unavailable appointments."}
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground sticky top-0 z-10 backdrop-blur-xs">
                <th scope="col" className="w-14 px-2 py-2">Token</th>
                <th scope="col" className="min-w-[100px] px-2 py-2">Patient</th>
                <th scope="col" className="w-24 px-2 py-2">Slot</th>
                <th scope="col" className="w-36 sm:w-40 px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedRows.map((row) => {
                const isUnavailable = row.attendance_status === "no_show" || isGraceExpired(row, now);
                const isCompleted = row.appointment_status === "completed" || row.queue_status === "completed";
                const commands: QueueCommand[] = isUnavailable
                  ? ["check_in"]
                  : isCompleted
                    ? []
                    : ["check_in", "no_show"];

                return (
                  <tr
                    key={row.appointment_id}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      isUnavailable && "bg-destructive/5",
                    )}
                  >
                    {/* Token */}
                    <td className="px-2 py-2 align-middle whitespace-nowrap">
                      <span className="font-mono text-xs font-bold rounded bg-muted/50 px-1.5 py-0.5">
                        {token(row.token_number)}
                      </span>
                    </td>

                    {/* Patient */}
                    <td className="px-2 py-2 align-middle">
                      <div className="font-semibold text-foreground truncate max-w-[130px]">{row.patient_name}</div>
                      {row.patient_phone && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{row.patient_phone}</div>
                      )}
                    </td>

                    {/* Slot */}
                    <td className="px-2 py-2 align-middle text-[11px] text-muted-foreground whitespace-nowrap">
                      {timeRange(row)}
                    </td>

                    {/* Action */}
                    <td className="px-2 py-2 align-middle text-right whitespace-nowrap">
                      {commands.length > 0 ? (
                        <div className="inline-flex justify-end">
                          <QueueActionControls row={row} canCallNext={false} now={now} commands={commands} compact />
                        </div>
                      ) : isCompleted ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Completed</Badge>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {currentRows.length > pageSize && (
        <div className="flex items-center justify-between border-t bg-muted/10 p-2 text-xs text-muted-foreground">
          <span>{startIndex + 1}–{endIndex} of {currentRows.length}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="px-1 font-medium">{currentPage}/{totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function QueueBoard({
  rows,
  doctors,
  serviceDate,
  doctorId,
  slotId,
  allowAllDoctors = false,
}: {
  rows: QueueBoardRow[];
  doctors: QueueDoctor[];
  serviceDate: string;
  doctorId: string;
  slotId: string;
  allowAllDoctors?: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [mobileView, setMobileView] = useState<"all" | "live" | "activity">("all");

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => { setNow(Date.now()); router.refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const filtered = useMemo(() => slotId ? rows.filter((row) => row.slot_id === slotId) : rows, [rows, slotId]);
  const waiting = filtered.filter((row) => row.queue_status === "waiting" && row.checked_in_at !== null)
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
  const completed = filtered.filter((row) => row.appointment_status === "completed" || row.queue_status === "completed");
  const inConsultationRow = filtered.find((r) => r.queue_status === "in_consultation");
  const calledRow = filtered.find((r) => r.queue_status === "called");
  const activeRow = inConsultationRow ?? calledRow ?? null;
  const currentToken = activeRow?.token_number ?? null;
  const activeByDoctor = new Set(rows.filter((row) => row.queue_status === "called" || row.queue_status === "in_consultation").map((row) => row.doctor_id));
  const nextByDoctor = new Map<string, QueueBoardRow>();
  for (const row of rows.filter((item) => item.queue_status === "waiting" && item.checked_in_at !== null)
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0))) {
    if (!nextByDoctor.has(row.doctor_id)) nextByDoctor.set(row.doctor_id, row);
  }
  const slotOptions = [...new Map(rows.map((row) => [row.slot_id, row])).values()]
    .sort((a, b) => a.slot_start_at.localeCompare(b.slot_start_at));

  const selectedDoctor = doctors.find((doctor) => doctor.doctor_id === doctorId);

  // Section 1: Live Patient Queue (In Consultation + Called + Waiting in order + Skipped)
  const liveQueueRows = useMemo(() => {
    const inConsultation = filtered.filter((r) => r.queue_status === "in_consultation");
    const called = filtered.filter((r) => r.queue_status === "called");
    const waitingList = filtered.filter((r) => r.queue_status === "waiting" && r.checked_in_at !== null)
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
    const skippedList = filtered.filter((r) => r.queue_status === "skipped");
    return [...inConsultation, ...called, ...waitingList, ...skippedList];
  }, [filtered]);

  // Section 2: Upcoming Arrivals (Confirmed booked patients who have not arrived)
  const upcomingRows = useMemo(() => {
    return filtered.filter((r) => r.appointment_status === "confirmed" && !r.checked_in_at && !isGraceExpired(r, now))
      .sort((a, b) => {
        const timeDiff = a.slot_start_at.localeCompare(b.slot_start_at);
        if (timeDiff !== 0) return timeDiff;
        return (a.token_number ?? 0) - (b.token_number ?? 0);
      });
  }, [filtered, now]);

  // Section 3: Completed Consultations
  const completedRows = useMemo(() => {
    return filtered.filter((r) => r.appointment_status === "completed" || r.queue_status === "completed")
      .sort((a, b) => {
        const timeDiff = a.slot_start_at.localeCompare(b.slot_start_at);
        if (timeDiff !== 0) return timeDiff;
        return (a.token_number ?? 0) - (b.token_number ?? 0);
      });
  }, [filtered]);

  // Section 4: Unavailable (No-show) Patients
  const unavailableRows = useMemo(() => {
    return filtered.filter((r) => isGraceExpired(r, now))
      .sort((a, b) => {
        const timeDiff = a.slot_start_at.localeCompare(b.slot_start_at);
        if (timeDiff !== 0) return timeDiff;
        return (a.token_number ?? 0) - (b.token_number ?? 0);
      });
  }, [filtered, now]);

  useEffect(() => {
    if (now === 0) return;
    const expiredUnsynced = filtered
      .filter((r) => isGraceExpired(r, now) && r.attendance_status !== "no_show")
      .map((r) => r.appointment_id);
    if (expiredUnsynced.length > 0) {
      void autoSyncExpiredNoShows(expiredUnsynced);
    }
  }, [filtered, now]);

  return (
    <div className="space-y-3" aria-live="polite">
      <h1 className="sr-only">Patient queue</h1>

      <form method="get" className="grid gap-2.5 rounded-2xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1.1fr_auto] lg:items-end">
        <label htmlFor="queue-service-date" className="grid gap-1 text-xs font-medium text-muted-foreground">
          Service date
          <CustomDatePicker id="queue-service-date" name="date" defaultValue={serviceDate} required />
        </label>
        <label htmlFor="queue-doctor" className="grid gap-1 text-xs font-medium text-muted-foreground">
          Doctor
          <CustomSelect id="queue-doctor" name="doctorId" defaultValue={doctorId} required placeholder="Choose a doctor" options={[
            { value: "", label: "Choose a doctor" },
            ...(allowAllDoctors ? [{ value: "all", label: "All available doctors" }] : []),
            ...doctors.map((doctor) => ({ value: doctor.doctor_id, label: doctor.doctor_name })),
          ]} />
        </label>
        <label htmlFor="queue-slot" className="grid gap-1 text-xs font-medium text-muted-foreground">
          Slot
          <CustomSelect id="queue-slot" name="slotId" defaultValue={slotId} placeholder="All slots" options={[
            { value: "", label: "All slots" },
            ...slotOptions.map((row) => ({ value: row.slot_id, label: timeRange(row) })),
          ]} />
        </label>
        <Button type="submit" className="h-9">Show queue</Button>
      </form>

      {!doctorId ? (
        <section className="rounded-2xl border border-dashed bg-card p-8 text-center" aria-label="Queue filters required">
          <h2 className="font-semibold">Choose a doctor and date to load the queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select one doctor or intentionally view all available doctors. The queue stays hidden until you submit the filters.</p>
        </section>
      ) : (
        <>
          <section aria-label="Queue summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Appointments", value: filtered.length, detail: "total for this date" },
              {
                label: "Current token",
                value: token(currentToken),
                detail: inConsultationRow
                  ? "in consultation"
                  : calledRow
                    ? "called to room"
                    : "no active consultation",
              },
              { label: "Waiting", value: waiting.length, detail: "checked in and ready" },
              { label: "Completed", value: completed.length, detail: "consultations finished" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </section>

          {selectedDoctor && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">
                Queue for {selectedDoctor.doctor_name}
              </h2>
              <Badge variant="outline">{filtered.length} total appointments</Badge>
            </div>
          )}

          {filtered.length === 0 ? (
            <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No appointments match these filters. Choose another doctor, date, or slot.</p>
            </section>
          ) : (
            <div className="space-y-3">
              {/* Responsive tab selector on mobile/tablet */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant={mobileView === "all" ? "default" : "outline"}
                  onClick={() => setMobileView("all")}
                  className="h-8 text-xs shrink-0"
                >
                  Both Panels
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mobileView === "live" ? "default" : "outline"}
                  onClick={() => setMobileView("live")}
                  className="h-8 text-xs shrink-0"
                >
                  Live Queue ({liveQueueRows.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mobileView === "activity" ? "default" : "outline"}
                  onClick={() => setMobileView("activity")}
                  className="h-8 text-xs shrink-0"
                >
                  Activity ({upcomingRows.length + completedRows.length + unavailableRows.length})
                </Button>
              </div>

              {/* Viewport 2-Column Asymmetric Grid */}
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 items-stretch">
                {/* Column 1: Live Patient Queue (~58% width) */}
                <div className={cn("flex flex-col min-w-0 lg:col-span-7 xl:col-span-7", mobileView !== "all" && mobileView !== "live" && "hidden lg:flex")}>
                  <QueueLiveColumn
                    rows={liveQueueRows}
                    nextByDoctor={nextByDoctor}
                    activeByDoctor={activeByDoctor}
                    now={now}
                  />
                </div>

                {/* Column 2: Activity Panel (~42% width) with Tabs */}
                <div className={cn("flex flex-col min-w-0 lg:col-span-5 xl:col-span-5", mobileView !== "all" && mobileView !== "activity" && "hidden lg:flex")}>
                  <QueueActivityColumn
                    upcomingRows={upcomingRows}
                    completedRows={completedRows}
                    unavailableRows={unavailableRows}
                    now={now}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
