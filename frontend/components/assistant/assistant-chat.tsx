"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, ShieldCheck, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assistantErrorMessage, assistantLanguageLabel, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import type { AssistantRole, PendingAssistantAction } from "@/lib/assistant/types";

type Message = { role: "user" | "assistant"; text: string; display?: { title: string; kind: string; data?: unknown }; pendingAction?: PendingAssistantAction; retryText?: string };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function getRecognition() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Constructor ? new Constructor() : null;
}

export function AssistantChat({ role }: { role: AssistantRole }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: role === "doctor" ? "I can check your schedule, appointments, conflicts, and availability." : "I can find doctors, check slots, and manage your appointments with confirmation." }]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [busy, setBusy] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceActiveRef = useRef(false);

  const speak = (text: string) => {
    if (!voiceActiveRef.current || !("speechSynthesis" in window)) return;
    recognitionRef.current?.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechRecognitionLanguage(language);
    utterance.onend = () => { if (voiceActiveRef.current) recognitionRef.current?.start(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const send = async (value = input) => {
    const text = value.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, language: assistantLanguageLabel(language), messages: next.map(({ role: itemRole, text: itemText }) => ({ role: itemRole === "assistant" ? "model" : "user", text: itemText })) }) });
      const payload = await response.json() as { text?: string; error?: string; displays?: Array<{ title: string; kind: string; data?: unknown }>; pendingAction?: PendingAssistantAction };
      const reply = response.ok ? (payload.text ?? "I could not complete that request.") : assistantErrorMessage(payload.error);
      setMessages((current) => [...current, { role: "assistant", text: reply, display: payload.displays?.[0], pendingAction: payload.pendingAction, retryText: response.ok ? undefined : text }]);
      speak(reply);
    } catch { setMessages((current) => [...current, { role: "assistant", text: assistantErrorMessage(), retryText: text }]); }
    finally { setBusy(false); }
  };

  const toggleVoice = () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setVoiceActive(false);
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
      return;
    }
    const recognition = getRecognition();
    if (!recognition) { setVoiceError("Voice input is not supported in this browser. You can still use text chat."); return; }
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = speechRecognitionLanguage(language);
    recognition.onresult = (event) => { const last = event.results[event.results.length - 1]; const transcript = last?.[0]?.transcript ?? ""; void send(transcript); };
    recognition.onend = () => { if (voiceActiveRef.current && !window.speechSynthesis.speaking) recognition.start(); };
    recognition.onerror = () => setVoiceError("Microphone access failed. Check browser permission and try again.");
    recognitionRef.current = recognition;
    voiceActiveRef.current = true;
    setVoiceError(undefined);
    setVoiceActive(true);
    recognition.start();
  };

  useEffect(() => () => { voiceActiveRef.current = false; recognitionRef.current?.stop(); window.speechSynthesis.cancel(); }, []);

  return <Card className="mx-auto flex min-h-[32rem] max-w-3xl flex-col overflow-hidden rounded-2xl">
    <CardHeader className="border-b bg-muted/20"><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-primary" />Schedula assistant</CardTitle><p className="mt-1 text-xs text-muted-foreground">Synthetic pilot only · scheduling operations, not medical advice</p></div><select aria-label="Assistant language" className="rounded-md border bg-background px-2 py-1 text-xs" value={language} onChange={(event) => setLanguage(event.target.value)}>{assistantLanguageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4 p-4"><div className="flex-1 space-y-3 overflow-y-auto" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[92%] rounded-2xl border bg-muted/40 px-3 py-2 text-sm"}><p>{message.text}</p>{message.retryText && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void send(message.retryText)} disabled={busy}>Retry</Button>}{message.display && <details className="mt-2 rounded-lg border bg-background/70 p-2 text-xs"><summary className="cursor-pointer font-medium">{message.display.title}</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(message.display.data, null, 2)}</pre></details>}{message.pendingAction && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={async () => { const response = await fetch(`/api/assistant/actions/${message.pendingAction?.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "confirm" }) }); const result = await response.json(); setMessages((current) => [...current, { role: "assistant", text: response.ok ? "The confirmed action was submitted. Check the result below." : (result.error ?? "The action failed.") }]); }} disabled={busy}>Confirm</Button><Button size="sm" variant="outline" onClick={async () => { await fetch(`/api/assistant/actions/${message.pendingAction?.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "decline" }) }); setMessages((current) => [...current, { role: "assistant", text: "Okay, I did not change anything." }]); }}>Decline</Button></div>}</div>)}</div><div className="flex flex-wrap items-center gap-2 border-t pt-3"><Button type="button" variant={voiceActive ? "destructive" : "outline"} size="icon" aria-label={voiceActive ? "Stop voice assistant" : "Start voice assistant"} onClick={toggleVoice}>{voiceActive ? <Square className="size-4" /> : <Mic className="size-4" />}</Button><input className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Ask about appointments or slots…" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} disabled={busy} /><Button type="button" size="icon" aria-label="Send message" onClick={() => void send()} disabled={busy || !input.trim()}>{busy ? <MicOff className="size-4 animate-pulse" /> : <Send className="size-4" />}</Button></div>{voiceError && <p className="text-xs text-destructive">{voiceError}</p>}</CardContent>
  </Card>;
}
