import { ApiError, GoogleGenAI } from "@google/genai";
import { assistantConfig } from "@/lib/assistant/config";
import { assistantFunctionDeclarationsForRole, runAssistantTool } from "@/lib/assistant/tools";
import type { AssistantRole, AssistantToolResult } from "@/lib/assistant/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChatMessage = { role: "user" | "model"; text: string };
type InteractionClient = Pick<GoogleGenAI, "interactions">;
type FunctionCallStep = { type: "function_call"; id: string; name: string; arguments: Record<string, unknown> };
type FunctionResultStep = { type: "function_result"; name: string; call_id: string; result: Array<{ type: "text"; text: string }> };
type InteractionStep = { type: string; [key: string]: unknown };
type Runtime = {
  client?: InteractionClient;
  now?: () => number;
  random?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};

type ProviderFailure = {
  code: string;
  reason: string;
  retryable: boolean;
  status?: number;
};

export const GEMINI_TURN_TIMEOUT_MS = 45_000;
export const GEMINI_ATTEMPT_TIMEOUT_MS = 15_000;
const GEMINI_TOOL_ITERATION_LIMIT = 4;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_PROVIDER_REASONS = [
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "INTERNAL",
] as const;

const systemInstruction = (role: AssistantRole, language?: string) => [
  `You are Schedula's operational assistant for a ${role}.`,
  "Only use the supplied functions for real account data and actions. Never invent appointments, doctors, slots, payments, or prescriptions.",
  "Never provide diagnosis, treatment, or medication advice. Explain that you can only help with scheduling and records.",
  "For booking, rescheduling, or cancellation, always call a prepare_* function first and wait for explicit confirmation.",
  `Reply in the user's language when clear; preferred language is ${language || "auto"}. Hindi and Hinglish are supported.`,
].join(" ");

function statusFromError(error: unknown) {
  if (error instanceof ApiError) return error.status;
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
  const timeout = status === 408 || status === 504 || name.includes("TIMEOUT") || name.includes("ABORT");
  if (timeout) return { code: "ASSISTANT_TIMEOUT", reason, retryable: true, status };
  if (status === 429) return { code: "ASSISTANT_QUOTA_EXHAUSTED", reason, retryable: true, status };
  if (status === 401 || status === 403) return { code: "GEMINI_AUTH_FAILED", reason, retryable: false, status };
  if (status === 404) return { code: "GEMINI_MODEL_UNAVAILABLE", reason, retryable: false, status };
  if (status === 400) return { code: "GEMINI_INVALID_REQUEST", reason, retryable: false, status };
  if (status && RETRYABLE_STATUSES.has(status)) return { code: "ASSISTANT_UNAVAILABLE", reason, retryable: true, status };
  if (!status) return { code: "ASSISTANT_NETWORK_ERROR", reason, retryable: true };
  return { code: "GEMINI_REQUEST_FAILED", reason, retryable: false, status };
}

function retryDelayMs(retryIndex: number, random: () => number) {
  const base = Math.min(1_500, 250 * (2 ** retryIndex));
  return Math.round(base * (0.75 + random() * 0.5));
}

function messageHistory(messages: ChatMessage[]): InteractionStep[] {
  return messages.map((message) => message.role === "user"
    ? { type: "user_input", content: [{ type: "text", text: message.text }] }
    : { type: "model_output", content: [{ type: "text", text: message.text }] });
}

async function createInteractionWithRetry(input: {
  client: InteractionClient;
  history: InteractionStep[];
  role: AssistantRole;
  language?: string;
  deadlineAt: number;
  runtime: Required<Pick<Runtime, "now" | "random" | "sleep">>;
  providerAttempt: { value: number };
}) {
  const models = [assistantConfig.textModel, assistantConfig.textModel, assistantConfig.fallbackTextModel]
    .filter((model, index, values) => index < 2 || model !== values[0]);
  let lastFailure: ProviderFailure = { code: "ASSISTANT_UNAVAILABLE", reason: "UNKNOWN", retryable: true };

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const remainingMs = input.deadlineAt - input.runtime.now();
    if (remainingMs <= 0) throw new Error("ASSISTANT_TIMEOUT");
    input.providerAttempt.value += 1;
    const attempt = input.providerAttempt.value;
    const started = input.runtime.now();
    try {
      const interaction = await input.client.interactions.create({
        model,
        store: false,
        system_instruction: systemInstruction(input.role, input.language),
        input: input.history as never,
        tools: assistantFunctionDeclarationsForRole(input.role),
        generation_config: { thinking_level: "low", max_output_tokens: 1_600, tool_choice: "auto" },
      }, {
        timeout_ms: Math.min(GEMINI_ATTEMPT_TIMEOUT_MS, remainingMs),
        retries: { strategy: "none" },
      });
      return { interaction, model };
    } catch (error) {
      lastFailure = classifyProviderError(error);
      console.warn("assistant_gemini_attempt_failed", {
        attempt,
        durationMs: Math.max(0, input.runtime.now() - started),
        model,
        providerReason: lastFailure.reason,
        status: lastFailure.status ?? "network",
      });
      if (!lastFailure.retryable) throw new Error(lastFailure.code);
      if (modelIndex < models.length - 1) {
        const delay = retryDelayMs(modelIndex, input.runtime.random);
        if (input.runtime.now() + delay >= input.deadlineAt) throw new Error("ASSISTANT_TIMEOUT");
        await input.runtime.sleep(delay);
      }
    }
  }
  throw new Error(lastFailure.code);
}

