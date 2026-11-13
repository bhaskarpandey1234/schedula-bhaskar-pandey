import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantConfig, assistantErrorStatus } from "@/lib/assistant/config";
import { runGroqAssistant } from "@/lib/assistant/groq";
import { assistantErrorMessage, assistantLanguageLabel, assistantLanguageOptions, speechRecognitionLanguage } from "@/lib/assistant/presentation";
import * as assistantTools from "@/lib/assistant/tools";
import { assistantFunctionDeclarationsForRole } from "@/lib/assistant/tools";
import { assistantChatRequestSchema, assistantDecisionSchema } from "@/lib/assistant/schemas";

const input = { role: "doctor" as const, userId: "pilot-doctor", supabase: {} as never, messages: [{ role: "user" as const, text: "hello" }] };
function providerError(status: number, reason: string) { return Object.assign(new Error(reason), { status }); }
function completed(text: string, model?: string) { return { model, choices: [{ message: { content: text } }] }; }
function toolCompletion(calls: Array<{ id: string; name: string; arguments: string }>) { return { choices: [{ message: { content: null, tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) } }] }; }
function runtimeFor(create: ReturnType<typeof vi.fn>) { return { client: { chat: { completions: { create } } } as never, random: () => 0.5, sleep: async () => undefined }; }

