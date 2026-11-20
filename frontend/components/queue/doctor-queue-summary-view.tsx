"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { loadDoctorQueueSummaryAction } from "@/lib/queue/doctor-actions";
import type { DoctorQueuePatientRow, DoctorQueueSlotOption, DoctorQueueSummary } from "@/lib/queue/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import { QueueActionControls, type QueueCommand } from "@/components/queue/queue-board";
import { DoctorPrescriptionDialog } from "@/components/clinical/doctor-prescription-manager";
import type { ClinicalPrescription } from "@/lib/clinical/queries";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function tokenLabel(token: number | null) {
  return token === null ? "—" : `T${String(token).padStart(3, "0")}`;
}

function slotRange(startAt: string, endAt: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    timeStyle: "short",
  });
  return `${formatter.format(new Date(startAt))}–${formatter.format(new Date(endAt))}`;
}

function timeFormatted(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    timeStyle: "short",
  }).format(new Date(value));
}

function updateQueueUrl(serviceDate: string, slotId: string | null, showQueue: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set("date", serviceDate);
  if (slotId) url.searchParams.set("slot", slotId);
  else url.searchParams.delete("slot");
  url.searchParams.set("showQueue", showQueue ? "1" : "0");
  window.history.replaceState(window.history.state, "", url);
}

const EMPTY_PATIENTS: DoctorQueuePatientRow[] = [];
const EMPTY_PRESCRIPTIONS: Record<string, ClinicalPrescription> = {};

type DoctorQueueFilters = {
  serviceDate: string;
  timezone: string;
  slots: DoctorQueueSlotOption[];
  selectedSlotId: string | null;
  showQueue: boolean;
};

