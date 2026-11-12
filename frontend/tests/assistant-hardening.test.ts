import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantConfig, assistantErrorStatus } from "@/lib/assistant/config";
import { runGeminiAssistant } from "@/lib/assistant/gemini";
import { assistantErrorMessage, assistantLanguageLabel, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import * as assistantTools from "@/lib/assistant/tools";
import { assistantFunctionDeclarationsForRole } from "@/lib/assistant/tools";
import { assistantChatRequestSchema, assistantDecisionSchema } from "@/lib/assistant/schemas";

const input = { role: "doctor" as const, userId: "pilot-doctor", supabase: {} as never, messages: [{ role: "user" as const, text: "hello" }] };

function providerError(status: number, reason: string) {
  return Object.assign(new Error(reason), { status });
}

function completed(text: string) {
  return {
    id: "interaction-complete",
    status: "completed",
    output_text: text,
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  };
}

function runtimeFor(create: ReturnType<typeof vi.fn>) {
  return {
    client: { interactions: { create } } as never,
    random: () => 0.5,
    sleep: async () => undefined,
  };
}

describe("assistant error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    assistantConfig.geminiApiKey = "";
    assistantConfig.textModel = "gemini-3.8-flash";
    assistantConfig.fallbackTextModel = "gemini-3.7-flash";
  });

  it("requires a configured API key", async () => {
    await expect(runGeminiAssistant(input)).rejects.toThrow("ASSISTANT_CONFIGURATION_REQUIRED");
    expect(assistantErrorStatus(new Error("ASSISTANT_CONFIGURATION_REQUIRED"))).toBe(503);
    expect(assistantErrorMessage("ASSISTANT_CONFIGURATION_REQUIRED")).toMatch(/api key/i);
  });

  it("uses stateless low-thinking Interactions requests", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(completed("Hello."));
    await expect(runGeminiAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Hello.", model: "gemini-3.8-flash" });

    expect(create).toHaveBeenCalledTimes(1);
    const [request, options] = create.mock.calls[0] as [{
      model: string;
      store: boolean;
      input: Array<Record<string, unknown>>;
      tools: Array<{ type: string; name: string }>;
      generation_config: { thinking_level: string; max_output_tokens: number };
    }, { timeout_ms: number; retries: { strategy: string } }];
    expect(request).toMatchObject({
      model: "gemini-3.8-flash",
      store: false,
      generation_config: { thinking_level: "low", max_output_tokens: 1_600 },
    });
    expect(request.input[0]).toEqual({ type: "user_input", content: [{ type: "text", text: "hello" }] });
    expect(request.tools.every((tool) => tool.type === "function")).toBe(true);
    expect(options).toMatchObject({ timeout_ms: 15_000, retries: { strategy: "none" } });
  });

  it("retries transient provider errors and keeps safe diagnostics", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const create = vi.fn()
      .mockRejectedValueOnce(providerError(503, "UNAVAILABLE: provider overloaded"))
      .mockResolvedValueOnce(completed("Recovered."));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGeminiAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Recovered." });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.8-flash"]);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("hello");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("test-key");
    expect(warning).toHaveBeenCalledWith("assistant_gemini_attempt_failed", expect.objectContaining({ providerReason: "UNAVAILABLE", status: 503 }));
  });

  it("falls back after two transient primary-model failures", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const create = vi.fn()
      .mockRejectedValueOnce(providerError(503, "UNAVAILABLE"))
      .mockRejectedValueOnce(providerError(503, "UNAVAILABLE"))
      .mockResolvedValueOnce(completed("Fallback response."));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGeminiAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Fallback response.", model: "gemini-3.7-flash" });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.7-flash"]);
  });

  it("returns normalized timeout and quota errors after retries are exhausted", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const timeout = Object.assign(new Error("request timed out"), { name: "RequestTimeoutError" });
    const timedOutCreate = vi.fn().mockRejectedValue(timeout);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGeminiAssistant(input, runtimeFor(timedOutCreate))).rejects.toThrow("ASSISTANT_TIMEOUT");
    expect(assistantErrorStatus(new Error("ASSISTANT_TIMEOUT"))).toBe(504);

    const quotaCreate = vi.fn().mockRejectedValue(providerError(429, "RESOURCE_EXHAUSTED"));
    await expect(runGeminiAssistant(input, runtimeFor(quotaCreate))).rejects.toThrow("ASSISTANT_QUOTA_EXHAUSTED");
    expect(assistantErrorStatus(new Error("ASSISTANT_QUOTA_EXHAUSTED"))).toBe(429);
  });

  it("does not retry invalid credentials, model IDs, or payloads", async () => {
    assistantConfig.geminiApiKey = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const [status, code] of [[400, "GEMINI_INVALID_REQUEST"], [401, "GEMINI_AUTH_FAILED"], [403, "GEMINI_AUTH_FAILED"], [404, "GEMINI_MODEL_UNAVAILABLE"]] as const) {
      const create = vi.fn().mockRejectedValue(providerError(status, code));
      await expect(runGeminiAssistant(input, runtimeFor(create))).rejects.toThrow(code);
      expect(create).toHaveBeenCalledTimes(1);
    }
    expect(assistantErrorMessage("GEMINI_AUTH_FAILED")).toMatch(/api key/i);
    expect(assistantErrorMessage("GEMINI_MODEL_UNAVAILABLE")).toMatch(/model/i);
    expect(assistantErrorMessage("ASSISTANT_PAYMENT_SANDBOX_REQUIRED")).toMatch(/test-mode/i);
  });

  it("preserves returned steps and exact call IDs without re-running tools on provider retry", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const thoughtStep = { type: "thought", signature: "provider-generated-signature" };
    const create = vi.fn()
      .mockResolvedValueOnce({
        id: "interaction-tool",
        status: "requires_action",
        steps: [
          thoughtStep,
          { type: "function_call", id: "call-leave-1", name: "doctor_leaves", arguments: {} },
          { type: "function_call", id: "call-leave-2", name: "doctor_leaves", arguments: { date: "2026-11-12" } },
        ],
      })
      .mockRejectedValueOnce(providerError(503, "UNAVAILABLE"))
      .mockResolvedValueOnce(completed("You have no recorded leave."));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const leaveQuery = {
      eq: vi.fn(),
      order: vi.fn(),
      then: (resolve: (value: { data: never[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    leaveQuery.eq.mockReturnValue(leaveQuery);
    leaveQuery.order.mockReturnValue(leaveQuery);
    const from = vi.fn(() => ({ select: () => leaveQuery }));
    const supabase = {
      from,
    } as never;

    await expect(runGeminiAssistant({ ...input, supabase, messages: [{ role: "user", text: "Do I have leave?" }] }, runtimeFor(create))).resolves.toMatchObject({
      text: "You have no recorded leave.",
    });

    expect(from).toHaveBeenCalledTimes(2);
    const continuation = create.mock.calls[1]?.[0] as { input: Array<Record<string, unknown>> };
    expect(continuation.input).toContainEqual(thoughtStep);
    expect(continuation.input).toContainEqual({
      type: "function_result",
      name: "doctor_leaves",
      call_id: "call-leave-1",
      result: [{ type: "text", text: JSON.stringify({ result: "Found 0 recorded leave occurrences." }) }],
    });
    expect(continuation.input).toContainEqual({
      type: "function_result",
      name: "doctor_leaves",
      call_id: "call-leave-2",
      result: [{ type: "text", text: JSON.stringify({ result: "Found 0 recorded leave occurrences." }) }],
    });
    expect(create.mock.calls[2]?.[0].input).toEqual(continuation.input);
  });

  it("runs read-only calls in parallel while preserving call order", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const create = vi.fn()
      .mockResolvedValueOnce({
        id: "interaction-tool",
        status: "requires_action",
        steps: [
          { type: "function_call", id: "call-leave-1", name: "doctor_leaves", arguments: {} },
          { type: "function_call", id: "call-leave-2", name: "doctor_leaves", arguments: { date: "2026-11-12" } },
        ],
      })
      .mockResolvedValueOnce(completed("Done."));
    let resolveFirst!: (value: { data: never[]; error: null }) => void;
    let resolveSecond!: (value: { data: never[]; error: null }) => void;
    const firstResult = new Promise<{ data: never[]; error: null }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = new Promise<{ data: never[]; error: null }>((resolve) => {
      resolveSecond = resolve;
    });
    let queryIndex = 0;
    const from = vi.fn(() => {
      const pending = queryIndex++ === 0 ? firstResult : secondResult;
      const query = {
        eq: vi.fn(),
        order: vi.fn(),
        then: (resolve: (value: { data: never[]; error: null }) => unknown) => pending.then(resolve),
      };
      query.eq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      return { select: () => query };
    });

    const run = runGeminiAssistant({ ...input, supabase: { from } as never }, runtimeFor(create));
    await vi.waitFor(() => expect(from).toHaveBeenCalledTimes(2));
    resolveFirst({ data: [], error: null });
    resolveSecond({ data: [], error: null });
    await expect(run).resolves.toMatchObject({ text: "Done." });

    const continuation = create.mock.calls[1]?.[0] as { input: Array<Record<string, unknown>> };
    expect(continuation.input.findIndex((step) => step.call_id === "call-leave-1")).toBeLessThan(continuation.input.findIndex((step) => step.call_id === "call-leave-2"));
  });

  it("stops after the first sensitive preview without executing a duplicate", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const tool = vi.spyOn(assistantTools, "runAssistantTool")
      .mockResolvedValueOnce({ modelSummary: "Confirmation required.", pendingAction: { id: "action-1", actionType: "booking", preview: { operation: "booking" }, expiresAt: "2026-11-12T20:00:00.000Z" } });
    const create = vi.fn().mockResolvedValueOnce({
      id: "interaction-sensitive",
      status: "requires_action",
      steps: [
        { type: "function_call", id: "call-book-1", name: "prepare_booking", arguments: { slotId: "slot-1" } },
        { type: "function_call", id: "call-book-2", name: "prepare_booking", arguments: { slotId: "slot-2" } },
      ],
    });

    await expect(runGeminiAssistant({ ...input, role: "patient" }, runtimeFor(create))).resolves.toMatchObject({
      pendingAction: { id: "action-1" },
    });
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("rejects tool execution once the total deadline has expired", async () => {
    assistantConfig.geminiApiKey = "test-key";
    const tool = vi.spyOn(assistantTools, "runAssistantTool");
    const create = vi.fn().mockResolvedValueOnce({
      id: "interaction-expired",
      status: "requires_action",
      steps: [{ type: "function_call", id: "call-expired", name: "doctor_leaves", arguments: {} }],
    });
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(45_001);

    await expect(runGeminiAssistant(input, { ...runtimeFor(create), now })).rejects.toThrow("ASSISTANT_TIMEOUT");
    expect(tool).not.toHaveBeenCalled();
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
