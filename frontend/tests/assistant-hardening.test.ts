import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantConfig, assistantErrorStatus } from "@/lib/assistant/config";
import { runGeminiAssistant } from "@/lib/assistant/gemini";
import { assistantErrorMessage, assistantLanguageLabel, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import { assistantFunctionDeclarationsForRole } from "@/lib/assistant/tools";

const input = { role: "doctor" as const, userId: "pilot-doctor", supabase: {} as never, messages: [{ role: "user" as const, text: "hello" }] };

describe("assistant error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    assistantConfig.geminiApiKey = "";
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
    await expect(runGeminiAssistant(input)).rejects.toThrow("offline");
    expect(assistantErrorMessage()).toMatch(/could not connect/i);
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
    expect(names).toEqual(["doctor_appointments", "doctor_schedule_stats"]);
  });

  it("does not expose doctor schedule statistics to patients", () => {
    const names = assistantFunctionDeclarationsForRole("patient").map((tool) => tool.name);
    expect(names).toContain("patient_appointments");
    expect(names).toContain("doctor_slots");
    expect(names).not.toContain("doctor_appointments");
    expect(names).not.toContain("doctor_schedule_stats");
  });
});
