import { assistantConfig } from "@/lib/assistant/config";
import {
  assistantGroundedAppointmentText,
  assistantGroundedResultText,
  assistantRequiresVerifiedDoctorData,
  assistantResponseLanguageInstruction,
  assistantVerificationRequiredText,
} from "@/lib/assistant/presentation";
import { assistantFunctionDeclarationsForRole, runAssistantTool } from "@/lib/assistant/tools";
import type { AssistantDisplayPayload, AssistantRole, AssistantToolResult } from "@/lib/assistant/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChatMessage = { role: "user" | "model"; text: string };

type GeminiPart =
  | { text: string; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiCandidate = {
  content?: {
    role?: "model";
    parts?: GeminiPart[];
  };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
};

const systemInstruction = (role: AssistantRole, language?: string) =>
  [
    `You are Schedula's operational assistant for a ${role}.`,
    "Only use the supplied functions for real account data and actions. Never invent appointments, doctors, slots, payments, or prescriptions.",
    "Never provide diagnosis, treatment, or medication advice. Explain that you can only help with scheduling and records.",
    "For every consequential operation, call the matching prepare_* function, show its structured review, and wait for explicit confirmation. Never say an operation succeeded until the action endpoint reports success.",
    ...(role === "doctor"
      ? [
          "Never invent prescription details or recommend medication. Only prepare a prescription when the doctor explicitly supplies every required field; the doctor must review and confirm it.",
          "Never guess dates, times, recurrence, capacity, or other required scheduling details; ask the doctor for missing information.",
          "For availability creation, elastic schedule changes, leave, slot or appointment cancellation, and completion, use the matching prepare_* function and wait for confirmation.",
        ]
      : []),
    ...(role === "patient"
      ? [
          "For doctor initiated elastic appointment changes, show the actual recommended time and available alternatives, then require a structured patient choice and a separate confirmation before applying it.",
          "For booking, never call prepare_booking from free-form text. Show verified doctors and available slots as structured choices; the application creates a review only after a slot button is selected. Never ask the patient to type a date or time, present a prose booking preview, or treat a typed yes as confirmation.",
        ]
      : []),
    assistantResponseLanguageInstruction(language),
  ].join(" ");

export async function runGeminiAssistant(input: {
  role: AssistantRole;
  userId: string;
  supabase: SupabaseClient;
  messages: ChatMessage[];
  language?: string;
  signal?: AbortSignal;
}) {
  if (!assistantConfig.geminiApiKey) {
    throw new Error("ASSISTANT_CONFIGURATION_REQUIRED");
  }

  const model = assistantConfig.geminiTextModel || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${assistantConfig.geminiApiKey}`;

  const contents: GeminiContent[] = input.messages.map((message) => ({
    role: message.role === "model" ? "model" : "user",
    parts: [{ text: message.text }],
  }));

  const tools = [
    {
      functionDeclarations: assistantFunctionDeclarationsForRole(input.role).map(
        (declaration) => {
          const next = { ...declaration } as Record<string, unknown>;
          delete next.type;
          return next;
        }
      ),
    },
  ];

  const displays: AssistantDisplayPayload[] = [];

  for (let iteration = 0; iteration < 4; iteration += 1) {
    if (input.signal?.aborted) throw new Error("ASSISTANT_ABORTED");
    const body = {
      systemInstruction: {
        parts: [{ text: systemInstruction(input.role, input.language) }],
      },
      contents,
      tools,
    };

    const controller = new AbortController();
    const abortRequest = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (input.signal?.aborted) throw new Error("ASSISTANT_ABORTED");
        throw new Error("ASSISTANT_TIMEOUT");
      }
      throw new Error("ASSISTANT_NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abortRequest);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("ASSISTANT_PROVIDER_AUTH_FAILED");
      }
      if (response.status === 429) {
        throw new Error("ASSISTANT_QUOTA_EXHAUSTED");
      }
      if (response.status === 404) {
        throw new Error("ASSISTANT_PROVIDER_MODEL_UNAVAILABLE");
      }
      if (response.status === 503) {
        throw new Error("ASSISTANT_UNAVAILABLE");
      }
      throw new Error("ASSISTANT_PROVIDER_REQUEST_FAILED");
    }

    const payload = (await response.json()) as GeminiResponse;
    if (payload.error) {
      throw new Error("ASSISTANT_PROVIDER_REQUEST_FAILED");
    }

    const candidate = payload.candidates?.[0];
    const modelContent = candidate?.content;
    const parts = modelContent?.parts ?? [];

    const functionCalls = parts
      .filter((part): part is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in part)
      .map((part) => part.functionCall);

    if (functionCalls.length === 0) {
      const text = parts
        .filter((part): part is Extract<GeminiPart, { text: string }> => "text" in part)
        .map((part) => part.text)
        .join(" ")
        .trim();

      const latestUserMessage = [...input.messages].reverse().find((item) => item.role === "user")?.text ?? "";
      const groundedResult =
        input.role === "patient"
          ? [...displays].reverse().find((display) => display.kind === "doctors" || display.kind === "slots")
          : undefined;
      const groundedAppointments =
        input.role === "doctor"
          ? [...displays].reverse().find((display) => display.kind === "appointments")
          : undefined;
      const groundedKind =
        groundedResult?.kind === "doctors" || groundedResult?.kind === "slots" ? groundedResult.kind : undefined;
      const count = groundedResult
        ? Array.isArray(groundedResult.data)
          ? groundedResult.data.length
          : groundedResult.data
            ? 1
            : 0
        : 0;

      return {
        text: groundedAppointments
          ? assistantGroundedAppointmentText(
              Array.isArray(groundedAppointments.data)
                ? groundedAppointments.data.length
                : groundedAppointments.data
                  ? 1
                  : 0,
              input.language
            )
          : groundedKind
            ? assistantGroundedResultText(groundedKind, count, input.language)
            : input.role === "patient" && assistantRequiresVerifiedDoctorData(latestUserMessage)
              ? assistantVerificationRequiredText(input.language)
              : text || "I could not produce a response. Please try again.",
        displays,
        pendingAction: undefined,
        model,
      };
    }

    // Preserve the model content turn with its thoughtSignature
    contents.push({
      role: "model",
      parts: modelContent?.parts ?? [],
    });

    const responseParts: GeminiPart[] = [];
    for (const call of functionCalls) {
      const result: AssistantToolResult = await runAssistantTool({
        name: call.name,
        args: call.args ?? {},
        role: input.role,
        userId: input.userId,
        supabase: input.supabase,
      });

      if (result.display) {
        displays.push(result.display);
      }

      if (result.pendingAction) {
        return {
          text: "I prepared this action for your confirmation.",
          displays,
          pendingAction: result.pendingAction,
          model,
        };
      }

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: result.modelSummary },
        },
      });
    }

    contents.push({
      role: "user",
      parts: responseParts,
    });
  }

  throw new Error("ASSISTANT_TOOL_LOOP_LIMIT");
}
