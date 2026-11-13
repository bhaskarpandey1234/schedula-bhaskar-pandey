"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, ShieldCheck, Square, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assistantErrorMessage, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import type { AssistantRole, PendingAssistantAction } from "@/lib/assistant/types";

type Display = { title: string; kind: string; data?: unknown };
type Message = { role: "user" | "assistant"; text: string; display?: Display; pendingAction?: PendingAssistantAction; retryText?: string };
type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type CheckoutSession = { paymentId: string; orderId: string; keyId: string; amountMinor: number; currency: string; prefill?: { name?: string; email?: string; contact?: string } };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (event: string, handler: (response: { error?: { description?: string; reason?: string } }) => void) => void }; } }

function getRecognition() { const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }; const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition; return Constructor ? new Constructor() : null; }
function confirmationDecision(text: string): "confirm" | "decline" | null { const normalized = text.trim().toLocaleLowerCase().replace(/[.!?,。！？]+$/g, ""); if (/^(yes|y|confirm|confirm it|go ahead|haan|han|हाँ|ठीक|ठीक है)$/.test(normalized)) return "confirm"; if (/^(no|n|decline|cancel|don't|do not|nahin|nahi|नहीं|नही)$/.test(normalized)) return "decline"; return null; }
function formatValue(value: unknown) { if (value === null || value === undefined) return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function ResultCard({ display }: { display: Display }) {
  const values = Array.isArray(display.data) ? display.data : [display.data];

  return (
    <details className="mt-4 rounded-xl border bg-background/70 p-3 sm:p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">{display.title}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {values.slice(0, 12).map((value, index) => (
          <div key={index} className="min-w-0 rounded-xl border bg-card p-3 text-xs">
            {value && typeof value === "object" ? (
              <dl className="grid gap-2">
                {Object.entries(value as Record<string, unknown>)
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
  const [input, setInput] = useState(""); const [language, setLanguage] = useState("en-IN"); const [busy, setBusy] = useState(false); const [voiceState, setVoiceState] = useState<VoiceState>("idle"); const [voiceActive, setVoiceActive] = useState(false); const [voiceError, setVoiceError] = useState<string>(); const [actionBusy, setActionBusy] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null); const voiceEnabledRef = useRef(false); const messagesRef = useRef(messages); const busyRef = useRef(false); const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesRef.current = messages; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const stopSpeaking = () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); setVoiceState(voiceEnabledRef.current ? "listening" : "idle"); };
  const speak = (text: string) => { if (!voiceEnabledRef.current || !("speechSynthesis" in window)) return; recognitionRef.current?.stop(); setVoiceState("speaking"); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = speechRecognitionLanguage(language); utterance.onend = () => { if (voiceEnabledRef.current) { setVoiceState("listening"); try { recognitionRef.current?.start(); } catch { /* already listening */ } } else setVoiceState("idle"); }; window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); };
  const openCheckout = async (action: PendingAssistantAction, checkout: CheckoutSession) => { const launch = () => { if (!window.Razorpay) throw new Error("Payment checkout could not load."); let completed = false; const instance = new window.Razorpay({ key: checkout.keyId, amount: checkout.amountMinor, currency: checkout.currency, order_id: checkout.orderId, name: "Schedula Healthcare", description: "Online consultation", prefill: checkout.prefill, handler: async (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => { completed = true; const response = await fetch(`/api/assistant/actions/${action.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "payment_verified", paymentId: checkout.paymentId, orderId: payment.razorpay_order_id, providerPaymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }) }); const result = await response.json() as { error?: string }; const reply = response.ok ? "Payment verified and your appointment is confirmed." : assistantErrorMessage(result.error); setMessages((current) => [...current.map((message) => message.pendingAction?.id === action.id ? { ...message, pendingAction: undefined } : message), { role: "assistant", text: reply }]); speak(reply); }, modal: { ondismiss: () => { if (!completed) setMessages((current) => [...current, { role: "assistant", text: "Checkout was dismissed. The appointment is not confirmed; you can retry while the hold is active." }]); } } }); instance.on?.("payment.failed", () => setMessages((current) => [...current, { role: "assistant", text: "Payment failed safely. No appointment was confirmed." }])); instance.open(); }; if (window.Razorpay) launch(); else { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = launch; script.onerror = () => setMessages((current) => [...current, { role: "assistant", text: "Payment checkout could not load. No appointment was confirmed." }]); document.body.appendChild(script); } };
  const decideAction = async (action: PendingAssistantAction, decision: "confirm" | "decline") => { setActionBusy(action.id); try { const response = await fetch(`/api/assistant/actions/${action.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); const result = await response.json() as { error?: string; status?: string; result?: CheckoutSession }; if (response.ok && result.status === "payment_required" && result.result) { await openCheckout(action, result.result); return; } const reply = response.ok ? (decision === "confirm" ? "The action succeeded and the latest result is recorded." : "Okay, I did not change anything.") : assistantErrorMessage(result.error); setMessages((current) => [...current.map((message) => message.pendingAction?.id === action.id ? { ...message, pendingAction: undefined } : message), { role: "assistant", text: reply }]); speak(reply); } catch { setMessages((current) => [...current, { role: "assistant", text: "The action could not be reached. No appointment was changed; please retry." }]); } finally { setActionBusy(null); } };
  const send = async (value = input) => { const text = value.trim(); if (!text || busyRef.current || actionBusy) return; const pendingActions = messagesRef.current.map((message) => message.pendingAction).filter((action): action is PendingAssistantAction => Boolean(action && new Date(action.expiresAt).getTime() > Date.now())); const decision = confirmationDecision(text); setMessages((current) => [...current, { role: "user", text }]); setInput(""); if (decision && pendingActions.length === 1) { await decideAction(pendingActions[0], decision); return; } const next = [...messagesRef.current, { role: "user" as const, text }]; messagesRef.current = next; busyRef.current = true; setBusy(true); setVoiceState(voiceEnabledRef.current ? "processing" : "idle"); recognitionRef.current?.stop(); try { const response = await fetch("/api/assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, language, messages: next.map(({ role: itemRole, text: itemText }) => ({ role: itemRole === "assistant" ? "model" : "user", text: itemText })) }) }); const payload = await response.json() as { text?: string; error?: string; displays?: Display[]; pendingAction?: PendingAssistantAction }; const reply = response.ok ? (payload.text ?? "I could not complete that request.") : assistantErrorMessage(payload.error); setMessages((current) => [...current, { role: "assistant", text: reply, display: payload.displays?.[0], pendingAction: payload.pendingAction, retryText: response.ok ? undefined : text }]); speak(reply); } catch { const reply = assistantErrorMessage("ASSISTANT_NETWORK_ERROR"); setMessages((current) => [...current, { role: "assistant", text: reply, retryText: text }]); speak(reply); } finally { busyRef.current = false; setBusy(false); } };
  const toggleVoice = () => { if (voiceEnabledRef.current) { voiceEnabledRef.current = false; setVoiceActive(false); recognitionRef.current?.stop(); stopSpeaking(); return; } const recognition = getRecognition(); if (!recognition) { setVoiceError("Voice input is not supported in this browser. You can still use text chat."); setVoiceState("error"); return; } recognition.continuous = true; recognition.interimResults = false; recognition.lang = speechRecognitionLanguage(language); recognition.onresult = (event) => { const last = event.results[event.results.length - 1]; const transcript = last?.[0]?.transcript ?? ""; if (transcript) void send(transcript); }; recognition.onend = () => { if (voiceEnabledRef.current && !busyRef.current && voiceState !== "speaking") { try { recognition.start(); } catch { /* browser is already restarting */ } } }; recognition.onerror = () => { setVoiceError("Microphone access failed. Check browser permission and try again."); setVoiceState("error"); }; recognitionRef.current = recognition; voiceEnabledRef.current = true; setVoiceActive(true); setVoiceError(undefined); setVoiceState("listening"); recognition.start(); };
  useEffect(() => () => { voiceEnabledRef.current = false; recognitionRef.current?.stop(); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
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
          <select
            aria-label="Assistant language"
            className="shrink-0 rounded-md border bg-background px-2 py-2 text-xs"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {assistantLanguageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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
              disabled={busy || Boolean(actionBusy)}
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
                  onClick={() => void send(message.retryText)}
                  disabled={busy || Boolean(actionBusy)}
                >
                  Retry
                </Button>
              )}
              {message.display && <ResultCard display={message.display} />}
              {message.pendingAction && (
                <div className="mt-3 grid gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-xs text-amber-950">
                  <div>
                    <p className="font-semibold">Review before confirming</p>
                    <p className="mt-1">This action expires {new Date(message.pendingAction.expiresAt).toLocaleString()}.</p>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(message.pendingAction.preview).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-medium capitalize">{key.replaceAll("_", " ")}</dt>
                        <dd className="break-words">{formatValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decideAction(message.pendingAction!, "confirm")}
                      disabled={busy || actionBusy === message.pendingAction.id}
                    >
                      {actionBusy === message.pendingAction.id
                        ? <><Loader2 className="mr-1 size-3 animate-spin" />Processing…</>
                        : "Confirm"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decideAction(message.pendingAction!, "decline")}
                      disabled={busy || actionBusy === message.pendingAction.id}
                    >
                      Decline
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
            variant={voiceActive ? "destructive" : "outline"}
            size="icon"
            aria-label={voiceActive ? "Stop voice assistant" : "Start voice assistant"}
            onClick={toggleVoice}
          >
            {voiceActive ? <Square className="size-4" /> : <Mic className="size-4" />}
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
            disabled={busy || Boolean(actionBusy)}
          />
          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            onClick={() => void send()}
            disabled={busy || Boolean(actionBusy) || !input.trim()}
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
            : voiceState === "listening"
              ? "Listening continuously"
              : voiceState === "processing"
                ? "Processing your request…"
                : voiceState === "speaking"
                  ? "Assistant is speaking · stop anytime"
                  : !voiceError && "Enter to send · Shift+Enter for a new line"}
          {voiceError && <span className="text-destructive">{voiceError}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
