"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, Send, ShieldCheck, Square, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CustomSelect } from "@/components/ui/custom-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assistantBookingPreviewRequiredText, assistantErrorCanRetry, assistantErrorMessage, assistantIsFreeformSlotPrompt, assistantIsUnstructuredBookingPreview, assistantLanguageOptions, assistantTypedSlotSelectionRequiredText, speechRecognitionLanguage, speechSynthesisLanguage } from "@/lib/assistant/presentation";
import { formatLocalDate, formatLocalSlotRange } from "@/lib/scheduling/time";
import type { AssistantDisplayPayload, AssistantRole, BookingPreview, PendingAssistantAction } from "@/lib/assistant/types";

type ProposalDecisionSelection = { proposalId: string; decision: "approve" | "cancel" | "choose_slot"; slotId?: string };
type PatientAppointmentSelection = { appointmentId: string; action: "cancel" | "reschedule" };
type RescheduleSlotSelection = { appointmentId: string; slotId: string };
type Message = { role: "user" | "assistant"; text: string; displays?: AssistantDisplayPayload[]; pendingAction?: PendingAssistantAction; retryText?: string; retrySelection?: AssistantSelection };
type AssistantSelection = { selectedDoctorId?: string; selectedSlotId?: string; selectedProposalDecision?: ProposalDecisionSelection; selectedPatientAppointment?: PatientAppointmentSelection; selectedRescheduleSlot?: RescheduleSlotSelection };
type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";
type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null; onend: (() => void) | null; onerror: ((event?: { error?: string }) => void) | null };
type CheckoutSession = { paymentId: string; orderId: string; keyId: string; amountMinor: number; currency: string; prefill?: { name?: string; email?: string; contact?: string } };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (event: string, handler: (response: { error?: { description?: string; reason?: string } }) => void) => void }; } }