describe("Groq assistant provider", () => {
  afterEach(() => { vi.restoreAllMocks(); assistantConfig.groqApiKey = ""; assistantConfig.textModel = "qwen/qwen3.8-27b"; assistantConfig.fallbackTextModel = "openai/gpt-oss-120b"; });

  it("requires a configured API key", async () => {
    await expect(runGroqAssistant(input)).rejects.toThrow("ASSISTANT_CONFIGURATION_REQUIRED");
    expect(assistantErrorStatus(new Error("ASSISTANT_CONFIGURATION_REQUIRED"))).toBe(503);
    expect(assistantErrorMessage("ASSISTANT_CONFIGURATION_REQUIRED")).toMatch(/api key/i);
  });

  it("uses Groq Chat Completions with hidden instruct reasoning and nested tools", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(completed("Hello.", "qwen/qwen3.8-27b"));
    await expect(runGroqAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Hello.", model: "qwen/qwen3.8-27b" });
    const [request, options] = create.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toMatchObject({ model: "qwen/qwen3.8-27b", tool_choice: "auto", max_completion_tokens: 1_600, reasoning_effort: "none", reasoning_format: "hidden" });
    expect((request.messages as Array<Record<string, unknown>>)[0]).toMatchObject({ role: "system" });
    expect((request.messages as Array<Record<string, unknown>>)[1]).toEqual({ role: "user", content: "hello" });
    expect((request.tools as Array<Record<string, unknown>>).every((tool) => tool.type === "function" && typeof (tool.function as { name?: unknown }).name === "string")).toBe(true);
    expect(options).toMatchObject({ timeout: 15_000, maxRetries: 0 });
  });

  it("retries a transient primary failure before succeeding without logging prompts or keys", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockResolvedValueOnce(completed("Recovered."));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGroqAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Recovered." });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "qwen/qwen3.8-27b"]);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("hello");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("test-key");
    expect(warning).toHaveBeenCalledWith("assistant_groq_attempt_failed", expect.objectContaining({ providerReason: "UNAVAILABLE", status: 503 }));
  });

  it("falls back after transient primary failures and on an unavailable model", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockResolvedValueOnce(completed("Fallback response.", "openai/gpt-oss-120b"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGroqAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Fallback response.", model: "openai/gpt-oss-120b" });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    const unavailable = vi.fn().mockRejectedValueOnce(providerError(404, "NOT_FOUND")).mockResolvedValueOnce(completed("Fallback after deprecation."));
    await expect(runGroqAssistant(input, runtimeFor(unavailable))).resolves.toMatchObject({ text: "Fallback after deprecation." });
    expect(unavailable.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
  });

  it("normalizes quota, timeout, credentials, and invalid payloads", async () => {
    assistantConfig.groqApiKey = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const quota = vi.fn().mockRejectedValue(providerError(429, "RATE_LIMIT"));
    await expect(runGroqAssistant(input, runtimeFor(quota))).rejects.toThrow("ASSISTANT_QUOTA_EXHAUSTED");
    expect(quota).toHaveBeenCalledTimes(2);
    expect(assistantErrorStatus(new Error("ASSISTANT_QUOTA_EXHAUSTED"))).toBe(429);
    const timeout = vi.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "RequestTimeoutError" }));
    await expect(runGroqAssistant(input, runtimeFor(timeout))).rejects.toThrow("ASSISTANT_TIMEOUT");
    expect(assistantErrorStatus(new Error("ASSISTANT_TIMEOUT"))).toBe(504);
    for (const [status, code] of [[400, "ASSISTANT_PROVIDER_INVALID_REQUEST"], [401, "ASSISTANT_PROVIDER_AUTH_FAILED"], [403, "ASSISTANT_PROVIDER_AUTH_FAILED"]] as const) {
      const create = vi.fn().mockRejectedValue(providerError(status, "INVALID"));
      await expect(runGroqAssistant(input, runtimeFor(create))).rejects.toThrow(code);
      expect(create).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves exact tool call IDs and returns tool output as role tool messages", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(toolCompletion([{ id: "call-leave-1", name: "doctor_leaves", arguments: "{}" }])).mockResolvedValueOnce(completed("You have no recorded leave."));
    const query = { eq: vi.fn(), order: vi.fn(), then: (resolve: (value: { data: never[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    await expect(runGroqAssistant({ ...input, supabase: { from: vi.fn(() => ({ select: () => query })) } as never }, runtimeFor(create))).resolves.toMatchObject({ text: "You have no recorded leave." });
    const continuation = create.mock.calls[1][0].messages as Array<Record<string, unknown>>;
    expect(continuation).toContainEqual(expect.objectContaining({ role: "assistant", tool_calls: [expect.objectContaining({ id: "call-leave-1" })] }));
    expect(continuation).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "call-leave-1", name: "doctor_leaves" }));
  });

  it("rejects malformed tool arguments before executing a tool", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(toolCompletion([{ id: "bad-call", name: "doctor_leaves", arguments: "{" }]));
    const tool = vi.spyOn(assistantTools, "runAssistantTool");
    await expect(runGroqAssistant(input, runtimeFor(create))).rejects.toThrow("ASSISTANT_PROVIDER_INVALID_REQUEST");
    expect(tool).not.toHaveBeenCalled();
  });

  it("runs read-only calls in parallel and stops after the first sensitive preview", async () => {
    assistantConfig.groqApiKey = "test-key";
    let resolveFirst!: (value: { data: never[]; error: null }) => void; let resolveSecond!: (value: { data: never[]; error: null }) => void;
    const pending = [new Promise<{ data: never[]; error: null }>((resolve) => { resolveFirst = resolve; }), new Promise<{ data: never[]; error: null }>((resolve) => { resolveSecond = resolve; })];
    let index = 0;
    const from = vi.fn(() => { const result = pending[index++]; const query = { eq: vi.fn(), order: vi.fn(), then: (resolve: (value: { data: never[]; error: null }) => unknown) => result.then(resolve) }; query.eq.mockReturnValue(query); query.order.mockReturnValue(query); return { select: () => query }; });
    const reads = vi.fn().mockResolvedValueOnce(toolCompletion([{ id: "one", name: "doctor_leaves", arguments: "{}" }, { id: "two", name: "doctor_leaves", arguments: "{}" }])).mockResolvedValueOnce(completed("Done."));
    const running = runGroqAssistant({ ...input, supabase: { from } as never }, runtimeFor(reads));
    await vi.waitFor(() => expect(from).toHaveBeenCalledTimes(2)); resolveFirst({ data: [], error: null }); resolveSecond({ data: [], error: null });
    await expect(running).resolves.toMatchObject({ text: "Done." });
    const tool = vi.spyOn(assistantTools, "runAssistantTool").mockResolvedValueOnce({ modelSummary: "Confirmation required.", pendingAction: { id: "action-1", actionType: "booking", preview: { operation: "booking" }, expiresAt: "2026-11-12T20:00:00.000Z" } });
    const sensitive = vi.fn().mockResolvedValueOnce(toolCompletion([{ id: "book-one", name: "prepare_booking", arguments: "{\"slotId\":\"slot-1\"}" }, { id: "book-two", name: "prepare_booking", arguments: "{\"slotId\":\"slot-2\"}" }]));
    await expect(runGroqAssistant({ ...input, role: "patient" }, runtimeFor(sensitive))).resolves.toMatchObject({ pendingAction: { id: "action-1" } });
    expect(tool).toHaveBeenCalledTimes(1);
  });
});

describe("assistant language, permissions, and validation", () => {
  it("uses distinct English, Hindi, and Hinglish values", () => { expect(new Set(assistantLanguageOptions.map((option) => option.value)).size).toBe(3); expect(assistantLanguageLabel("hinglish")).toBe("Hinglish"); expect(speechRecognitionLanguage("hinglish")).toBe("en-IN"); });
  it("keeps role-specific tools isolated", () => { expect(assistantFunctionDeclarationsForRole("doctor").map((tool) => tool.name)).not.toContain("patient_appointments"); expect(assistantFunctionDeclarationsForRole("patient").map((tool) => tool.name)).not.toContain("doctor_schedule_stats"); });
  it("rejects malformed conversations and confirmation decisions", () => { expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [] }).success).toBe(false); expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [{ role: "user", text: "x".repeat(4_001) }] }).success).toBe(false); expect(assistantDecisionSchema.safeParse({ decision: "confirm" }).success).toBe(true); expect(assistantDecisionSchema.safeParse({ decision: "maybe" }).success).toBe(false); });
});
