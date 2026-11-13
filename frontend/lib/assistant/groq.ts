import Groq from "groq-sdk";
import { assistantConfig } from "@/lib/assistant/config";
import { assistantFunctionToolsForRole, runAssistantTool } from "@/lib/assistant/tools";
import type { AssistantRole, AssistantToolResult } from "@/lib/assistant/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChatMessage = { role: "user" | "model"; text: string };
type ProviderToolCall = { id: string; type?: string; function: { name: string; arguments: string } };
type ProviderMessage = { content?: string | null; tool_calls?: ProviderToolCall[] };
type ProviderCompletion = { model?: string; choices: Array<{ message: ProviderMessage }> };
type ChatClient = { chat: { completions: { create: (request: Record<string, unknown>, options?: Record<string, unknown>) => Promise<ProviderCompletion> } } };
type Runtime = {
  client?: ChatClient;
  now?: () => number;
  random?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};
type ProviderFailure = { code: string; reason: string; retryable: boolean; tryFallback: boolean; status?: number };
type FunctionCall = { id: string; name: string; arguments: Record<string, unknown> };

export const GROQ_TURN_TIMEOUT_MS = 45_000;
export const GROQ_ATTEMPT_TIMEOUT_MS = 15_000;
const GROQ_TOOL_ITERATION_LIMIT = 4;
const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);
const SAFE_PROVIDER_REASONS = ["UNAVAILABLE", "OVERLOADED", "TIMEOUT", "RATE_LIMIT", "INVALID", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INTERNAL"] as const;

const systemInstruction = (role: AssistantRole, language?: string) => [
  `You are Schedula's operational assistant for a ${role}.`,
  "Only use the supplied functions for real account data and actions. Never invent appointments, doctors, slots, payments, or prescriptions.",
  "Never provide diagnosis, treatment, or medication advice. Explain that you can only help with scheduling and records.",
  "For booking, rescheduling, or cancellation, always call a prepare_* function first and wait for explicit confirmation.",
  `Reply in the user's language when clear; preferred language is ${language || "auto"}. Hindi and Hinglish are supported.`,
].join(" ");

function statusFromError(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  return undefined;
}

function safeProviderReason(error: unknown) {
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  return SAFE_PROVIDER_REASONS.find((reason) => message.includes(reason)) ?? "UNKNOWN";
}

function classifyProviderError(error: unknown): ProviderFailure {
  const status = statusFromError(error);
  const name = error instanceof Error ? error.name.toUpperCase() : "";
  const reason = safeProviderReason(error);
  if (status === 408 || status === 504 || name.includes("TIMEOUT") || name.includes("ABORT")) return { code: "ASSISTANT_TIMEOUT", reason, retryable: true, tryFallback: true, status };
  if (status === 429) return { code: "ASSISTANT_QUOTA_EXHAUSTED", reason, retryable: false, tryFallback: true, status };
  if (status === 401 || status === 403) return { code: "ASSISTANT_PROVIDER_AUTH_FAILED", reason, retryable: false, tryFallback: false, status };
  if (status === 404) return { code: "ASSISTANT_PROVIDER_MODEL_UNAVAILABLE", reason, retryable: false, tryFallback: true, status };
  if (status === 400 || status === 422) return { code: "ASSISTANT_PROVIDER_INVALID_REQUEST", reason, retryable: false, tryFallback: false, status };
  if (status && RETRYABLE_STATUSES.has(status)) return { code: "ASSISTANT_UNAVAILABLE", reason, retryable: true, tryFallback: true, status };
  if (!status) return { code: "ASSISTANT_NETWORK_ERROR", reason, retryable: true, tryFallback: true };
  return { code: "ASSISTANT_PROVIDER_REQUEST_FAILED", reason, retryable: false, tryFallback: false, status };
}

function retryDelayMs(retryIndex: number, random: () => number) {
  const base = Math.min(1_500, 250 * (2 ** retryIndex));
  return Math.round(base * (0.75 + random() * 0.5));
}

function initialMessages(messages: ChatMessage[], role: AssistantRole, language?: string) {
  return [
    { role: "system", content: systemInstruction(role, language) },
    ...messages.map((message) => ({ role: message.role === "model" ? "assistant" : "user", content: message.text })),
  ] as Array<Record<string, unknown>>;
}

function parseToolCalls(message: ProviderMessage): FunctionCall[] {
  return (message.tool_calls ?? []).map((call) => {
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      throw new Error("ASSISTANT_PROVIDER_INVALID_REQUEST");
    }
    if (!args || Array.isArray(args) || typeof args !== "object" || !call.id || !call.function.name) throw new Error("ASSISTANT_PROVIDER_INVALID_REQUEST");
    return { id: call.id, name: call.function.name, arguments: args as Record<string, unknown> };
  });
}