export function DoctorQueueSummaryView({
  summary,
  initialPatients = EMPTY_PATIENTS,
  initialPrescriptions = EMPTY_PRESCRIPTIONS,
  compact = false,
  filters,
  doctorInfo,
}: {
  summary: DoctorQueueSummary | null;
  initialPatients?: DoctorQueuePatientRow[];
  initialPrescriptions?: Record<string, ClinicalPrescription>;
  compact?: boolean;
  filters?: DoctorQueueFilters;
  doctorInfo?: {
    name?: string;
    specialty?: string;
    clinicName?: string;
  };
}) {
  const router = useRouter();
  const [serviceDate, setServiceDate] = useState(filters?.serviceDate ?? "");
  const timezone = filters?.timezone ?? "UTC";
  const [slots, setSlots] = useState(filters?.slots ?? []);
  const [selectedSlotId, setSelectedSlotId] = useState(filters?.selectedSlotId ?? "");
  const [currentSummary, setCurrentSummary] = useState(summary);
  const [patients, setPatients] = useState<DoctorQueuePatientRow[]>(initialPatients);
  const [prescriptionsByAppointment, setPrescriptionsByAppointment] = useState<Record<string, ClinicalPrescription>>(
    initialPrescriptions ?? EMPTY_PRESCRIPTIONS,
  );
  const [showQueue, setShowQueue] = useState(filters?.showQueue ?? Boolean(summary));
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [selectedPrescriptionPatient, setSelectedPrescriptionPatient] = useState<DoctorQueuePatientRow | null>(null);
  const [queueTab, setQueueTab] = useState<"live" | "completed">("live");
  const [now, setNow] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const slotRequestId = useRef(0);
  const summaryRequestId = useRef(0);
  const activeServiceDate = useRef(serviceDate);
  const displayedSummary = filters ? currentSummary : summary;

  const livePatients = useMemo(
    () => patients.filter((p: DoctorQueuePatientRow) => p.appointment_status !== "completed" && p.queue_status !== "completed"),
    [patients],
  );
  const completedPatients = useMemo(
    () => patients.filter((p: DoctorQueuePatientRow) => p.appointment_status === "completed" || p.queue_status === "completed"),
    [patients],
  );
  const displayedPatients: DoctorQueuePatientRow[] = queueTab === "live" ? livePatients : completedPatients;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setCurrentSummary(summary);
  }, [summary]);

  useEffect(() => {
    setPatients(initialPatients);
  }, [initialPatients]);

  useEffect(() => {
    if (initialPrescriptions && Object.keys(initialPrescriptions).length > 0) {
      setPrescriptionsByAppointment((prev) => ({ ...prev, ...initialPrescriptions }));
    }
  }, [initialPrescriptions]);

  const handleDateSelect = useCallback(async (nextDate: string) => {
    if (!nextDate || nextDate === activeServiceDate.current) return;

    activeServiceDate.current = nextDate;
    const requestId = ++slotRequestId.current;
    summaryRequestId.current += 1;
    setServiceDate(nextDate);
    setSlots([]);
    setSelectedSlotId("");
    setCurrentSummary(null);
    setPatients([]);
    setShowQueue(false);
    setFilterError(null);
    setLoadingSlots(true);
    setLoadingQueue(false);
    updateQueueUrl(nextDate, null, false);

    try {
      const schedule = await getDoctorSchedule(nextDate);
      if (requestId !== slotRequestId.current) return;
      const availableSlots = schedule.slots
        .filter((slot) => slot.status === "available")
        .map(({ id, slot_start_at, slot_end_at }) => ({
          slot_id: id,
          slot_start_at,
          slot_end_at,
        }));
      setSlots(availableSlots);
      updateQueueUrl(nextDate, null, false);
    } catch {
      if (requestId === slotRequestId.current) {
        setFilterError("Available time slots could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === slotRequestId.current) setLoadingSlots(false);
    }
  }, []);

  const handleSlotChange = useCallback((nextSlotId: string) => {
    summaryRequestId.current += 1;
    setSelectedSlotId(nextSlotId);
    setCurrentSummary(null);
    setPatients([]);
    setShowQueue(false);
    setLoadingQueue(false);
    setFilterError(null);
    updateQueueUrl(serviceDate, nextSlotId || null, false);
  }, [serviceDate]);

  const handleShowQueue = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadingSlots || loadingQueue) return;

    const requestId = ++summaryRequestId.current;
    setLoadingQueue(true);
    setCurrentSummary(null);
    setPatients([]);
    setShowQueue(false);
    setFilterError(null);
    try {
      const result = await loadDoctorQueueSummaryAction(serviceDate, selectedSlotId);
      if (requestId !== summaryRequestId.current) return;
      if (!result.ok) {
        setFilterError(result.error);
        return;
      }
      setCurrentSummary(result.summary);
      setPatients(result.patients);
      if (result.prescriptions) {
        setPrescriptionsByAppointment((prev) => ({ ...prev, ...result.prescriptions }));
      }
      setShowQueue(true);
      setPage(1);
      updateQueueUrl(serviceDate, selectedSlotId || null, true);
    } catch {
      if (requestId === summaryRequestId.current) {
        setFilterError("The selected queue could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === summaryRequestId.current) setLoadingQueue(false);
    }
  }, [loadingQueue, loadingSlots, selectedSlotId, serviceDate]);

  useEffect(() => {
    if (compact || !filters) {
      const timer = window.setInterval(() => router.refresh(), 10_000);
      return () => window.clearInterval(timer);
    }
    if (!showQueue) return;

    const timer = window.setInterval(() => {
      const requestId = ++summaryRequestId.current;
      void loadDoctorQueueSummaryAction(serviceDate, selectedSlotId)
        .then((result) => {
          if (requestId !== summaryRequestId.current) return;
          if (!result.ok) {
            setCurrentSummary(null);
            setPatients([]);
            setShowQueue(false);
            setFilterError(result.error);
            return;
          }
          setCurrentSummary(result.summary);
          setPatients(result.patients);
          if (result.prescriptions) {
            setPrescriptionsByAppointment((prev) => ({ ...prev, ...result.prescriptions }));
          }
          setFilterError(null);
        })
        .catch(() => {
          if (requestId === summaryRequestId.current) {
            setCurrentSummary(null);
            setPatients([]);
            setShowQueue(false);
            setFilterError("The queue could not be refreshed. Please try again.");
          }
        });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [compact, filters, router, selectedSlotId, serviceDate, showQueue]);

  const totalPages = Math.max(1, Math.ceil(displayedPatients.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, displayedPatients.length);
  const paginatedPatients = displayedPatients.slice(startIndex, endIndex);

  const hasActiveConsultation = patients.some(
    (p) => p.queue_status === "called" || p.queue_status === "in_consultation",
  );
  const nextWaitingPatient = patients
    .filter((p) => p.queue_status === "waiting" && p.checked_in_at !== null)
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0))[0] ?? null;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" aria-label="Queue overview" aria-live="polite" aria-busy={loadingSlots || loadingQueue}>
      <h1 className="sr-only">Your patient queue</h1>
      {compact && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Current / nearest session</h2>
            {displayedSummary && (
              <p className="mt-1 text-sm text-muted-foreground">
                Session {slotRange(displayedSummary.slot_start_at, displayedSummary.slot_end_at, displayedSummary.timezone)} · {displayedSummary.timezone}
              </p>
            )}
          </div>
          <Button asChild size="sm" variant="outline"><Link href="/doctor/queue">View queue summary</Link></Button>
        </div>
      )}
      {!compact && filters && (
        <form
          onSubmit={handleShowQueue}
          className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.5fr)_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <label htmlFor="doctor-queue-date" className="text-xs font-semibold">Date</label>
            <CustomDatePicker
              id="doctor-queue-date"
              name="date"
              value={serviceDate}
              onChange={handleDateSelect}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="doctor-queue-slot" className="text-xs font-semibold">Time slot</label>
            <CustomSelect
              id="doctor-queue-slot"
              name="slot"
              value={selectedSlotId}
              onValueChange={handleSlotChange}
              disabled={loadingSlots}
              placeholder={loadingSlots ? "Loading available slots…" : "All slots"}
              options={[
                { value: "", label: "All slots" },
                ...slots.map((slot) => ({ value: slot.slot_id, label: slotRange(slot.slot_start_at, slot.slot_end_at, timezone) })),
              ]}
            />
          </div>
          <Button type="submit" disabled={loadingSlots || loadingQueue}>
            {loadingQueue ? "Loading queue…" : "Show queue"}
          </Button>
        </form>
      )}
      {loadingSlots && <p role="status" className="text-sm text-muted-foreground">Loading available time slots…</p>}
      {loadingQueue && <p role="status" className="text-sm text-muted-foreground">Loading queue…</p>}
      {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
      {!loadingSlots && !loadingQueue && !displayedSummary && !filterError ? (
        <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
          {filters && slots.length === 0 && !loadingSlots
            ? "There are no slots on this date."
            : filters && !showQueue
              ? "Select Show queue to load the queue."
              : "There are no booked patients in this queue yet."}
        </p>
      ) : displayedSummary ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Current token</p>
              <p className="mt-1 text-2xl font-bold">{tokenLabel(displayedSummary.current_token)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Next token</p>
              <p className="mt-1 text-2xl font-bold">{tokenLabel(displayedSummary.next_token)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Waiting</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{displayedSummary.waiting}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{displayedSummary.completed}</p>
            </div>
          </div>

          {/* Patient Queue Section Below Metrics */}
          {!compact && (
            <div className="space-y-3 pt-3 border-t">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold sm:text-base text-foreground">Patient Queue</h3>
                  <Badge variant="outline" className="text-xs">
                    {patients.length} {patients.length === 1 ? "patient" : "patients"}
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 text-xs self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => { setQueueTab("live"); setPage(1); }}
                    className={cn(
                      "rounded-lg px-3 py-1 font-semibold transition-all text-xs",
                      queueTab === "live"
                        ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Live Queue ({livePatients.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setQueueTab("completed"); setPage(1); }}
                    className={cn(
                      "rounded-lg px-3 py-1 font-semibold transition-all text-xs",
                      queueTab === "completed"
                        ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Completed ({completedPatients.length})
                  </button>
                </div>
              </div>

              {displayedPatients.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  {queueTab === "live"
                    ? "No active or waiting patients in this live queue."
                    : "No completed patient consultations yet for this session."}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                          <th scope="col" className="w-24 px-3.5 py-3">Token & Pos</th>
                          <th scope="col" className="min-w-[140px] px-3.5 py-3">Patient</th>
                          <th scope="col" className="w-36 px-3.5 py-3">Slot Time</th>
                          <th scope="col" className="w-28 px-3.5 py-3">Checked In</th>
                          <th scope="col" className="w-32 px-3.5 py-3">Status</th>
                          <th scope="col" className="min-w-[260px] px-3.5 py-3 text-right whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {paginatedPatients.map((patient: DoctorQueuePatientRow) => {
                          const isInRoom = patient.queue_status === "in_consultation";
                          const isCalled = patient.queue_status === "called";
                          const isWaiting = patient.queue_status === "waiting" && patient.checked_in_at !== null;
                          const isSkipped = patient.queue_status === "skipped";
                          const isFinished = patient.appointment_status === "completed" || patient.queue_status === "completed";
                          const isUnavailable = patient.attendance_status === "no_show";

                          const canCallNext =
                            patient.appointment_status === "confirmed" &&
                            patient.checked_in_at !== null &&
                            patient.queue_status === "waiting" &&
                            nextWaitingPatient?.appointment_id === patient.appointment_id &&
                            !hasActiveConsultation;
                          const isCheckedIn = patient.checked_in_at !== null || isInRoom || isCalled;
                          const showActions = isCheckedIn && !isFinished && !isUnavailable;
                          const existingRx = prescriptionsByAppointment[patient.appointment_id];
                          const hasPrescription = Boolean(existingRx);
                          const commands: QueueCommand[] = [
                            "call_next",
                            patient.queue_status === "skipped" ? "return" : "skip",
                            "complete",
                          ];

                          return (
                            <tr
                              key={patient.appointment_id}
                              className={cn(
                                "transition-colors hover:bg-muted/30",
                                isInRoom && "bg-primary/5 font-medium border-l-4 border-l-primary",
                                isCalled && "bg-amber-500/5 font-medium border-l-4 border-l-amber-500",
                                isUnavailable && "bg-destructive/5 opacity-80",
                                isFinished && "opacity-75 bg-muted/15",
                              )}
                            >
                              {/* Column 1: Token & Queue position */}
                              <td className="px-3.5 py-3 align-middle whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs font-bold sm:text-sm">
                                  <span>{tokenLabel(patient.token_number)}</span>
                                  {patient.queue_position !== null && patient.checked_in_at && (
                                    <span className="text-[10px] text-muted-foreground font-normal">#{patient.queue_position}</span>
                                  )}
                                </div>
                              </td>

                              {/* Column 2: Patient name and phone */}
                              <td className="px-3.5 py-3 align-middle">
                                <div className="font-semibold text-foreground text-sm leading-tight">{patient.patient_name}</div>
                                {patient.patient_phone && (
                                  <div className="text-xs text-muted-foreground mt-0.5">{patient.patient_phone}</div>
                                )}
                              </td>

                              {/* Column 3: Slot time range */}
                              <td className="px-3.5 py-3 align-middle text-xs text-muted-foreground whitespace-nowrap">
                                {slotRange(patient.slot_start_at, patient.slot_end_at, patient.timezone)}
                              </td>

                              {/* Column 4: Checked In Time */}
                              <td className="px-3.5 py-3 align-middle text-xs whitespace-nowrap">
                                {patient.checked_in_at ? (
                                  <span className="font-medium text-foreground/90">
                                    {timeFormatted(patient.checked_in_at, patient.timezone)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>

                              {/* Column 5: Status badge */}
                              <td className="px-3.5 py-3 align-middle whitespace-nowrap">
                                {isInRoom ? (
                                  <Badge variant="default" className="animate-pulse px-2 py-0.5 text-xs">
                                    In Room
                                  </Badge>
                                ) : isCalled ? (
                                  <Badge variant="outline" className="border-amber-500 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                                    Calling
                                  </Badge>
                                ) : isWaiting ? (
                                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                                    Checked in
                                  </Badge>
                                ) : isSkipped ? (
                                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs">
                                    Skipped
                                  </Badge>
                                ) : isUnavailable ? (
                                  <Badge variant="destructive" className="px-2 py-0.5 text-xs">
                                    Unavailable
                                  </Badge>
                                ) : isFinished ? (
                                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                                    Completed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    Not arrived
                                  </Badge>
                                )}
                              </td>

                              {/* Column 6: Actions / Status */}
                              <td className="px-3.5 py-3 align-middle text-right whitespace-nowrap">
                                {isFinished ? (
                                  <div className="inline-flex items-center gap-1.5 justify-end flex-nowrap whitespace-nowrap">
                                    <Button asChild size="sm" variant="outline" className="h-8 text-xs font-semibold rounded-lg">
                                      <Link href={`/doctor/queue/${patient.appointment_id}/history`}>History</Link>
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => setSelectedPrescriptionPatient(patient)}
                                      className={cn(
                                        "h-8 text-xs font-semibold text-white shadow-2xs gap-1.5 rounded-lg",
                                        hasPrescription
                                          ? "bg-emerald-600 hover:bg-emerald-700"
                                          : "bg-sky-600 hover:bg-sky-700",
                                      )}
                                    >
                                      {hasPrescription ? (
                                        <>
                                          <Pencil className="size-3" />
                                          <span>Edit Prescription</span>
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="size-3.5" />
                                          <span>Add Prescription</span>
                                        </>
                                      )}
                                    </Button>
                                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Completed</Badge>
                                  </div>
                                ) : showActions ? (
                                  <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
                                    {isInRoom && (
                                      <>
                                        <Button asChild size="sm" variant="outline" className="h-8 text-xs font-semibold">
                                          <Link href={`/doctor/queue/${patient.appointment_id}/history`}>History</Link>
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => setSelectedPrescriptionPatient(patient)}
                                          className={cn(
                                            "h-8 text-xs font-semibold text-white shadow-2xs gap-1.5",
                                            hasPrescription
                                              ? "bg-emerald-600 hover:bg-emerald-700"
                                              : "bg-sky-600 hover:bg-sky-700",
                                          )}
                                        >
                                          {hasPrescription ? (
                                            <>
                                              <Pencil className="size-3" />
                                              <span>Edit Prescription</span>
                                            </>
                                          ) : (
                                            <>
                                              <Plus className="size-3.5" />
                                              <span>Add Prescription</span>
                                            </>
                                          )}
                                        </Button>
                                      </>
                                    )}
                                    <QueueActionControls
                                      row={patient}
                                      canCallNext={canCallNext}
                                      now={now}
                                      commands={commands}
                                      compact
                                    />
                                  </div>
                                ) : isInRoom ? (
                                  <div className="inline-flex items-center gap-1.5 justify-end flex-nowrap whitespace-nowrap">
                                    <Button asChild size="sm" variant="outline" className="h-7 text-xs font-semibold">
                                      <Link href={`/doctor/queue/${patient.appointment_id}/history`}>History</Link>
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => setSelectedPrescriptionPatient(patient)}
                                      className={cn(
                                        "h-7 text-xs font-semibold text-white gap-1",
                                        hasPrescription
                                          ? "bg-emerald-600 hover:bg-emerald-700"
                                          : "bg-sky-600 hover:bg-sky-700",
                                      )}
                                    >
                                      {hasPrescription ? (
                                        <>
                                          <Pencil className="size-3" />
                                          <span>Edit Prescription</span>
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="size-3.5" />
                                          <span>Add Prescription</span>
                                        </>
                                      )}
                                    </Button>
                                    <span className="text-xs font-semibold text-primary ml-1">In consultation</span>
                                  </div>
                                ) : isCalled ? (
                                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Called to room</span>
                                ) : isWaiting ? (
                                  <span className="text-xs text-muted-foreground">Waiting ({patient.queue_position ? `#${patient.queue_position}` : "checked in"})</span>
                                ) : isSkipped ? (
                                  <span className="text-xs text-amber-600 dark:text-amber-400">Skipped</span>
                                ) : isUnavailable ? (
                                  <span className="text-xs text-destructive font-medium">Unavailable</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Awaiting check-in</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination if displayedPatients > 10 */}
                  {displayedPatients.length > pageSize && (
                    <div className="flex items-center justify-between border-t bg-muted/10 p-2 text-xs text-muted-foreground rounded-lg">
                      <span>{startIndex + 1}–{endIndex} of {displayedPatients.length} patients</span>
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
                          <ChevronLeft className="size-3 mr-0.5" /> Previous
                        </Button>
                        <span className="px-1.5 font-medium">{currentPage}/{totalPages}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                          aria-label="Next page"
                        >
                          Next <ChevronRight className="size-3 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {selectedPrescriptionPatient && (
        <DoctorPrescriptionDialog
          open={Boolean(selectedPrescriptionPatient)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedPrescriptionPatient(null);
          }}
          appointmentId={selectedPrescriptionPatient.appointment_id}
          patientName={selectedPrescriptionPatient.patient_name}
          patientPhone={selectedPrescriptionPatient.patient_phone}
          doctorName={doctorInfo?.name || "Doctor"}
          doctorSpecialty={doctorInfo?.specialty}
          clinicName={doctorInfo?.clinicName}
          initialPrescription={prescriptionsByAppointment[selectedPrescriptionPatient.appointment_id] ?? null}
          onPrescriptionSaved={(newRx) => {
            setPrescriptionsByAppointment((prev) => ({
              ...prev,
              [newRx.appointment_id]: newRx,
            }));
            setSelectedPrescriptionPatient(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
