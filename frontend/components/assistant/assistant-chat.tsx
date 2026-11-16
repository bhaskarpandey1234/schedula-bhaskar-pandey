"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Bot,
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  Globe,
  History,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assistantBookingPreviewRequiredText, assistantErrorCanRetry, assistantErrorMessage, assistantIsFreeformSlotPrompt, assistantIsUnstructuredBookingPreview, assistantLanguageOptions, assistantTypedSlotSelectionRequiredText, speechRecognitionLanguage, speechSynthesisLanguage } from "@/lib/assistant/presentation";
import { conversationTitle } from "@/lib/assistant/history";
import { formatLocalDate, formatLocalSlotRange, formatSchedulingWindow } from "@/lib/scheduling/time";
import type { AssistantDisplayPayload, AssistantRole, BookingPreview, PendingAssistantAction } from "@/lib/assistant/types";

type ProposalDecisionSelection = { proposalId: string; decision: "approve" | "cancel" | "choose_slot"; slotId?: string };
type PatientAppointmentSelection = { appointmentId: string; action: "cancel" | "reschedule" };
type RescheduleSlotSelection = { appointmentId: string; slotId: string };
type Message = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  displays?: AssistantDisplayPayload[];
  pendingAction?: PendingAssistantAction;
  retryText?: string;
  retrySelection?: AssistantSelection;
  staleAction?: boolean;
};

function formatTimestamp(value?: string) {
  if (!value) {
    return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (/^\d{1,2}:\d{2}(\s*(?:AM|PM|am|pm))?$/i.test(value.trim())) {
    return value.trim();
  }
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  } catch {
    // fallback
  }
  return value;
}
type AssistantSelection = { selectedDoctorId?: string; selectedSlotId?: string; selectedProposalDecision?: ProposalDecisionSelection; selectedPatientAppointment?: PatientAppointmentSelection; selectedRescheduleSlot?: RescheduleSlotSelection };
type Conversation = { id: string; title: string; role: AssistantRole; created_at: string; updated_at: string };
type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";
type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null; onend: (() => void) | null; onerror: ((event?: { error?: string }) => void) | null };
type CheckoutSession = { paymentId: string; orderId: string; keyId: string; amountMinor: number; currency: string; prefill?: { name?: string; email?: string; contact?: string } };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (event: string, handler: (response: { error?: { description?: string; reason?: string } }) => void) => void }; } }