function isSensitiveAssistantTool(name: string) {
  return name.startsWith("prepare_");
}

async function runAssistantToolWithDeadline(input: {
  call: FunctionCallStep;
  role: AssistantRole;
  userId: string;
  supabase: SupabaseClient;
  deadlineAt: number;
  now: () => number;
}) {
  const remainingMs = input.deadlineAt - input.now();
  if (remainingMs <= 0) throw new Error("ASSISTANT_TIMEOUT");

  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = runAssistantTool({
    name: input.call.name,
    args: input.call.arguments,
    role: input.role,
    userId: input.userId,
    supabase: input.supabase,
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("ASSISTANT_TIMEOUT")), remainingMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeAssistantCalls(input: {
  calls: FunctionCallStep[];
  role: AssistantRole;
  userId: string;
  supabase: SupabaseClient;
  deadlineAt: number;
  now: () => number;
}) {
  const firstSensitiveIndex = input.calls.findIndex((call) => isSensitiveAssistantTool(call.name));
  const callsToExecute = firstSensitiveIndex === -1
    ? input.calls
    : input.calls.slice(0, firstSensitiveIndex + 1);
  const results = new Array<AssistantToolResult | undefined>(callsToExecute.length);
  const readOnlyCalls = callsToExecute
    .map((call, index) => ({ call, index }))
    .filter(({ call }) => !isSensitiveAssistantTool(call.name));

  await Promise.all(readOnlyCalls.map(async ({ call, index }) => {
    results[index] = await runAssistantToolWithDeadline({ ...input, call });
  }));

  if (firstSensitiveIndex !== -1) {
    const call = input.calls[firstSensitiveIndex];
    results[firstSensitiveIndex] = await runAssistantToolWithDeadline({ ...input, call });
  }

  return callsToExecute.map((call, index) => ({ call, result: results[index] as AssistantToolResult }));
}

async function runGeminiRemote(input: {
  role: AssistantRole;
  userId: string;
  supabase: SupabaseClient;
  messages: ChatMessage[];
  language?: string;
}, runtime: Runtime) {
  const now = runtime.now ?? Date.now;
  const resolvedRuntime = {
    now,
    random: runtime.random ?? Math.random,
    sleep: runtime.sleep ?? ((durationMs: number) => new Promise<void>((resolve) => setTimeout(resolve, durationMs))),
  };
  const client = runtime.client ?? new GoogleGenAI({ apiKey: assistantConfig.geminiApiKey });
  const deadlineAt = now() + GEMINI_TURN_TIMEOUT_MS;
  const history = messageHistory(input.messages);
  const providerAttempt = { value: 0 };

  for (let iteration = 0; iteration < GEMINI_TOOL_ITERATION_LIMIT; iteration += 1) {
    const { interaction, model } = await createInteractionWithRetry({
      client,
      history,
      role: input.role,
      language: input.language,
      deadlineAt,
      runtime: resolvedRuntime,
      providerAttempt,
    });
    const steps = interaction.steps ?? [];
    const calls = steps.filter((step) => step.type === "function_call") as FunctionCallStep[];
    const text = interaction.output_text?.trim() ?? "";
    if (!calls.length) {
      return { text: text || "I could not produce a response. Please try again.", displays: [] as AssistantToolResult[], pendingAction: undefined, model };
    }

    history.push(...steps as InteractionStep[]);
    const results: AssistantToolResult[] = [];
    const functionResults: FunctionResultStep[] = [];
    const toolExecutions = await executeAssistantCalls({
      calls,
      role: input.role,
      userId: input.userId,
      supabase: input.supabase,
      deadlineAt,
      now: resolvedRuntime.now,
    });
    for (const { call, result } of toolExecutions) {
      results.push(result);
      if (result.pendingAction) {
        return {
          text: "I prepared this action for your confirmation.",
          displays: results.flatMap((item) => item.display ? [item.display] : []),
          pendingAction: result.pendingAction,
          model,
        };
      }
      functionResults.push({
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: [{ type: "text", text: JSON.stringify({ result: result.modelSummary }) }],
      });
    }
    history.push(...functionResults);
  }
  throw new Error("ASSISTANT_TOOL_LOOP_LIMIT");
}

export async function runGeminiAssistant(input: {
  role: AssistantRole;
  userId: string;
  supabase: SupabaseClient;
  messages: ChatMessage[];
  language?: string;
}, runtime: Runtime = {}) {
  if (!assistantConfig.geminiApiKey) throw new Error("ASSISTANT_CONFIGURATION_REQUIRED");
  return runGeminiRemote(input, runtime);
}
