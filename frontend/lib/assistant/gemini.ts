import { assistantConfig } from "@/lib/assistant/config";
import { assistantFunctionDeclarations, runAssistantTool } from "@/lib/assistant/tools";
import type { AssistantRole, AssistantToolResult } from "@/lib/assistant/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChatMessage = { role: "user" | "model"; text: string };
type GeminiContent = { role: string; parts: Array<Record<string, unknown>> };

const systemInstruction = (role: AssistantRole, language?: string) => [
  `You are Schedula's operational assistant for a ${role}.`,
  "Only use the supplied functions for real account data and actions. Never invent appointments, doctors, slots, payments, or prescriptions.",
  "Never provide diagnosis, treatment, or medication advice. Explain that you can only help with scheduling and records.",
  "For booking, rescheduling, or cancellation, always call a prepare_* function first and wait for explicit confirmation.",
  `Reply in the user's language when clear; preferred language is ${language || "auto"}. Hindi and Hinglish are supported.`,
].join(" ");

export async function runGeminiAssistant(input: { role: AssistantRole; userId: string; supabase: SupabaseClient; messages: ChatMessage[]; language?: string }) {
  if (!assistantConfig.geminiApiKey) throw new Error("ASSISTANT_UNAVAILABLE");
  const contents: GeminiContent[] = input.messages.map((message) => ({ role: message.role, parts: [{ text: message.text }] }));
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${assistantConfig.textModel}:generateContent?key=${encodeURIComponent(assistantConfig.geminiApiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction(input.role, input.language) }] },
        contents,
        tools: [{ functionDeclarations: assistantFunctionDeclarations }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
      }),
    });
    if (response.status === 429) throw new Error("ASSISTANT_QUOTA_EXHAUSTED");
    if (!response.ok) throw new Error("GEMINI_REQUEST_FAILED");
    const payload = await response.json() as { candidates?: Array<{ content?: { role?: string; parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> } }> };
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.map((part) => part.functionCall).filter(Boolean) as Array<{ name: string; args?: Record<string, unknown> }>;
    const text = parts.map((part) => part.text).filter(Boolean).join(" ").trim();
    if (!calls.length) return { text: text || "I could not produce a response. Please try again.", displays: [] as AssistantToolResult[], pendingAction: undefined };
    contents.push({ role: "model", parts: parts.map((part) => part.functionCall ? { functionCall: part.functionCall } : { text: part.text ?? "" }) });
    const results: AssistantToolResult[] = [];
    for (const call of calls) {
      const result = await runAssistantTool({ name: call.name, args: call.args ?? {}, role: input.role, userId: input.userId, supabase: input.supabase });
      results.push(result);
      contents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { result: result.modelSummary } } }] });
    }
    const pendingAction = results.find((result) => result.pendingAction)?.pendingAction;
    const display = results.find((result) => result.display)?.display;
    if (pendingAction) return { text: "I prepared this action for your confirmation.", displays: display ? [display] : [], pendingAction };
  }
  throw new Error("ASSISTANT_TOOL_LOOP_LIMIT");
}