function getRecognition() { const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition; return Constructor ? new Constructor() : null; }
const VOICE_SILENCE_TIMEOUT_MS = 3_500;
const HISTORY_REMOVE_ANIMATION = "assistant-history-remove";
function confirmationDecision(text: string): "confirm" | "decline" | null { const normalized = text.trim().toLocaleLowerCase().replace(/[.!?,。！？]+$/g, ""); if (/^(yes|y|confirm|confirm it|go ahead|haan|han|हाँ|ठीक|ठीक है)$/.test(normalized)) return "confirm"; if (/^(no|n|decline|cancel|don't|do not|nahin|nahi|नहीं|नही)$/.test(normalized)) return "decline"; return null; }
function formatValue(value: unknown) { if (value === null || value === undefined) return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function nextConversationTitle(conversations: Conversation[]) {
  const sequence = conversations.reduce((highest, conversation) => {
    const match = /^New chat (\d+)$/.exec(conversation.title);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `New chat ${sequence + 1}`;
}
function isUntitledConversation(title: string) {
  return title === "New conversation" || /^New chat \d+$/.test(title);
}
function actionConfirmLabel(action: PendingAssistantAction) {
  if (action.actionType === "booking") return "Continue to payment";
  if (action.actionType === "cancellation") return "Confirm cancellation";
  if (action.actionType === "reschedule") return "Confirm rescheduling";
  if (action.actionType === "doctor_cancellation") return "Cancel appointment";
  if (action.actionType === "doctor_slot_cancellation") return "Cancel availability slot";
  if (action.actionType === "doctor_completion") return "Mark appointment completed";
  if (action.actionType === "doctor_prescription") return "Publish prescription";
  if (action.actionType === "elastic_adjustment") return "Apply schedule change and notify patients";
  if (action.actionType === "availability_creation") return "Create availability";
  if (action.actionType === "doctor_leave") return "Cancel session and notify patients";
  if (action.actionType === "elastic_proposal_decision" && action.preview.operation === "elastic_proposal_decision" && action.preview.decision === "cancel") return "Cancel appointment and request refund";
  return "Confirm appointment change";
}
function actionSuccessText(action: PendingAssistantAction) {
  if (action.actionType === "doctor_cancellation") return "The appointment was cancelled and the patient was notified.";
  if (action.actionType === "doctor_slot_cancellation") return "The availability slot was cancelled.";
  if (action.actionType === "doctor_completion") return "The appointment was marked completed.";
  if (action.actionType === "doctor_prescription") return "The prescription was published to the patient.";
  if (action.actionType === "elastic_adjustment") return "The schedule change was applied and affected patients were notified.";
  if (action.actionType === "availability_creation") return "The availability was created.";
  if (action.actionType === "doctor_leave") return "The session was cancelled as leave and affected patients were notified.";
  if (action.actionType === "elastic_proposal_decision" && action.preview.operation === "elastic_proposal_decision" && action.preview.decision === "cancel") return "The appointment was cancelled and any applicable full refund was requested.";
  if (action.actionType === "elastic_proposal_decision") return "Your appointment change choice was applied.";
  if (action.actionType === "reschedule") return "The appointment was rescheduled.";
  if (action.actionType === "cancellation") return "The appointment was cancelled. Check payment history for any refund status.";
  return "The appointment is ready for payment.";
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatConsultationFee(amountMinor: unknown, currency: unknown) {
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || currency !== "INR") return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function BookingPreviewDetails({ preview }: { preview: BookingPreview }) {
  const fee = formatConsultationFee(preview.consultation_fee_minor, preview.consultation_currency);
  const dateTime = preview.slot_start_at && preview.slot_end_at && preview.timezone
    ? `${formatLocalDate(preview.slot_start_at, preview.timezone)}, ${formatLocalSlotRange(preview.slot_start_at, preview.slot_end_at, preview.timezone)} (${preview.timezone})`
    : "Appointment time unavailable";
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <div>
        <dt className="font-medium">Doctor</dt>
        <dd>{preview.doctor_name ?? "Doctor unavailable"}</dd>
      </div>
      {preview.clinic_name && (
        <div>
          <dt className="font-medium">Clinic</dt>
          <dd>{preview.clinic_name}</dd>
        </div>
      )}
      <div>
        <dt className="font-medium">Date and time</dt>
        <dd>{dateTime}</dd>
      </div>
      {fee && (
        <div>
          <dt className="font-medium">Consultation fee</dt>
          <dd>{fee}</dd>
        </div>
      )}
    </dl>
  );
}

function ResultCard({ display, onSelectDoctor, onSelectSlot, onSelectProposalDecision, onSelectPatientAppointment, onSelectRescheduleSlot, interactiveDoctors, interactiveSlots, interactiveAppointments, disabled }: {
  display: AssistantDisplayPayload;
  onSelectDoctor?: (doctorId: string, doctorName: string) => void;
  onSelectSlot?: (slotId: string, label: string) => void;
  onSelectProposalDecision?: (selection: ProposalDecisionSelection, label: string) => void;
  onSelectPatientAppointment?: (selection: PatientAppointmentSelection, label: string) => void;
  onSelectRescheduleSlot?: (selection: RescheduleSlotSelection, label: string) => void;
  interactiveDoctors?: boolean;
  interactiveSlots?: boolean;
  interactiveAppointments?: boolean;
  disabled?: boolean;
}) {
  const [showCandidates, setShowCandidates] = useState(false);
  const values = Array.isArray(display.data) ? display.data : display.data === undefined ? [] : [display.data];

  if (display.kind === "doctors") {
    return (
      <section className="mt-4 rounded-xl border bg-background/70 p-3 sm:p-4" aria-label="Verified doctor results">
        <h3 className="text-sm font-semibold">{display.title}</h3>
        {values.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No verified doctors were returned by the directory.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {values.slice(0, 12).map((value, index) => {
              const row = asRecord(value);
              if (!row) return null;
              const name = typeof row.full_name === "string" ? row.full_name : "Doctor name unavailable";
              const doctorId = typeof row.doctor_id === "string" ? row.doctor_id : undefined;
              const fee = formatConsultationFee(row.consultation_fee_minor, row.consultation_currency);
              return (
                <article key={typeof row.doctor_id === "string" ? row.doctor_id : `${name}-${index}`} className="min-w-0 rounded-xl border bg-card p-3 text-sm">
                  <h4 className="font-semibold">{name}</h4>
                  {typeof row.specialty === "string" && <p className="mt-1 text-muted-foreground">{row.specialty}</p>}
                  {typeof row.clinic_name === "string" && <p className="mt-1">{row.clinic_name}</p>}
                  {typeof row.experience_years === "number" && <p className="mt-1">{row.experience_years} years of experience</p>}
                  <p className="mt-2 font-medium">{fee ?? "Fee unavailable"}</p>
                  {interactiveDoctors && doctorId && onSelectDoctor && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      aria-label={`See available times for ${name}`}
                      onClick={() => onSelectDoctor(doctorId, name)}
                      disabled={disabled}
                    >
                      See available times
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (display.kind === "slots") {
    return (
      <section className="mt-4 rounded-xl border bg-background/70 p-3 sm:p-4" aria-label="Available appointment slots">
        <h3 className="text-sm font-semibold">{display.title}</h3>
        {values.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No available appointment slots were returned.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {values.slice(0, 12).map((value, index) => {
              const row = asRecord(value);
              if (!row || typeof row.slot_start_at !== "string" || typeof row.slot_end_at !== "string" || typeof row.timezone !== "string") {
                return <p key={index} className="rounded-lg border p-3 text-sm text-muted-foreground">This slot&apos;s details are unavailable. Refresh the available times.</p>;
              }
              const date = formatLocalDate(row.slot_start_at, row.timezone);
              const range = formatLocalSlotRange(row.slot_start_at, row.slot_end_at, row.timezone);
              const label = `${date}, ${range}`;
              const slotId = typeof row.slot_id === "string" ? row.slot_id : undefined;
              return (
                <article key={slotId ?? `${row.slot_start_at}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{date}</p>
                    <p className="mt-1 font-semibold">{range}</p>
                  </div>
                  {interactiveSlots && slotId && onSelectSlot && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Choose appointment slot: ${label}`}
                      onClick={() => onSelectSlot(slotId, label)}
                      disabled={disabled}
                    >
                      Choose
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (display.kind === "elastic_proposals") {
    return (
      <section className="mt-4 grid gap-3 rounded-xl border bg-background/70 p-3 sm:p-4" aria-label="Appointment changes needing your decision">
        <h3 className="text-sm font-semibold">{display.title}</h3>
        {values.length === 0 ? <p className="text-sm text-muted-foreground">There are no pending appointment changes.</p> : values.slice(0, 10).map((value) => {
          const row = asRecord(value);
          if (!row || typeof row.id !== "string" || typeof row.appointment_id !== "string") return null;
          const proposalId = row.id;
          const timezone = typeof row.timezone === "string" ? row.timezone : "Asia/Kolkata";
          const oldTime = typeof row.old_start_at === "string" && typeof row.old_end_at === "string" ? `${formatLocalDate(row.old_start_at, timezone)} ${formatLocalSlotRange(row.old_start_at, row.old_end_at, timezone)}` : "Current time unavailable";
          const recommended = typeof row.recommended_start_at === "string" ? `${formatLocalDate(row.recommended_start_at, timezone)} ${formatLocalSlotRange(row.recommended_start_at, String(row.recommended_end_at ?? row.recommended_start_at), timezone)}` : null;
          const candidates = Array.isArray(row.candidates) ? row.candidates : [];
          return <article key={proposalId} className="grid gap-2 rounded-lg border bg-card p-3 text-sm">
            <p className="font-medium">{typeof row.doctor_name === "string" ? `${row.doctor_name} · ` : "Appointment change · "}{oldTime}</p>
            {recommended && <p>Recommended: {recommended}</p>}
            <p suppressHydrationWarning className="text-xs text-muted-foreground">Respond by {typeof row.decision_deadline === "string" ? new Date(row.decision_deadline).toLocaleString() : "the deadline shown in your appointment"}.</p>
            <div className="flex flex-wrap gap-2">
              {typeof row.recommended_slot_id === "string" && onSelectProposalDecision && <Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelectProposalDecision({ proposalId, decision: "approve" }, "Approve recommended time")}>Approve recommended time</Button>}
              {onSelectProposalDecision && <Button size="sm" variant="outline" disabled={disabled || candidates.length === 0} onClick={() => setShowCandidates((current) => !current)}>Choose another time</Button>}
              {onSelectProposalDecision && <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onSelectProposalDecision({ proposalId, decision: "cancel" }, "Cancel appointment and request refund")}>Cancel + request refund</Button>}
            </div>
            {showCandidates && candidates.map((candidate) => {
              const slot = asRecord(candidate);
              if (!slot || typeof slot.slot_id !== "string" || typeof slot.slot_start_at !== "string" || typeof slot.slot_end_at !== "string") return null;
              const time = `${formatLocalDate(slot.slot_start_at, timezone)} ${formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, timezone)}`;
              return <Button key={slot.slot_id} size="sm" variant="outline" className="justify-start" disabled={disabled} onClick={() => onSelectProposalDecision?.({ proposalId, decision: "choose_slot", slotId: slot.slot_id as string }, `Choose ${time}`)}>{time}</Button>;
            })}
          </article>;
        })}
      </section>
    );
  }

  if (display.kind === "reschedule_slots") {
    return (
      <section className="mt-4 grid gap-2 rounded-xl border bg-background/70 p-3 sm:p-4" aria-label="Available rescheduling options">
        <h3 className="text-sm font-semibold">{display.title}</h3>
        {values.length === 0 ? <p className="text-sm text-muted-foreground">No eligible same-doctor appointment times are available right now.</p> : values.slice(0, 20).map((value) => {
          const row = asRecord(value);
          if (!row || typeof row.appointment_id !== "string" || typeof row.slot_id !== "string" || typeof row.slot_start_at !== "string" || typeof row.slot_end_at !== "string" || typeof row.timezone !== "string") return null;
          const label = `${formatLocalDate(row.slot_start_at, row.timezone)}, ${formatLocalSlotRange(row.slot_start_at, row.slot_end_at, row.timezone)}`;
          return <Button key={row.slot_id} type="button" variant="outline" className="justify-start" disabled={disabled} aria-label={`Choose rescheduling slot: ${label}`} onClick={() => onSelectRescheduleSlot?.({ appointmentId: row.appointment_id as string, slotId: row.slot_id as string }, label)}>{label}</Button>;
        })}
      </section>
    );
  }

  if (display.kind === "appointments") {
    return (
      <section className="mt-4 grid gap-3 rounded-xl border bg-background/70 p-3 sm:p-4" aria-label={display.title}>
        <h3 className="text-sm font-semibold">{display.title}</h3>
        {interactiveAppointments === false && <p className="text-sm text-muted-foreground">{values.length} {values.length === 1 ? "appointment" : "appointments"}</p>}
        {values.length === 0 ? <p className="text-sm text-muted-foreground">No appointments were found.</p> : values.map((value, index) => {
          const row = asRecord(value);
          if (!row) return null;
          const appointmentId = typeof row.appointment_id === "string" ? row.appointment_id : undefined;
          const isDoctorAppointment = interactiveAppointments === false;
          const name = isDoctorAppointment ? "Appointment" : typeof row.doctor_name === "string" ? row.doctor_name : typeof row.patient_name === "string" ? row.patient_name : "Appointment";
          const timezone = typeof row.timezone === "string" ? row.timezone : "Asia/Kolkata";
          const schedulingType = row.scheduling_type === "stream" ? "stream" : "wave";
          const when = typeof row.slot_start_at === "string" && typeof row.slot_end_at === "string" ? `${formatLocalDate(row.slot_start_at, timezone)}, ${formatSchedulingWindow(row.slot_start_at, row.slot_end_at, timezone, schedulingType)}` : "Time unavailable";
          const canChange = interactiveAppointments && appointmentId && row.status === "confirmed";
          return <article key={appointmentId ?? index} className="grid gap-1 rounded-lg border bg-card p-3 text-sm">
            <p className="font-semibold">{name}</p>
            <p>{when} ({timezone})</p>
            {typeof row.clinic_name === "string" && <p className="text-muted-foreground">{row.clinic_name}</p>}
            <p className="capitalize text-muted-foreground">{String(row.status ?? "status unavailable").replaceAll("_", " ")}</p>
            {isDoctorAppointment && <p className="text-muted-foreground">Patient count: {typeof row.patient_count === "number" ? row.patient_count : 1}</p>}
            {isDoctorAppointment && <p className="text-muted-foreground">{typeof row.reason === "string" && row.reason.trim() ? `Visit reason: ${row.reason}` : "No specific visit reason provided by patient."}</p>}
            {canChange && <div className="mt-2 flex flex-wrap gap-2">
              {appointmentId && <Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelectPatientAppointment?.({ appointmentId, action: "reschedule" }, `Find another time for ${name}`)}>Reschedule</Button>}
              {appointmentId && <Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelectPatientAppointment?.({ appointmentId, action: "cancel" }, `Cancel appointment with ${name}`)}>Cancel</Button>}
            </div>}
          </article>;
        })}
      </section>
    );
  }

  return (
    <details className="mt-4 rounded-xl border bg-background/70 p-3 sm:p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">{display.title}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {values.slice(0, 12).map((value, index) => (
          <div key={index} className="min-w-0 rounded-xl border bg-card p-3 text-xs">
            {asRecord(value) ? (
              <dl className="grid gap-2">
                {Object.entries(asRecord(value) ?? {})
                  .filter(([key]) => key !== "notes")
                  .slice(0, 8)
                  .map(([key, item]) => (
                    <div key={key} className="grid gap-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <dt className="capitalize text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                      <dd className="break-words font-medium">{formatValue(item)}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="break-words">{formatValue(value)}</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function AssistantChat({ role, compact = false, onClose }: { role: AssistantRole; compact?: boolean; onClose?: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: role === "doctor"
        ? "I can check your schedule, appointments, conflicts, and availability."
        : "I can find doctors, check slots, and manage your appointments with confirmation.",
    },
  ]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [historyBusy, setHistoryBusy] = useState(true);
  const [conversationLoadingId, setConversationLoadingId] = useState<string>();
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const [editingConversationId, setEditingConversationId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState<string>();
  const [conversationToDelete, setConversationToDelete] = useState<Conversation>();
  const [deletingConversationId, setDeletingConversationId] = useState<string>();
  const [removingConversationId, setRemovingConversationId] = useState<string>();
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState(""); const [language, setLanguage] = useState("en-IN"); const [busy, setBusy] = useState(false); const [voiceState, setVoiceState] = useState<VoiceState>("idle"); const [voiceActive, setVoiceActive] = useState(false); const [oneTurnActive, setOneTurnActive] = useState(false); const [voiceDetected, setVoiceDetected] = useState(false); const [voiceError, setVoiceError] = useState<string>(); const [actionBusy, setActionBusy] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null); const voiceEnabledRef = useRef(false); const oneTurnActiveRef = useRef(false); const oneTurnTranscriptRef = useRef(""); const continuousTranscriptRef = useRef(""); const oneTurnSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const voiceActivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const speakingRef = useRef(false); const languageRef = useRef(language); const messagesRef = useRef(messages); const busyRef = useRef(false); const requestControllerRef = useRef<AbortController | null>(null); const conversationLoadVersionRef = useRef(0); const bottomRef = useRef<HTMLDivElement>(null); const sendRef = useRef<(value?: string, selection?: AssistantSelection) => Promise<void>>(async () => undefined);
  useEffect(() => { messagesRef.current = messages; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const greeting = role === "doctor" ? "I can check your schedule, appointments, conflicts, and availability." : "I can find doctors, check slots, and manage your appointments with confirmation.";
  const startContinuousRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !voiceEnabledRef.current || busyRef.current || speakingRef.current) return;
    recognition.lang = speechRecognitionLanguage(languageRef.current);
    try { recognition.start(); setVoiceState("listening"); } catch { /* the browser may still be stopping the previous capture */ }
  }, []);
  const clearOneTurnSilenceTimer = useCallback(() => {
    if (oneTurnSilenceTimerRef.current !== null) clearTimeout(oneTurnSilenceTimerRef.current);
    oneTurnSilenceTimerRef.current = null;
  }, []);
  const clearVoiceActivityTimer = useCallback(() => {
    if (voiceActivityTimerRef.current !== null) clearTimeout(voiceActivityTimerRef.current);
    voiceActivityTimerRef.current = null;
  }, []);
  const markVoiceActivity = useCallback(() => {
    setVoiceDetected(true);
    clearVoiceActivityTimer();
    voiceActivityTimerRef.current = setTimeout(() => setVoiceDetected(false), 350);
  }, [clearVoiceActivityTimer]);
  const stopVoiceForNavigation = useCallback(() => {
    voiceEnabledRef.current = false;
    oneTurnActiveRef.current = false;
    speakingRef.current = false;
    setVoiceActive(false);
    setOneTurnActive(false);
    setVoiceDetected(false);
    clearOneTurnSilenceTimer();
    clearVoiceActivityTimer();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoiceState("idle");
  }, [clearOneTurnSilenceTimer, clearVoiceActivityTimer]);
  const stopActiveRequest = useCallback(() => {
    const controller = requestControllerRef.current;
    if (!controller) return;
    requestControllerRef.current = null;
    controller.abort();
    busyRef.current = false;
    setBusy(false);
  }, []);
  const loadConversation = useCallback(async (id: string) => {
    const loadVersion = ++conversationLoadVersionRef.current;
    stopActiveRequest();
    stopVoiceForNavigation();
    setConversationLoadingId(id);
    setConversationId(undefined);
    setInput("");
    setMessages([]);
    messagesRef.current = [];
    setHistoryError(undefined);
    try {
      const response = await fetch(`/api/assistant/conversations/${id}?role=${role}`);
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      const next = payload.messages?.length
        ? payload.messages.map((m) => ({ ...m, timestamp: formatTimestamp(m.timestamp) }))
        : [{ role: "assistant" as const, text: greeting, timestamp: formatTimestamp() }];
      if (conversationLoadVersionRef.current === loadVersion) {
        setConversationId(id); setMessages(next); messagesRef.current = next;
      }
    } catch {
      if (conversationLoadVersionRef.current === loadVersion) {
        setHistoryError("Chat history could not be loaded. Please try again.");
        setShowHistory(true);
      }
    } finally {
      if (conversationLoadVersionRef.current === loadVersion) setConversationLoadingId(undefined);
    }
  }, [greeting, role, stopActiveRequest, stopVoiceForNavigation]);
  const loadConversations = useCallback(async () => {
    setHistoryBusy(true); setHistoryError(undefined);
    try {
      const response = await fetch(`/api/assistant/conversations?role=${role}`);
      const payload = await response.json() as { conversations?: Conversation[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      const next = payload.conversations ?? []; setConversations(next);
      if (next[0]) await loadConversation(next[0].id);
      else {
        const welcome = [{ role: "assistant" as const, text: greeting, timestamp: formatTimestamp() }];
        setConversationId(undefined); setMessages(welcome); messagesRef.current = welcome;
      }
    } catch { setHistoryError("Chat history could not be loaded. You can still start a new chat."); }
    finally { setHistoryBusy(false); }
  }, [greeting, loadConversation, role]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  const newConversation = async () => {
    setNewChatBusy(true); setHistoryError(undefined);
    setShowHistory(false);
    conversationLoadVersionRef.current += 1;
    setConversationLoadingId(undefined);
    stopActiveRequest();
    stopVoiceForNavigation();
    setInput("");
    try {
      const title = nextConversationTitle(conversations);
      const response = await fetch("/api/assistant/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, title }) });
      const payload = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error);
      setConversations((current) => [payload.conversation!, ...current]); setConversationId(payload.conversation.id);
      const next = [{ role: "assistant" as const, text: greeting, timestamp: formatTimestamp() }]; setMessages(next); messagesRef.current = next;
      setShowHistory(false);
    } catch {
      setHistoryError("A new chat could not be created. Please try again.");
      setShowHistory(true);
    } finally { setNewChatBusy(false); }
  };
  const renameConversation = async (id: string) => {
    const title = editingTitle.trim();
    if (!title || renamingConversationId) return;
    setRenamingConversationId(id); setHistoryError(undefined);
    try {
      const response = await fetch(`/api/assistant/conversations/${id}?role=${role}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      const payload = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error);
      setConversations((current) => current.map((item) => item.id === id ? payload.conversation! : item));
      setEditingConversationId(undefined);
    } catch { setHistoryError("The chat name could not be updated. Please try again."); }
    finally { setRenamingConversationId(undefined); }
  };
  const deleteConversation = async () => {
    const conversation = conversationToDelete;
    if (!conversation || deletingConversationId) return;
    setDeletingConversationId(conversation.id); setHistoryError(undefined);
    try {
      const response = await fetch(`/api/assistant/conversations/${conversation.id}?role=${role}`, { method: "DELETE" });
      if (!response.ok) throw new Error("ASSISTANT_HISTORY_UNAVAILABLE");
      setConversationToDelete(undefined);
      setRemovingConversationId(conversation.id);
    } catch { setHistoryError("The chat could not be deleted. Please try again."); }
    finally { setDeletingConversationId(undefined); }
  };
  const finishConversationRemoval = (id: string) => {
    if (removingConversationId !== id) return;
    const remaining = conversations.filter((item) => item.id !== id);
    setConversations(remaining);
    setRemovingConversationId(undefined);
    if (conversationId === id) {
      setConversationId(undefined);
      const welcome = [{ role: "assistant" as const, text: greeting, timestamp: formatTimestamp() }];
      setMessages(welcome); messagesRef.current = welcome;
      if (remaining[0]) void loadConversation(remaining[0].id);
    }
  };
  const persistActionReply = (text: string) => {
    if (!conversationId) return;
    void fetch(`/api/assistant/conversations/${conversationId}?role=${role}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  };
  const stopSpeaking = () => {
    speakingRef.current = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (voiceEnabledRef.current) {
      setVoiceState("listening");
      startContinuousRecognition();
    } else setVoiceState("idle");
  };
  const speak = (text: string) => {
    if (!voiceEnabledRef.current || !("speechSynthesis" in window)) return;
    recognitionRef.current?.stop();
    speakingRef.current = true;
    setVoiceState("speaking");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechSynthesisLanguage(languageRef.current);
    utterance.onend = () => {
      speakingRef.current = false;
      if (voiceEnabledRef.current) {
        setVoiceState("listening");
        startContinuousRecognition();
      } else setVoiceState("idle");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  const openCheckout = async (action: PendingAssistantAction, checkout: CheckoutSession) => { const launch = () => { if (!window.Razorpay) throw new Error("Payment checkout could not load."); let completed = false; const instance = new window.Razorpay({ key: checkout.keyId, amount: checkout.amountMinor, currency: checkout.currency, order_id: checkout.orderId, name: "Schedula Healthcare", description: "Online consultation", prefill: checkout.prefill, handler: async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => { completed = true; const response = await fetch(`/api/assistant/actions/${action.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "payment_verified", paymentId: checkout.paymentId, orderId: payment.razorpay_order_id, providerPaymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }) }); const result = await response.json() as { error?: string }; const reply = response.ok ? "Payment verified and your appointment is confirmed." : assistantErrorMessage(result.error); setMessages((current) => [...current.map((message) => message.pendingAction?.id === action.id ? { ...message, pendingAction: undefined } : message), { role: "assistant", text: reply }]); speak(reply); }, modal: { ondismiss: () => { if (!completed) setMessages((current) => [...current, { role: "assistant", text: "Checkout was dismissed. The appointment is not confirmed; you can retry while the hold is active." }]); } } }); instance.on?.("payment.failed", () => setMessages((current) => [...current, { role: "assistant", text: "Payment failed safely. No appointment was confirmed." }])); instance.open(); }; if (window.Razorpay) launch(); else { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = launch; script.onerror = () => setMessages((current) => [...current, { role: "assistant", text: "Payment checkout could not load. No appointment was confirmed." }]); document.body.appendChild(script); } };
  const decideAction = async (action: PendingAssistantAction, decision: "confirm" | "decline") => { setActionBusy(action.id); try { const response = await fetch(`/api/assistant/actions/${action.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); const result = await response.json() as { error?: string; status?: string; result?: CheckoutSession }; if (response.ok && result.status === "payment_required" && result.result) { await openCheckout(action, result.result); return; } const reply = response.ok ? (decision === "confirm" ? actionSuccessText(action) : "Okay, I did not change anything.") : assistantErrorMessage(result.error); setMessages((current) => [...current.map((message) => message.pendingAction?.id === action.id ? { ...message, pendingAction: undefined } : message), { role: "assistant", text: reply }]); persistActionReply(reply); speak(reply); } catch { const reply = "The action could not be reached. No appointment was changed; please retry."; setMessages((current) => [...current, { role: "assistant", text: reply }]); persistActionReply(reply); } finally { setActionBusy(null); } };
  const stopGeneration = () => {
    const controller = requestControllerRef.current;
    if (!controller) return;
    requestControllerRef.current = null;
    controller.abort();
    busyRef.current = false;
    setBusy(false);
    setVoiceState(voiceEnabledRef.current ? "listening" : "idle");
    setMessages((current) => [...current, { role: "assistant", text: "Response stopped." }]);
    if (voiceEnabledRef.current && !speakingRef.current) startContinuousRecognition();
  };
  const send = async (value = input, selection: AssistantSelection = {}) => {
    const text = value.trim();
    if (!text || busyRef.current || actionBusy) return;
    const pendingActions = messagesRef.current
      .map((message) => message.pendingAction)
      .filter((action): action is PendingAssistantAction => Boolean(action && new Date(action.expiresAt).getTime() > Date.now()));
    const lastAssistantText = [...messagesRef.current].reverse().find((message) => message.role === "assistant")?.text ?? "";
    const decision = confirmationDecision(text);
    setMessages((current) => [...current, { role: "user", text }]);
    setInput("");
    if (decision && pendingActions.length === 1) {
      await decideAction(pendingActions[0], decision);
      return;
    }
    if (role === "patient" && decision && pendingActions.length > 1) {
      const reply = "Please use Confirm on the specific booking review you want to proceed with.";
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
      speak(reply);
      return;
    }
    if (role === "patient" && decision && assistantIsUnstructuredBookingPreview(lastAssistantText)) {
      const reply = assistantBookingPreviewRequiredText(languageRef.current);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
      speak(reply);
      return;
    }
    if (role === "patient" && assistantIsFreeformSlotPrompt(lastAssistantText, text)) {
      const reply = assistantTypedSlotSelectionRequiredText(languageRef.current);
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
      speak(reply);
      return;
    }
    const userTimestamp = formatTimestamp();
    const next = [...messagesRef.current, { role: "user" as const, text, timestamp: userTimestamp }];
    messagesRef.current = next;
    setMessages(next);
    busyRef.current = true;
    setBusy(true);
    setVoiceState(voiceEnabledRef.current ? "processing" : "idle");
    recognitionRef.current?.stop();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId,
          role,
          language: languageRef.current,
          messages: next.slice(-20).map(({ role: itemRole, text: itemText }) => ({ role: itemRole === "assistant" ? "model" : "user", text: itemText })),
          selectedDoctorId: selection.selectedDoctorId,
          selectedSlotId: selection.selectedSlotId,
          selectedProposalDecision: selection.selectedProposalDecision,
        }),
      });
      if (controller.signal.aborted) return;
      const payload = await response.json() as { text?: string; error?: string; displays?: AssistantDisplayPayload[]; pendingAction?: PendingAssistantAction; conversationId?: string };
      if (controller.signal.aborted) return;
      const reply = response.ok ? (payload.text ?? "I could not complete that request.") : assistantErrorMessage(payload.error);
      const canRetry = !response.ok && assistantErrorCanRetry(payload.error);
      const botTimestamp = formatTimestamp();
      setMessages((current) => [...current, { role: "assistant", text: reply, displays: payload.displays, pendingAction: payload.pendingAction, retryText: canRetry ? text : undefined, retrySelection: canRetry ? selection : undefined, timestamp: botTimestamp }]);
      if (payload.conversationId) {
        setConversationId(payload.conversationId);
        const title = conversationTitle(text);
        setConversations((current) => {
          const existing = current.find((item) => item.id === payload.conversationId);
          if (existing) return [{ ...existing, title: isUntitledConversation(existing.title) ? title : existing.title, updated_at: new Date().toISOString() }, ...current.filter((item) => item.id !== existing.id)];
          return [{ id: payload.conversationId!, title, role, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...current];
        });
      }
      speak(reply);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
      const reply = assistantErrorMessage("ASSISTANT_NETWORK_ERROR");
      const botTimestamp = formatTimestamp();
      setMessages((current) => [...current, { role: "assistant", text: reply, retryText: text, retrySelection: selection, timestamp: botTimestamp }]);
      speak(reply);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        busyRef.current = false;
        setBusy(false);
        if (voiceEnabledRef.current && !speakingRef.current) startContinuousRecognition();
      }
    }
  };
  useEffect(() => { sendRef.current = send; });
  const finishOneTurnCapture = (submit: boolean) => {
    if (!oneTurnActiveRef.current) return;
    oneTurnActiveRef.current = false;
    setOneTurnActive(false);
    clearOneTurnSilenceTimer();
    clearVoiceActivityTimer();
    setVoiceDetected(false);
    const transcript = oneTurnTranscriptRef.current.trim();
    oneTurnTranscriptRef.current = "";
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    if (submit && transcript) {
      setVoiceState("processing");
      void sendRef.current(transcript);
    } else setVoiceState("idle");
  };
  const scheduleOneTurnSilenceTimeout = () => {
    clearOneTurnSilenceTimer();
    oneTurnSilenceTimerRef.current = setTimeout(() => finishOneTurnCapture(true), VOICE_SILENCE_TIMEOUT_MS);
  };
  const startOneTurnCapture = () => {
    const recognition = getRecognition();
    if (!recognition) {
      setVoiceError("Voice input is not supported in this browser. You can still use text chat.");
      setVoiceState("error");
      return;
    }
    oneTurnActiveRef.current = true;
    oneTurnTranscriptRef.current = "";
    setInput("");
    setOneTurnActive(true);
    setVoiceError(undefined);
    setVoiceState("listening");
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechRecognitionLanguage(languageRef.current);
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || !oneTurnActiveRef.current) return;
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      if (!transcript) return;
      oneTurnTranscriptRef.current = transcript;
      setInput(transcript);
      markVoiceActivity();
      scheduleOneTurnSilenceTimeout();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition || !oneTurnActiveRef.current) return;
      recognition.lang = speechRecognitionLanguage(languageRef.current);
      try { recognition.start(); } catch { /* the browser may still be restarting recognition */ }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition || event?.error === "no-speech") return;
      finishOneTurnCapture(false);
      setVoiceError("Microphone access failed. Check browser permission and try again.");
      setVoiceState("error");
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {
      finishOneTurnCapture(false);
      setVoiceError("Microphone access failed. Check browser permission and try again.");
      setVoiceState("error");
    }
  };
  const toggleOneTurnCapture = () => {
    if (oneTurnActiveRef.current) finishOneTurnCapture(true);
    else if (!voiceEnabledRef.current && !busyRef.current && !actionBusy) startOneTurnCapture();
  };
  const stopContinuousVoice = () => {
    voiceEnabledRef.current = false;
    setVoiceActive(false);
    speakingRef.current = false;
    clearOneTurnSilenceTimer();
    clearVoiceActivityTimer();
    setVoiceDetected(false);
    continuousTranscriptRef.current = "";
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoiceState("idle");
  };
  const finishContinuousCapture = () => {
    const transcript = continuousTranscriptRef.current.trim();
    continuousTranscriptRef.current = "";
    clearOneTurnSilenceTimer();
    if (!transcript || !voiceEnabledRef.current) return;
    setVoiceState("processing");
    void sendRef.current(transcript);
  };
  const scheduleContinuousSilenceTimeout = () => {
    clearOneTurnSilenceTimer();
    oneTurnSilenceTimerRef.current = setTimeout(finishContinuousCapture, VOICE_SILENCE_TIMEOUT_MS);
  };
  const toggleContinuousVoice = () => {
    if (voiceEnabledRef.current) {
      stopContinuousVoice();
      return;
    }
    if (oneTurnActiveRef.current || busyRef.current || actionBusy) return;
    const recognition = getRecognition();
    if (!recognition) {
      setVoiceError("Voice input is not supported in this browser. You can still use text chat.");
      setVoiceState("error");
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechRecognitionLanguage(languageRef.current);
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || !voiceEnabledRef.current) return;
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      if (!transcript) return;
      continuousTranscriptRef.current = transcript;
      setInput(transcript);
      markVoiceActivity();
      scheduleContinuousSilenceTimeout();
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) startContinuousRecognition();
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition || event?.error === "no-speech") return;
      stopContinuousVoice();
      setVoiceError("Microphone access failed. Check browser permission and try again.");
      setVoiceState("error");
    };
    recognitionRef.current = recognition;
    voiceEnabledRef.current = true;
    setVoiceActive(true);
    setVoiceError(undefined);
    setVoiceState("listening");
    try { recognition.start(); } catch {
      stopContinuousVoice();
      setVoiceError("Microphone access failed. Check browser permission and try again.");
      setVoiceState("error");
    }
  };
  const handleLanguageChange = (nextLanguage: string) => {
    languageRef.current = nextLanguage;
    setLanguage(nextLanguage);
    if ((voiceEnabledRef.current || oneTurnActiveRef.current) && !speakingRef.current) recognitionRef.current?.stop();
  };
  useEffect(() => () => {
    voiceEnabledRef.current = false;
    oneTurnActiveRef.current = false;
    clearOneTurnSilenceTimer();
    clearVoiceActivityTimer();
    setVoiceDetected(false);
    requestControllerRef.current?.abort();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [clearOneTurnSilenceTimer, clearVoiceActivityTimer]);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const prompts = lastAssistant?.pendingAction
    ? ["What will change if I confirm?", "Show the details again"]
    : role === "doctor"
      ? ["Show today's appointments", "Find my next available slot", "Check schedule conflicts"]
      : ["Show my upcoming appointments", "Find a cardiologist", "Show available slots"];
  return (
    <Card className={`mx-auto flex ${compact ? "h-full w-full rounded-none border-0 shadow-none" : "flex-1 min-h-0 max-w-5xl rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-card"} w-full flex-col overflow-hidden`}>
      <CardHeader className="shrink-0 border-b bg-card/60 px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-9">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground sm:text-base">
                Assistant
              </CardTitle>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <div className="group/btn relative flex items-center justify-center">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 sm:size-8"
                aria-label="Start new chat"
                onClick={() => void newConversation()}
                disabled={historyBusy || newChatBusy || Boolean(deletingConversationId) || Boolean(removingConversationId) || Boolean(renamingConversationId)}
              >
                {newChatBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              </Button>
              <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-full bg-slate-900 px-3 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                New chat
              </span>
            </div>
            <div className="group/btn relative flex items-center justify-center">
              <Button
                type="button"
                size="icon"
                variant={showHistory ? "secondary" : "ghost"}
                className="size-7 sm:size-8"
                aria-label="Chat history"
                onClick={() => {
                  setShowHistory((previous) => !previous);
                  if (!showHistory) {
                    stopActiveRequest();
                    stopVoiceForNavigation();
                  }
                }}
                disabled={historyBusy || Boolean(deletingConversationId) || Boolean(removingConversationId)}
              >
                {historyBusy ? <Loader2 className="size-4 animate-spin" /> : <History className="size-4" />}
              </Button>
              <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-full bg-slate-900 px-3 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                Chat history
              </span>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/80 px-1.5 py-0.5 text-xs shadow-xs sm:gap-1 sm:px-2">
              <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <label className="sr-only" htmlFor="assistant-language">Assistant language</label>
              <CustomSelect
                id="assistant-language"
                name="assistantLanguage"
                value={language}
                onValueChange={handleLanguageChange}
                options={assistantLanguageOptions.map(({ value, label }) => ({ value, label }))}
                className="h-7 w-[4.25rem] border-0 bg-transparent px-0.5 text-xs focus:ring-0 sm:w-20 sm:px-1"
              />
            </div>
            {onClose && (
              <div className="group/btn relative flex items-center justify-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground sm:size-8"
                  aria-label="Close assistant"
                  onClick={onClose}
                >
                  <X className="size-4" />
                </Button>
                <span className="pointer-events-none absolute -bottom-7 right-0 z-50 whitespace-nowrap rounded-full bg-slate-900 px-3 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                  Close (Esc)
                </span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {showHistory ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between border-b pb-2.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <History className="size-3.5 text-muted-foreground" />
                Conversation history
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void newConversation()}
                disabled={historyBusy || newChatBusy || Boolean(deletingConversationId) || Boolean(removingConversationId) || Boolean(renamingConversationId)}
              >
                {newChatBusy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Plus className="mr-1 size-3" />}
                {newChatBusy ? "Creating…" : "New chat"}
              </Button>
            </div>

            {historyError && (
              <p className="mb-2 text-xs text-destructive" role="alert">{historyError}</p>
            )}

            {historyBusy ? (
              <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Loading conversations…
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
                <p>No previous conversations.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="mt-1 text-xs"
                  onClick={() => void newConversation()}
                  disabled={newChatBusy}
                >
                  {newChatBusy ? "Creating…" : "Start a new chat"}
                </Button>
              </div>
            ) : (
              <div className="assistant-conversation-scroll flex-1 space-y-1.5 overflow-y-auto pr-1" role="list" aria-label="Past conversations" tabIndex={0}>
                {conversations.map((conversation) => (
                  editingConversationId === conversation.id ? (
                    <form
                      key={conversation.id}
                      className="flex items-center gap-1 rounded-lg border bg-background p-1 text-xs"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameConversation(conversation.id);
                      }}
                    >
                      <input
                        aria-label="Chat name"
                        className="h-7 flex-1 rounded border bg-background px-2 text-xs"
                        maxLength={120}
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        autoFocus
                      />
                      <Button type="submit" size="icon" variant="ghost" className="size-7" aria-label="Save chat name" disabled={renamingConversationId === conversation.id || !editingTitle.trim()}>
                        {renamingConversationId === conversation.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </Button>
                    </form>
                  ) : (
                    <div
                      key={conversation.id}
                      role="listitem"
                      onAnimationEnd={(event) => {
                        if (event.animationName === HISTORY_REMOVE_ANIMATION) finishConversationRemoval(conversation.id);
                      }}
                      className={`group flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                        removingConversationId === conversation.id ? "assistant-history-removing" : ""
                      } ${
                        conversationId === conversation.id
                          ? "border-primary/50 bg-primary/10 font-medium text-primary"
                          : "bg-card hover:bg-muted/60"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 truncate pr-2 text-left"
                        onClick={() => {
                          void loadConversation(conversation.id);
                          setShowHistory(false);
                        }}
                        disabled={Boolean(conversationLoadingId) || historyBusy || Boolean(deletingConversationId) || Boolean(removingConversationId) || Boolean(renamingConversationId)}
                        aria-current={conversationId === conversation.id ? "true" : undefined}
                      >
                        {conversationLoadingId === conversation.id && <Loader2 className="size-3 shrink-0 animate-spin" />}
                        <span className="truncate">{conversation.title}</span>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Rename ${conversation.title}`}
                          disabled={Boolean(conversationLoadingId) || Boolean(renamingConversationId) || Boolean(deletingConversationId) || removingConversationId === conversation.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryError(undefined);
                            setEditingConversationId(conversation.id);
                            setEditingTitle(conversation.title);
                          }}
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Delete ${conversation.title}`}
                          disabled={Boolean(conversationLoadingId) || Boolean(renamingConversationId) || Boolean(deletingConversationId) || removingConversationId === conversation.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryError(undefined);
                            setConversationToDelete(conversation);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 w-full text-xs text-muted-foreground"
              onClick={() => setShowHistory(false)}
              disabled={Boolean(deletingConversationId) || Boolean(removingConversationId) || Boolean(renamingConversationId)}
            >
              <ChevronLeft className="mr-1 size-3.5" /> Back to chat
            </Button>
          </div>
        ) : (
          <>
            {/* Conversation Messages OR Welcome Empty State */}
            {historyError && !historyBusy && !conversationToDelete && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                <span>{historyError}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void loadConversations()}>
                  Retry history
                </Button>
              </div>
            )}
            {historyBusy || conversationLoadingId || newChatBusy ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
                <Loader2 className="mr-2 size-4 animate-spin" />
                {historyBusy ? "Loading your conversations…" : newChatBusy ? "Opening a new chat…" : "Opening conversation…"}
              </div>
            ) : compact && messages.length <= 1 && !busy ? (
              <div className="my-auto flex flex-col items-center justify-center px-2 py-6 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                  <Bot className="size-6" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Welcome to Schedula Assistant</h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {role === "doctor"
                    ? "Check your schedule, find open slots, and review conflicts with ease."
                    : "Find verified doctors, check available slots, and book or manage appointments."}
                </p>

                <div className="mt-6 w-full space-y-2">
                  <div className="flex flex-col gap-1.5">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="flex items-center justify-between w-full rounded-xl border bg-card px-3.5 py-2.5 text-left text-xs font-medium text-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        onClick={() => void send(prompt)}
                        disabled={busy || oneTurnActive || Boolean(actionBusy)}
                      >
                        <span>{prompt}</span>
                        <span className="text-muted-foreground" aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="assistant-conversation-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
                tabIndex={0}
                role="log"
                aria-label="Assistant conversation"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`}>
                    {message.role === "assistant" ? (
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-sm">
                          <Bot className="size-4" />
                        </div>
                        <div className="min-w-0 max-w-[92%] sm:max-w-[85%]">
                          <span className="mb-1 block text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Schedule Assistant
                          </span>
                          <div className="rounded-2xl rounded-tl-sm bg-slate-100/90 dark:bg-slate-800/80 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 shadow-sm">
                            {message.text.includes("could not connect") ? (
                              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-2.5 text-xs text-destructive">
                                <p className="font-medium">{message.text}</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 h-7 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    const lastUser = messages.filter((m) => m.role === "user").at(-1)?.text;
                                    if (lastUser) void send(lastUser);
                                  }}
                                  disabled={busy || oneTurnActive || Boolean(actionBusy)}
                                >
                                  <RotateCcw className="size-3" />
                                  Retry request
                                </Button>
                              </div>
                            ) : (
                              <div className="break-words leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:mt-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                                <ReactMarkdown>{message.text}</ReactMarkdown>
                              </div>
                            )}
                            <span
                              suppressHydrationWarning
                              className="mt-1.5 block text-right text-[10px] text-slate-400 dark:text-slate-400"
                            >
                              {mounted ? (message.timestamp || formatTimestamp()) : ""}
                            </span>
                          </div>

                          {message.retryText && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 text-xs"
                              onClick={() => void send(message.retryText, message.retrySelection)}
                              disabled={busy || oneTurnActive || Boolean(actionBusy)}
                            >
                              Retry
                            </Button>
                          )}

                          {message.displays?.map((display, displayIndex) => (
                            <ResultCard
                              key={`${display.kind}-${display.title}-${displayIndex}`}
                              display={display}
                              interactiveDoctors={role === "patient"}
                              interactiveSlots={role === "patient"}
                              interactiveAppointments={role === "patient"}
                              disabled={busy || oneTurnActive || Boolean(actionBusy)}
                              onSelectDoctor={(doctorId, doctorName) => void send(`Show available slots for ${doctorName}`, { selectedDoctorId: doctorId })}
                              onSelectSlot={(slotId, label) => void send(`I want to book this available slot: ${label}`, { selectedSlotId: slotId })}
                              onSelectProposalDecision={(selectedProposalDecision, label) => void send(label, { selectedProposalDecision })}
                              onSelectPatientAppointment={(selectedPatientAppointment, label) => void send(label, { selectedPatientAppointment })}
                              onSelectRescheduleSlot={(selectedRescheduleSlot, label) => void send(label, { selectedRescheduleSlot })}
                            />
                          ))}

                          {message.pendingAction && (
                            <div className="mt-3 grid gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-3.5 text-xs text-amber-950 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-100">
                              <div>
                                <p className="font-semibold">Review before confirming</p>
                                <p suppressHydrationWarning className="mt-1">This action expires {new Date(message.pendingAction.expiresAt).toLocaleString()}.</p>
                              </div>
                              {message.pendingAction.preview.operation === "booking" ? (
                                <BookingPreviewDetails preview={message.pendingAction.preview as BookingPreview} />
                              ) : (
                                <dl className="grid gap-2 sm:grid-cols-2">
                                  {Object.entries(message.pendingAction.preview).map(([key, value]) => (
                                    <div key={key}>
                                      <dt className="font-medium capitalize">{key.replaceAll("_", " ")}</dt>
                                      <dd className="break-words">{formatValue(value)}</dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => void decideAction(message.pendingAction!, "confirm")}
                                  disabled={busy || oneTurnActive || actionBusy === message.pendingAction.id}
                                >
                                  {actionBusy === message.pendingAction.id
                                    ? <><Loader2 className="mr-1 size-3 animate-spin" />Processing…</>
                                    : actionConfirmLabel(message.pendingAction)}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void decideAction(message.pendingAction!, "decline")}
                                  disabled={busy || oneTurnActive || actionBusy === message.pendingAction.id}
                                >
                                  {message.pendingAction.actionType === "doctor_cancellation" ? "Keep appointment" : message.pendingAction.actionType === "doctor_completion" ? "Do not mark completed" : "Don't apply"}
                                </Button>
                              </div>
                            </div>
                          )}

                          {message.staleAction && <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/70 p-2 text-xs text-amber-950">This saved action is no longer available. Ask the assistant to prepare a new review.</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-end gap-2.5 sm:gap-3">
                        <div className="flex flex-col items-end min-w-0 max-w-[92%] sm:max-w-[85%]">
                          <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400 text-right">
                            You
                          </span>
                          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm">
                            <p className="break-words whitespace-pre-wrap leading-relaxed">{message.text}</p>
                            <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-white/80">
                              <span suppressHydrationWarning>{mounted ? (message.timestamp || formatTimestamp()) : ""}</span>
                              <CheckCheck className="size-3 text-white/90" />
                            </div>
                          </div>
                        </div>
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-200">
                          <User className="size-4" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Inline Typing Indicator */}
                {(busy || voiceState === "processing") && (
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-sm">
                      <Bot className="size-4" />
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Schedule Assistant
                      </span>
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100/90 dark:bg-slate-800/80 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
                        <span className="flex items-center gap-1">
                          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                          <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                        </span>
                        <span className="font-medium text-slate-500">Schedule Assistant is typing…</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}

            {!compact && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-1 pt-1" aria-label="Quick scheduling actions">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                    onClick={() => void send(prompt)}
                    disabled={busy || oneTurnActive || Boolean(actionBusy)}
                  >
                    {prompt.includes("appointment") || prompt.includes("slot") ? (
                      <Calendar className="size-3.5 text-primary transition-transform group-hover:scale-110" />
                    ) : prompt.includes("available") || prompt.includes("time") ? (
                      <Clock className="size-3.5 text-teal-600 transition-transform group-hover:scale-110" />
                    ) : (
                      <Sparkles className="size-3.5 text-amber-500 transition-transform group-hover:scale-110" />
                    )}
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick prompt suggestions when conversation is active and in compact drawer */}
            {compact && messages.length > 1 && (
              <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto py-1 px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Suggested prompts">
                {prompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11px] font-normal transition-transform hover:-translate-y-0.5 hover:bg-muted"
                    onClick={() => void send(prompt)}
                    disabled={busy || oneTurnActive || Boolean(actionBusy)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            )}

            {/* Unified Composer Bar matching Reference img1 */}
            <div className="shrink-0 border-t pt-3">
              <div className="rounded-2xl border border-slate-200/90 bg-card p-1.5 sm:p-2 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 dark:border-slate-800">
                {(oneTurnActive || voiceActive) && (
                  <div className="flex items-center px-2 pb-1.5">
                    <span
                      className="assistant-voice-activity flex h-4 items-center gap-0.5"
                      role="img"
                      aria-label={voiceState === "speaking" ? "Assistant voice activity" : "Microphone voice activity"}
                    >
                      {Array.from({ length: 7 }, (_, index) => <span key={index} className={`assistant-voice-bar ${voiceDetected ? "is-active" : ""}`} style={{ animationDelay: `${index * 70}ms` }} />)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="group/btn relative flex items-center justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${oneTurnActive ? "bg-primary/10 text-primary" : ""}`}
                        aria-label={oneTurnActive ? "Stop one-turn voice input" : "Start one-turn voice input"}
                        aria-pressed={oneTurnActive}
                        onClick={toggleOneTurnCapture}
                        disabled={voiceActive || busy || Boolean(actionBusy)}
                      >
                        {oneTurnActive ? <AudioLines className="size-4" /> : <Mic className="size-4" />}
                      </Button>
                      {!oneTurnActive && (
                        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                          Voice dictation
                        </span>
                      )}
                    </div>
                    <div className="group/btn relative flex items-center justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${voiceActive ? "bg-primary/10 text-primary" : ""}`}
                        aria-label={voiceActive ? "Stop continuous voice mode" : "Start continuous voice mode"}
                        aria-pressed={voiceActive}
                        onClick={toggleContinuousVoice}
                        disabled={oneTurnActive || ((busy || Boolean(actionBusy)) && !voiceActive)}
                      >
                        {voiceActive ? <AudioLines className="size-4" /> : <Radio className="size-4" />}
                      </Button>
                      {!voiceActive && (
                        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                          Continuous voice
                        </span>
                      )}
                    </div>
                  </div>
                  <textarea
                    aria-label="Message to the assistant"
                    className="min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-0"
                    placeholder="Ask about appointments or slots…"
                    value={input}
                    rows={1}
                    onChange={(event) => {
                      const value = event.target.value;
                      setInput(value);
                      if (voiceActive) {
                        continuousTranscriptRef.current = value;
                        if (value.trim()) scheduleContinuousSilenceTimeout();
                        else clearOneTurnSilenceTimer();
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    disabled={busy || oneTurnActive || Boolean(actionBusy)}
                  />
                  <div className="group/btn relative flex items-center justify-center">
                    <Button
                      type="button"
                      size="icon"
                      variant={busy ? "secondary" : "default"}
                      className="size-10 shrink-0 rounded-full shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                      aria-label={busy ? "Stop assistant response" : "Send message"}
                      onClick={() => busy ? stopGeneration() : void send()}
                      disabled={oneTurnActive || Boolean(actionBusy) || (!busy && !input.trim())}
                    >
                      {busy ? <Square className="size-3.5 fill-current" /> : <Send className="size-4" />}
                    </Button>
                    <span className="pointer-events-none absolute -top-8 right-0 z-50 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-xl border border-slate-700/60 opacity-0 transition-all duration-150 group-hover/btn:opacity-100 group-hover/btn:-translate-y-0.5 group-focus-within/btn:opacity-100 dark:bg-white dark:text-slate-900 dark:border-slate-200/80">
                      {busy ? "Stop response" : "Send (Enter)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Single Helper Subtitle & Voice Status Banner */}
              <div className="mt-2 min-h-5 px-1 text-xs" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Enter to send · Shift+Enter for a new line
                  </span>
                  <div className="flex items-center gap-2">
                    {oneTurnActive ? (
                      <span className="font-medium text-primary">Listening… speak now</span>
                    ) : voiceState === "listening" ? (
                      <span className="font-medium text-primary">
                        Continuous voice active
                      </span>
                    ) : voiceState === "processing" || busy ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Schedula is preparing a response…
                      </span>
                    ) : voiceState === "speaking" ? (
                      <span className="flex items-center gap-1.5 font-medium text-primary">
                        <AudioLines className="size-3.5" />
                        Speaking…
                        <button
                          type="button"
                          onClick={stopSpeaking}
                          className="ml-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                          Stop
                        </button>
                      </span>
                    ) : voiceError ? (
                      <span className="text-destructive">{voiceError}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <Dialog
        open={Boolean(conversationToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingConversationId) setConversationToDelete(undefined);
        }}
      >
        <DialogContent aria-labelledby="assistant-delete-title" aria-describedby="assistant-delete-description" className="max-w-md">
          <DialogHeader>
            <DialogTitle id="assistant-delete-title">Delete this chat?</DialogTitle>
            <DialogDescription id="assistant-delete-description">
              This permanently deletes “{conversationToDelete?.title}” and its messages. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          {historyError && <p className="text-sm text-destructive" role="alert">{historyError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConversationToDelete(undefined)} disabled={Boolean(deletingConversationId)}>
              Keep chat
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteConversation()} disabled={Boolean(deletingConversationId)}>
              {deletingConversationId ? <><Loader2 className="mr-2 size-4 animate-spin" />Deleting…</> : "Delete chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