async function createCompletionWithRecovery(input: {
  client: ChatClient;
  messages: Array<Record<string, unknown>>;
  role: AssistantRole;
  deadlineAt: number;
  runtime: Required<Pick<Runtime, "now" | "random" | "sleep">>;
}) {
  const models = [assistantConfig.textModel, assistantConfig.fallbackTextModel].filter((model, index, values) => Boolean(model) && values.indexOf(model) === index);
  let lastFailure: ProviderFailure = { code: "ASSISTANT_UNAVAILABLE", reason: "UNKNOWN", retryable: true, tryFallback: true };

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const attempts = modelIndex === 0 ? 2 : 1;
    for (let retryIndex = 0; retryIndex < attempts; retryIndex += 1) {
      const remainingMs = input.deadlineAt - input.runtime.now();
      if (remainingMs <= 0) throw new Error("ASSISTANT_TIMEOUT");
      const started = input.runtime.now();
      try {
        const completion = await input.client.chat.completions.create({
          model,
          messages: input.messages,
          tools: assistantFunctionToolsForRole(input.role),
          tool_choice: "auto",
          max_completion_tokens: 1_600,
          reasoning_effort: model.startsWith("qwen/") ? "none" : "low",
          reasoning_format: "hidden",
        }, { timeout: Math.min(GROQ_ATTEMPT_TIMEOUT_MS, remainingMs), maxRetries: 0 });
        return { completion, model: completion.model || model };
      } catch (error) {
        lastFailure = classifyProviderError(error);
        console.warn("assistant_groq_attempt_failed", {
          durationMs: Math.max(0, input.runtime.now() - started),
          model,
          providerReason: lastFailure.reason,
          status: lastFailure.status ?? "network",
        });
        if (!lastFailure.retryable) break;
        if (retryIndex < attempts - 1) {
          const delay = retryDelayMs(retryIndex, input.runtime.random);
          if (input.runtime.now() + delay >= input.deadlineAt) throw new Error("ASSISTANT_TIMEOUT");
          await input.runtime.sleep(delay);
        }
      }
    }
    if (!lastFailure.tryFallback) throw new Error(lastFailure.code);
  }
  throw new Error(lastFailure.code);
}

function isSensitiveAssistantTool(name: string) {
  return name.startsWith("prepare_");
}

async function runAssistantToolWithDeadline(input: { call: FunctionCall; role: AssistantRole; userId: string; supabase: SupabaseClient; deadlineAt: number; now: () => number }) {
  const remainingMs = input.deadlineAt - input.now();
  if (remainingMs <= 0) throw new Error("ASSISTANT_TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = runAssistantTool({ name: input.call.name, args: input.call.arguments, role: input.role, userId: input.userId, supabase: input.supabase });
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ASSISTANT_TIMEOUT")), remainingMs); });
  try { return await Promise.race([operation, timeout]); } finally { if (timer) clearTimeout(timer); }
}

async function executeAssistantCalls(input: { calls: FunctionCall[]; role: AssistantRole; userId: string; supabase: SupabaseClient; deadlineAt: number; now: () => number }) {
  const firstSensitiveIndex = input.calls.findIndex((call) => isSensitiveAssistantTool(call.name));
  const callsToExecute = firstSensitiveIndex === -1 ? input.calls : input.calls.slice(0, firstSensitiveIndex + 1);
  const results = new Array<AssistantToolResult | undefined>(callsToExecute.length);
  await Promise.all(callsToExecute.map(async (call, index) => {
    if (!isSensitiveAssistantTool(call.name)) results[index] = await runAssistantToolWithDeadline({ ...input, call });
  }));
  if (firstSensitiveIndex !== -1) results[firstSensitiveIndex] = await runAssistantToolWithDeadline({ ...input, call: callsToExecute[firstSensitiveIndex] });
  return callsToExecute.map((call, index) => ({ call, result: results[index] as AssistantToolResult }));
}

async function runGroqRemote(input: { role: AssistantRole; userId: string; supabase: SupabaseClient; messages: ChatMessage[]; language?: string }, runtime: Runtime) {
  const now = runtime.now ?? Date.now;
  const resolvedRuntime = { now, random: runtime.random ?? Math.random, sleep: runtime.sleep ?? ((durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs))) };
  const client = runtime.client ?? new Groq({ apiKey: assistantConfig.groqApiKey, maxRetries: 0 }) as unknown as ChatClient;
  const deadlineAt = now() + GROQ_TURN_TIMEOUT_MS;
  const messages = initialMessages(input.messages, input.role, input.language);

  for (let iteration = 0; iteration < GROQ_TOOL_ITERATION_LIMIT; iteration += 1) {
    const { completion, model } = await createCompletionWithRecovery({ client, messages, role: input.role, deadlineAt, runtime: resolvedRuntime });
    const message = completion.choices[0]?.message;
    if (!message) throw new Error("ASSISTANT_PROVIDER_REQUEST_FAILED");
    const calls = parseToolCalls(message);
    if (!calls.length) return { text: message.content?.trim() || "I could not produce a response. Please try again.", displays: [] as AssistantToolResult[], pendingAction: undefined, model };

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
    const results: AssistantToolResult[] = [];
    const executions = await executeAssistantCalls({ calls, role: input.role, userId: input.userId, supabase: input.supabase, deadlineAt, now: resolvedRuntime.now });
    for (const { call, result } of executions) {
      results.push(result);
      if (result.pendingAction) return { text: "I prepared this action for your confirmation.", displays: results.flatMap((item) => item.display ? [item.display] : []), pendingAction: result.pendingAction, model };
      messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify({ result: result.modelSummary }) });
    }
  }
  throw new Error("ASSISTANT_TOOL_LOOP_LIMIT");
}

export async function runGroqAssistant(input: { role: AssistantRole; userId: string; supabase: SupabaseClient; messages: ChatMessage[]; language?: string }, runtime: Runtime = {}) {
  if (!assistantConfig.groqApiKey) throw new Error("ASSISTANT_CONFIGURATION_REQUIRED");
  return runGroqRemote(input, runtime);
}
