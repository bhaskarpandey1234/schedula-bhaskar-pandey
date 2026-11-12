import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantConfig, assistantErrorStatus } from "@/lib/assistant/config";
import { runGeminiAssistant } from "@/lib/assistant/gemini";
import { assistantErrorMessage, assistantLanguageLabel, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import { assistantFunctionDeclarationsForRole } from "@/lib/assistant/tools";
import { assistantChatRequestSchema, assistantDecisionSchema } from "@/lib/assistant/schemas";

const input = { role: "doctor" as const, userId: "pilot-doctor", supabase: {} as never, messages: [{ role: "user" as const, text: "hello" }] };

describe("assistant error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    assistantConfig.geminiApiKey = "";
  });

  it("does not fall back to local database tools when Gemini is unavailable", async () => {
    assistantConfig.geminiApiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_UNAVAILABLE");
    expect(assistantErrorMessage("ASSISTANT_UNAVAILABLE")).toMatch(/temporarily unavailable/i);

    assistantConfig.geminiApiKey = "";
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_CONFIGURATION_REQUIRED");
    expect(assistantErrorStatus(new Error("ASSISTANT_CONFIGURATION_REQUIRED"))).toBe(503);
    expect(assistantErrorMessage("ASSISTANT_CONFIGURATION_REQUIRED")).toMatch(/api key/i);
  });

  it("maps temporary Gemini unavailability and quota errors", async () => {
    assistantConfig.geminiApiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_UNAVAILABLE");
    expect(assistantErrorStatus(new Error("ASSISTANT_UNAVAILABLE"))).toBe(503);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_QUOTA_EXHAUSTED");
    expect(assistantErrorStatus(new Error("ASSISTANT_QUOTA_EXHAUSTED"))).toBe(429);
  });

  it("maps aborted requests to a retryable timeout", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const error = new Error("aborted");
    error.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(error));
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_TIMEOUT");
    expect(assistantErrorStatus(new Error("ASSISTANT_TIMEOUT"))).toBe(504);
  });

  it("keeps network failures separate from provider errors", async () => {
    assistantConfig.geminiApiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_NETWORK_ERROR");
    expect(assistantErrorStatus(new Error("ASSISTANT_NETWORK_ERROR"))).toBe(503);
    expect(assistantErrorMessage("ASSISTANT_NETWORK_ERROR")).toMatch(/reach Gemini/i);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("invalid", { status: 401 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("GEMINI_AUTH_FAILED");
    expect(assistantErrorMessage("GEMINI_AUTH_FAILED")).toMatch(/api key/i);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("GEMINI_MODEL_UNAVAILABLE");
    expect(assistantErrorMessage("GEMINI_MODEL_UNAVAILABLE")).toMatch(/model/i);
    expect(assistantErrorMessage("ASSISTANT_PAYMENT_SANDBOX_REQUIRED")).toMatch(/test-mode/i);
  });

  it("preserves Gemini thought signatures across a function-call continuation", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const thoughtSignature = "provider-generated-signature";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "doctor_leaves", args: {} }, thoughtSignature }] } }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: "You have no recorded leave." }] } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    } as never;

    await expect(runGeminiAssistant({ ...input, supabase, messages: [{ role: "user", text: "Do I have leave?" }] })).resolves.toMatchObject({
      text: "You have no recorded leave.",
    });

    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> };
    expect(secondRequest.contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "doctor_leaves", args: {} }, thoughtSignature }],
    });
  });

  it("maps a rejected Gemini tool continuation to a safe error", async () => {
    assistantConfig.geminiApiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("invalid", { status: 400 })));
    await expect(runGeminiAssistant(input)).rejects.toThrow("GEMINI_INVALID_REQUEST");
    expect(assistantErrorStatus(new Error("GEMINI_INVALID_REQUEST"))).toBe(502);
    expect(assistantErrorMessage("GEMINI_INVALID_REQUEST")).toMatch(/tool conversation/i);
  });
});

describe("assistant language presentation", () => {
  it("uses distinct English, Hindi, and Hinglish values", () => {
    expect(new Set(assistantLanguageOptions.map((option) => option.value)).size).toBe(3);
    expect(assistantLanguageLabel("hinglish")).toBe("Hinglish");
    expect(speechRecognitionLanguage("hinglish")).toBe("en-IN");
    expect(speechRecognitionLanguage("hi-IN")).toBe("hi-IN");
  });
});

describe("assistant role tool allowlists", () => {
  it("does not expose patient tools to doctors", () => {
    const names = assistantFunctionDeclarationsForRole("doctor").map((tool) => tool.name);
    expect(names).toEqual(["doctor_appointments", "doctor_schedule_stats", "doctor_availability", "doctor_leaves", "doctor_next_slot", "doctor_reschedule_slots"]);
  });

  it("does not expose doctor schedule statistics to patients", () => {
    const names = assistantFunctionDeclarationsForRole("patient").map((tool) => tool.name);
    expect(names).toContain("patient_appointments");
    expect(names).toContain("doctor_slots");
    expect(names).not.toContain("doctor_appointments");
    expect(names).not.toContain("doctor_schedule_stats");
  });
});

describe("assistant request validation", () => {
  it("rejects oversized or malformed conversations", () => {
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [] }).success).toBe(false);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [{ role: "user", text: "x".repeat(4_001) }] }).success).toBe(false);
  });

  it("accepts only explicit confirmation decisions", () => {
    expect(assistantDecisionSchema.safeParse({ decision: "confirm" }).success).toBe(true);
    expect(assistantDecisionSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});