function getRecognition() { const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition; return Constructor ? new Constructor() : null; }
const VOICE_SILENCE_TIMEOUT_MS = 6_000;
function confirmationDecision(text: string): "confirm" | "decline" | null { const normalized = text.trim().toLocaleLowerCase().replace(/[.!?,。！？]+$/g, ""); if (/^(yes|y|confirm|confirm it|go ahead|haan|han|हाँ|ठीक|ठीक है)$/.test(normalized)) return "confirm"; if (/^(no|n|decline|cancel|don't|do not|nahin|nahi|नहीं|नही)$/.test(normalized)) return "decline"; return null; }
function formatValue(value: unknown) { if (value === null || value === undefined) return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
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
            <p className="text-xs text-muted-foreground">Respond by {typeof row.decision_deadline === "string" ? new Date(row.decision_deadline).toLocaleString() : "the deadline shown in your appointment"}.</p>
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
        {values.length === 0 ? <p className="text-sm text-muted-foreground">No appointments were found.</p> : values.slice(0, 12).map((value, index) => {
          const row = asRecord(value);
          if (!row) return null;
          const appointmentId = typeof row.appointment_id === "string" ? row.appointment_id : undefined;
          const name = typeof row.doctor_name === "string" ? row.doctor_name : typeof row.patient_name === "string" ? row.patient_name : "Appointment";
          const timezone = typeof row.timezone === "string" ? row.timezone : "Asia/Kolkata";
          const when = typeof row.slot_start_at === "string" && typeof row.slot_end_at === "string" ? `${formatLocalDate(row.slot_start_at, timezone)}, ${formatLocalSlotRange(row.slot_start_at, row.slot_end_at, timezone)}` : "Time unavailable";
          const canChange = interactiveAppointments && appointmentId && row.status === "confirmed";
          return <article key={appointmentId ?? index} className="grid gap-1 rounded-lg border bg-card p-3 text-sm">
            <p className="font-semibold">{name}</p>
            <p>{when} ({timezone})</p>
            {typeof row.clinic_name === "string" && <p className="text-muted-foreground">{row.clinic_name}</p>}
            <p className="capitalize text-muted-foreground">{String(row.status ?? "status unavailable").replaceAll("_", " ")}</p>
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

export function AssistantChat({ role }: { role: AssistantRole }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: role === "doctor" ? "I can check your schedule, appointments, conflicts, and availability." : "I can find doctors, check slots, and manage your appointments with confirmation." }]);
  const [input, setInput] = useState(""); const [language, setLanguage] = useState("en-IN"); const [busy, setBusy] = useState(false); const [voiceState, setVoiceState] = useState<VoiceState>("idle"); const [voiceActive, setVoiceActive] = useState(false); const [oneTurnActive, setOneTurnActive] = useState(false); const [oneTurnTranscript, setOneTurnTranscript] = useState(""); const [voiceError, setVoiceError] = useState<string>(); const [actionBusy, setActionBusy] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null); const voiceEnabledRef = useRef(false); const oneTurnActiveRef = useRef(false); const oneTurnTranscriptRef = useRef(""); const oneTurnSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const speakingRef = useRef(false); const languageRef = useRef(language); const messagesRef = useRef(messages); const busyRef = useRef(false); const bottomRef = useRef<HTMLDivElement>(null); const sendRef = useRef<(value?: string, selection?: AssistantSelection) => Promise<void>>(async () => undefined);
  useEffect(() => { messagesRef.current = messages; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const clearOneTurnSilenceTimer = () => { if (oneTurnSilenceTimerRef.current !== null) clearTimeout(oneTurnSilenceTimerRef.current); oneTurnSilenceTimerRef.current = null; };
  const startContinuousRecognition = () => {
    const recognition = recognitionRef.current;
    if (!recognition || !voiceEnabledRef.current || busyRef.current || speakingRef.current) return;
    recognition.lang = speechRecognitionLanguage(languageRef.current);
    try { recognition.start(); setVoiceState("listening"); } catch { /* the browser may still be stopping the previous capture */ }
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
  const decideAction = async (action: PendingAssistantAction, decision: "confirm" | "decline") => { setActionBusy(action.id); try { const response = await fetch(`/api/assistant/actions/${action.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); const result = await response.json() as { error?: string; status?: string; result?: CheckoutSession }; if (response.ok && result.status === "payment_required" && result.result) { await openCheckout(action, result.result); return; } const reply = response.ok ? (decision === "confirm" ? actionSuccessText(action) : "Okay, I did not change anything.") : assistantErrorMessage(result.error); setMessages((current) => [...current.map((message) => message.pendingAction?.id === action.id ? { ...message, pendingAction: undefined } : message), { role: "assistant", text: reply }]); speak(reply); } catch { setMessages((current) => [...current, { role: "assistant", text: "The action could not be reached. No appointment was changed; please retry." }]); } finally { setActionBusy(null); } };
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
    const next = [...messagesRef.current, { role: "user" as const, text }];
    messagesRef.current = next;
    busyRef.current = true;
    setBusy(true);
    setVoiceState(voiceEnabledRef.current ? "processing" : "idle");
    recognitionRef.current?.stop();
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role,
          language: languageRef.current,
          messages: next.map(({ role: itemRole, text: itemText }) => ({ role: itemRole === "assistant" ? "model" : "user", text: itemText })),
          selectedDoctorId: selection.selectedDoctorId,
          selectedSlotId: selection.selectedSlotId,
          selectedProposalDecision: selection.selectedProposalDecision,
        }),
      });
      const payload = await response.json() as { text?: string; error?: string; displays?: AssistantDisplayPayload[]; pendingAction?: PendingAssistantAction };
      const reply = response.ok ? (payload.text ?? "I could not complete that request.") : assistantErrorMessage(payload.error);
      const canRetry = !response.ok && assistantErrorCanRetry(payload.error);
      setMessages((current) => [...current, { role: "assistant", text: reply, displays: payload.displays, pendingAction: payload.pendingAction, retryText: canRetry ? text : undefined, retrySelection: canRetry ? selection : undefined }]);
      speak(reply);
    } catch {
      const reply = assistantErrorMessage("ASSISTANT_NETWORK_ERROR");
      setMessages((current) => [...current, { role: "assistant", text: reply, retryText: text, retrySelection: selection }]);
      speak(reply);
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (voiceEnabledRef.current && !speakingRef.current) startContinuousRecognition();
    }
  };
  useEffect(() => { sendRef.current = send; });
  const finishOneTurnCapture = (submit: boolean) => {
    if (!oneTurnActiveRef.current) return;
    oneTurnActiveRef.current = false;
    setOneTurnActive(false);
    clearOneTurnSilenceTimer();
    const transcript = oneTurnTranscriptRef.current.trim();
    oneTurnTranscriptRef.current = "";
    setOneTurnTranscript("");
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
    setOneTurnTranscript("");
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
      setOneTurnTranscript(transcript);
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
    scheduleOneTurnSilenceTimeout();
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
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoiceState("idle");
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
    recognition.interimResults = false;
    recognition.lang = speechRecognitionLanguage(languageRef.current);
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || !voiceEnabledRef.current) return;
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript ?? "";
      if (transcript) void sendRef.current(transcript);
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
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);
  const prompts = role === "doctor" ? ["Show today's appointments", "Find my next available slot"] : ["Show my upcoming appointments", "Find a cardiologist"];
  return (
    <Card className="mx-auto flex h-[min(72svh,46rem)] min-h-[28rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Schedula assistant
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Scheduling operations only · pilot accounts · no medical advice</p>
          </div>
          <label className="sr-only" htmlFor="assistant-language">Assistant language</label>
          <CustomSelect
            id="assistant-language"
            name="assistantLanguage"
            value={language}
            onValueChange={handleLanguageChange}
            options={assistantLanguageOptions.map(({ value, label }) => ({ value, label }))}
            className="h-9 w-32 shrink-0 px-3 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-5">
        <div className="flex shrink-0 flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void send(prompt)}
              disabled={busy || oneTurnActive || Boolean(actionBusy)}
            >
              {prompt}
            </Button>
          ))}
        </div>
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
          role="log"
          aria-label="Assistant conversation"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === "user"
                ? "ml-auto max-w-[92%] rounded-2xl bg-primary px-3 py-2.5 text-sm text-primary-foreground sm:max-w-[82%]"
                : "max-w-full rounded-2xl border bg-muted/40 px-3 py-2.5 text-sm sm:max-w-[94%]"}
            >
              <p className={`mb-1 text-[11px] font-semibold ${message.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                {message.role === "user" ? "You" : "Schedula"}
              </p>
              {message.role === "assistant" ? (
                <div className="break-words leading-6 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:mt-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="break-words whitespace-pre-wrap leading-6">{message.text}</p>
              )}
              {message.retryText && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
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
                <div className="mt-3 grid gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-xs text-amber-950">
                  <div>
                    <p className="font-semibold">Review before confirming</p>
                    <p className="mt-1">This action expires {new Date(message.pendingAction.expiresAt).toLocaleString()}.</p>
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
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex shrink-0 items-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant={oneTurnActive ? "destructive" : "outline"}
            size="icon"
            aria-label={oneTurnActive ? "Finish one-turn voice input" : "Start one-turn voice input"}
            aria-pressed={oneTurnActive}
            onClick={toggleOneTurnCapture}
            disabled={voiceActive || busy || Boolean(actionBusy)}
          >
            {oneTurnActive ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button
            type="button"
            variant={voiceActive ? "destructive" : "outline"}
            size="icon"
            aria-label={voiceActive ? "Stop continuous voice mode" : "Start continuous voice mode"}
            aria-pressed={voiceActive}
            onClick={toggleContinuousVoice}
            disabled={oneTurnActive || ((busy || Boolean(actionBusy)) && !voiceActive)}
          >
            {voiceActive ? <Square className="size-4" /> : <AudioLines className="size-4" />}
          </Button>
          <textarea
            aria-label="Message to the assistant"
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Ask about appointments or slots…"
            value={input}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            disabled={busy || oneTurnActive || Boolean(actionBusy)}
          />
          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            onClick={() => void send()}
            disabled={busy || oneTurnActive || Boolean(actionBusy) || !input.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
          {voiceState === "speaking" && (
            <Button type="button" variant="outline" size="icon" aria-label="Stop speaking" onClick={stopSpeaking}>
              <Volume2 className="size-4" />
            </Button>
          )}
        </div>
        <div className="min-h-5 shrink-0 text-xs text-muted-foreground" role="status" aria-live="polite">
          {busy
            ? "Schedula is preparing a response…"
            : oneTurnActive
              ? "One-turn mic is listening · sends after 6 seconds of silence"
              : voiceState === "listening"
                ? "Continuous voice mode · listening"
              : voiceState === "processing"
                ? "Processing your request…"
                : voiceState === "speaking"
                  ? "Assistant is speaking · stop anytime"
                  : !voiceError && "Enter to send · Shift+Enter for a new line"}
          {voiceError && <span className="text-destructive">{voiceError}</span>}
          {oneTurnTranscript && <span className="block break-words">Heard: {oneTurnTranscript}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
