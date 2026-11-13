import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantConfig, assistantErrorStatus } from "@/lib/assistant/config";
import { runGroqAssistant } from "@/lib/assistant/groq";
import * as bookingQueries from "@/lib/booking/queries";
import { assistantBookingPreviewRequiredText, assistantErrorCanRetry, assistantErrorMessage, assistantGroundedAppointmentText, assistantGroundedResultText, assistantIsFreeformSlotPrompt, assistantIsUnstructuredBookingPreview, assistantLanguageLabel, assistantLanguageOptions, assistantRequiresVerifiedDoctorData, assistantResponseLanguageInstruction, assistantTypedSlotSelectionRequiredText, assistantVerificationRequiredText, speechRecognitionLanguage, speechSynthesisLanguage } from "@/lib/assistant/presentation";
import * as appointmentQueries from "@/lib/appointments/queries";
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

  it.each([
    ["en-IN", "English"],
    ["hi-IN", "Hindi using Devanagari"],
    ["hinglish", "natural Hinglish"],
  ])("instructs Groq to reply in the selected %s language", async (language, expectedInstruction) => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(completed("Response."));
    await runGroqAssistant({ ...input, language }, runtimeFor(create));
    const [request] = create.mock.calls[0] as [Record<string, unknown>];
    const messages = request.messages as Array<{ content?: string }>;
    expect(messages[0]?.content).toContain(expectedInstruction);
  });

  it("uses the fallback immediately after a recoverable primary failure without logging prompts or keys", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockResolvedValueOnce(completed("Recovered."));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGroqAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Recovered." });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("hello");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("test-key");
    expect(warning).toHaveBeenCalledWith("assistant_groq_attempt_failed", expect.objectContaining({ providerReason: "UNAVAILABLE", status: 503 }));
  });

  it("tries fallback after transient and unavailable primary models, then returns failure only after both fail", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockResolvedValueOnce(completed("Fallback response.", "openai/gpt-oss-120b"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runGroqAssistant(input, runtimeFor(create))).resolves.toMatchObject({ text: "Fallback response.", model: "openai/gpt-oss-120b" });
    expect(create.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    const unavailable = vi.fn().mockRejectedValueOnce(providerError(404, "NOT_FOUND")).mockResolvedValueOnce(completed("Fallback after deprecation."));
    await expect(runGroqAssistant(input, runtimeFor(unavailable))).resolves.toMatchObject({ text: "Fallback after deprecation." });
    expect(unavailable.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    const bothUnavailable = vi.fn().mockRejectedValueOnce(providerError(503, "UNAVAILABLE")).mockRejectedValueOnce(providerError(503, "UNAVAILABLE"));
    await expect(runGroqAssistant(input, runtimeFor(bothUnavailable))).rejects.toThrow("ASSISTANT_UNAVAILABLE");
    expect(bothUnavailable.mock.calls.map((call) => call[0].model)).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
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
    expect(timeout).toHaveBeenCalledTimes(2);
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

  it("returns structured doctor data instead of model-invented names and fees", async () => {
    assistantConfig.groqApiKey = "test-key";
    vi.spyOn(assistantTools, "runAssistantTool").mockResolvedValueOnce({
      modelSummary: "Found 1 verified doctor.",
      display: {
        kind: "doctors",
        title: "Verified doctors",
        data: [{ doctor_id: "doctor-1", full_name: "Dr. Rao", consultation_fee_minor: 100000, consultation_currency: "INR" }],
      },
    });
    const create = vi.fn()
      .mockResolvedValueOnce(toolCompletion([{ id: "search-1", name: "search_doctors", arguments: "{}" }]))
      .mockResolvedValueOnce(completed("Dr. Invented is available for ₹5 at a fee of ₹1,000."));
    const result = await runGroqAssistant({ ...input, role: "patient" }, runtimeFor(create));
    expect(result.text).toBe("I found 1 verified doctor. Their details are shown below.");
    expect(result.text).not.toContain("Invented");
    expect(result.displays).toHaveLength(1);
    expect(result.displays[0]).toMatchObject({ kind: "doctors", data: [{ full_name: "Dr. Rao" }] });
  });

  it("grounds doctor appointment replies and keeps patient details and identifiers out of Groq context", async () => {
    assistantConfig.groqApiKey = "test-key";
    vi.spyOn(assistantTools, "runAssistantTool").mockResolvedValueOnce({
      modelSummary: "Found 2 appointments.",
      display: {
        kind: "appointments",
        title: "Doctor appointments",
        data: [
          { patient_count: 1, status: "confirmed", slot_start_at: "2026-11-14T04:00:00.000Z", slot_end_at: "2026-11-14T04:30:00.000Z", timezone: "Asia/Kolkata", reason: null },
          { patient_count: 1, status: "confirmed", slot_start_at: "2026-12-08T03:30:00.000Z", slot_end_at: "2026-12-08T05:00:00.000Z", timezone: "Asia/Kolkata", reason: null },
        ],
      },
    });
    const create = vi.fn()
      .mockResolvedValueOnce(toolCompletion([{ id: "appointments-1", name: "doctor_appointments", arguments: "{\"tab\":\"upcoming\"}" }]))
      .mockResolvedValueOnce(completed("You have one appointment in 2025-06-22. Patient S, idempotency key fake-key."));
    const result = await runGroqAssistant(input, runtimeFor(create));
    expect(result.text).toBe("I found 2 appointments. Details are shown below.");
    expect(result.displays[0]?.data).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("Patient S");
    expect(JSON.stringify(result)).not.toContain("fake-key");
    expect(JSON.stringify(result)).not.toContain("appointment_id");
    const continuation = create.mock.calls[1][0].messages as Array<{ role?: string; content?: string }>;
    const toolContext = continuation.find((message) => message.role === "tool")?.content ?? "";
    expect(toolContext).toBe('{"result":"Found 2 appointments."}');
  });

  it("uses the signed-in doctor's upcoming RPC rows and removes identifiers and names from appointment cards", async () => {
    const rows: appointmentQueries.DoctorAppointment[] = [
      { appointment_id: "appointment-1", patient_name: "Raj Pandey", status: "confirmed", reason: null, clinic_name: "Clinic", timezone: "Asia/Kolkata", slot_start_at: "2026-11-14T04:00:00.000Z", slot_end_at: "2026-11-14T04:30:00.000Z", scheduling_type: "wave" },
      { appointment_id: "appointment-2", patient_name: "Raj Pandey", status: "confirmed", reason: "Consultation", clinic_name: "Clinic", timezone: "Asia/Kolkata", slot_start_at: "2026-12-08T03:30:00.000Z", slot_end_at: "2026-12-08T05:00:00.000Z", scheduling_type: "stream" },
    ];
    const query = vi.spyOn(appointmentQueries, "getDoctorAppointments").mockResolvedValueOnce(rows);
    const result = await assistantTools.runAssistantTool({ name: "doctor_appointments", args: { tab: "upcoming" }, role: "doctor", userId: "doctor-1", supabase: {} as never });
    expect(query).toHaveBeenCalledWith("upcoming");
    expect(result.display?.data).toEqual([
      expect.objectContaining({ patient_count: 1, status: "confirmed", timezone: "Asia/Kolkata", slot_start_at: rows[0]?.slot_start_at }),
      expect.objectContaining({ patient_count: 1, status: "confirmed", timezone: "Asia/Kolkata", slot_start_at: rows[1]?.slot_start_at, scheduling_type: "stream" }),
    ]);
    expect(JSON.stringify(result.display)).not.toContain("Raj Pandey");
    expect(JSON.stringify(result.display)).not.toContain("appointment-1");
    await expect(assistantTools.runAssistantTool({ name: "doctor_appointments", args: {}, role: "patient", userId: "patient-1", supabase: {} as never })).rejects.toThrow("ROLE_TOOL_NOT_ALLOWED");
  });

  it("does not return model-generated doctor recommendations when no verified lookup ran", async () => {
    assistantConfig.groqApiKey = "test-key";
    const create = vi.fn().mockResolvedValueOnce(completed("Dr. Invented is nearby and charges ₹5."));
    const result = await runGroqAssistant({
      ...input,
      role: "patient",
      messages: [{ role: "user", text: "Find a cardiologist" }],
    }, runtimeFor(create));
    expect(result.text).toBe(assistantVerificationRequiredText("en-IN"));
    expect(result.text).not.toContain("Invented");
    expect(assistantRequiresVerifiedDoctorData("I want to book an appointment with Dr. Aman Pandey")).toBe(true);
    expect(assistantRequiresVerifiedDoctorData("What does a cardiologist do?")).toBe(false);
  });

  it("routes assistant doctor search and slots to verified database RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;
    await assistantTools.runAssistantTool({ name: "search_doctors", args: { specialty: "Cardiology" }, role: "patient", userId: "patient-1", supabase });
    expect(rpc).toHaveBeenCalledWith("assistant_patient_doctor_directory", { p_search: null, p_specialty: "Cardiology" });
    await assistantTools.runAssistantTool({ name: "doctor_slots", args: { doctorId: "doctor-1" }, role: "patient", userId: "patient-1", supabase });
    expect(rpc).toHaveBeenCalledWith("assistant_patient_doctor_slots", { p_doctor_id: "doctor-1" });
  });

  it("loads a doctor's verified slots directly without invoking the model", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ slot_id: "slot-1", slot_start_at: "2026-11-13T03:30:00.000Z", slot_end_at: "2026-11-13T04:00:00.000Z", timezone: "Asia/Kolkata" }],
      error: null,
    });
    const result = await assistantTools.getAssistantDoctorSlots({
      doctorId: "11111111-1111-4111-8111-111111111111",
      language: "en-IN",
      userId: "patient-1",
      supabase: { rpc } as never,
    });
    expect(rpc).toHaveBeenCalledWith("assistant_patient_doctor_slots", { p_doctor_id: "11111111-1111-4111-8111-111111111111" });
    expect(result).toMatchObject({ text: expect.stringContaining("appointment times are available"), displays: [{ kind: "slots" }] });
  });

  it("uses the exact selected slot ID to prepare a booking preview without invoking the model", async () => {
    const action = { id: "action-1", actionType: "booking" as const, preview: { operation: "booking" as const, doctor_name: "Dr. Rao" }, expiresAt: "2026-11-12T20:00:00.000Z" };
    const slotId = "11111111-1111-4111-8111-111111111111";
    vi.spyOn(bookingQueries, "getBookableSlot").mockResolvedValue({
      slot_id: slotId,
      doctor_id: "doctor-1",
      full_name: "Dr. Rao",
      specialty: "Cardiology",
      clinic_name: "Heart Clinic",
      timezone: "Asia/Kolkata",
      slot_start_at: "2026-11-12T09:00:00.000Z",
      slot_end_at: "2026-11-12T09:30:00.000Z",
      capacity: 1,
      remaining_capacity: 1,
      scheduling_type: "wave",
      consultation_fee_minor: 100000,
      consultation_currency: "INR",
    });
    const single = vi.fn().mockResolvedValue({ data: { id: action.id, action_type: action.actionType, preview: action.preview, expires_at: action.expiresAt }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const rpc = vi.fn().mockResolvedValue({ data: [{ slot_id: slotId }], error: null });
    const selection = await assistantTools.prepareAssistantSlotSelection({
      slotId,
      language: "en-IN",
      userId: "patient-1",
      supabase: { from, rpc } as never,
    });
    expect(bookingQueries.getBookableSlot).toHaveBeenCalledWith(slotId);
    expect(rpc).toHaveBeenCalledWith("assistant_patient_doctor_slots", { p_doctor_id: "doctor-1" });
    expect(from).toHaveBeenCalledWith("assistant_action_intents");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      preview: expect.objectContaining({
        doctor_name: "Dr. Rao",
        clinic_name: "Heart Clinic",
        slot_start_at: "2026-11-12T09:00:00.000Z",
        slot_end_at: "2026-11-12T09:30:00.000Z",
        timezone: "Asia/Kolkata",
        consultation_fee_minor: 100000,
        consultation_currency: "INR",
      }),
    }));
    expect(selection).toMatchObject({ pendingAction: action, text: expect.stringContaining("ready for review") });
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
    const tool = vi.spyOn(assistantTools, "runAssistantTool").mockResolvedValueOnce({ modelSummary: "Confirmation required.", pendingAction: { id: "action-1", actionType: "cancellation", preview: { operation: "cancellation" }, expiresAt: "2026-11-12T20:00:00.000Z" } });
    const sensitive = vi.fn().mockResolvedValueOnce(toolCompletion([{ id: "cancel-one", name: "prepare_cancellation", arguments: "{\"appointmentId\":\"appointment-1\"}" }, { id: "cancel-two", name: "prepare_cancellation", arguments: "{\"appointmentId\":\"appointment-2\"}" }]));
    await expect(runGroqAssistant({ ...input, role: "patient" }, runtimeFor(sensitive))).resolves.toMatchObject({ pendingAction: { id: "action-1", actionType: "cancellation" } });
    expect(tool).toHaveBeenCalledTimes(1);
  });
});

describe("assistant language, permissions, and validation", () => {
  it("uses distinct English, Hindi, and Hinglish speech locales", () => {
    expect(new Set(assistantLanguageOptions.map((option) => option.value)).size).toBe(3);
    expect(assistantLanguageLabel("hinglish")).toBe("Hinglish");
  });
  it.each([
    ["en-IN", "English", "en-IN", "en-IN"],
    ["hi-IN", "Hindi", "hi-IN", "hi-IN"],
    ["hinglish", "Hinglish", "en-IN", "hi-IN"],
  ])("maps %s selection to reply and speech preferences", (language, replyLanguage, recognitionLanguage, synthesisLanguage) => {
    expect(assistantResponseLanguageInstruction(language)).toContain(replyLanguage);
    expect(speechRecognitionLanguage(language)).toBe(recognitionLanguage);
    expect(speechSynthesisLanguage(language)).toBe(synthesisLanguage);
  });
  it("uses grounded results and exposes retry only for recoverable failures", () => {
    expect(assistantGroundedResultText("doctors", 2, "en-IN")).toContain("2 verified doctors");
    expect(assistantGroundedResultText("slots", 0, "hi-IN")).toContain("कोई उपलब्ध");
    expect(assistantGroundedAppointmentText(2, "en-IN")).toContain("2 appointments");
    expect(assistantGroundedAppointmentText(0, "hi-IN")).toContain("कोई अपॉइंटमेंट नहीं");
    expect(assistantIsFreeformSlotPrompt("Please tell me the date and time.", "13 Nov 2026 9:00 AM – 9:30 AM")).toBe(true);
    expect(assistantIsUnstructuredBookingPreview("Great choice! Here is your booking preview. Please confirm.")).toBe(true);
    expect(assistantTypedSlotSelectionRequiredText("en-IN")).toContain("button");
    expect(assistantBookingPreviewRequiredText("en-IN")).toContain("Choose an available slot");
    expect(assistantErrorCanRetry("ASSISTANT_UNAVAILABLE")).toBe(true);
    expect(assistantErrorCanRetry("ASSISTANT_PROVIDER_MODEL_UNAVAILABLE")).toBe(true);
    expect(assistantErrorCanRetry("ASSISTANT_PROVIDER_AUTH_FAILED")).toBe(false);
    expect(assistantErrorCanRetry("ASSISTANT_PROVIDER_INVALID_REQUEST")).toBe(false);
  });
  it("keeps role-specific tools isolated and requires slot-button selection for bookings", async () => {
    const doctorTools = assistantFunctionDeclarationsForRole("doctor").map((tool) => tool.name);
    expect(doctorTools).not.toContain("patient_appointments");
    expect(doctorTools).toEqual(expect.arrayContaining(["prepare_doctor_cancellation", "prepare_doctor_slot_cancellation", "prepare_doctor_completion", "prepare_doctor_prescription", "prepare_elastic_adjustment", "prepare_availability_creation", "prepare_doctor_leave"]));
    const patientTools = assistantFunctionDeclarationsForRole("patient").map((tool) => tool.name);
    expect(patientTools).not.toContain("doctor_schedule_stats");
    expect(patientTools).not.toContain("prepare_booking");
    expect(patientTools).toContain("patient_elastic_proposals");
    await expect(assistantTools.runAssistantTool({ name: "prepare_booking", args: { slotId: "slot-1" }, role: "patient", userId: "patient-1", supabase: {} as never })).rejects.toThrow("ROLE_TOOL_NOT_ALLOWED");
  });
  it("keeps medication details out of prescription summaries sent to Groq", () => {
    const summary = assistantTools.summarizeForModel([{ published_at: "2026-11-13T00:00:00Z", prescription_items: [{ medication_name: "Sensitive medicine", dosage: "10mg", frequency: "daily", duration: "7 days" }] }]);
    expect(summary).not.toContain("Sensitive medicine");
    expect(summary).not.toContain("10mg");
    expect(summary).toContain("published_at");
  });
  it("rejects malformed conversations and confirmation decisions", () => {
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [] }).success).toBe(false);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", messages: [{ role: "user", text: "x".repeat(4_001) }] }).success).toBe(false);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", selectedSlotId: "11111111-1111-4111-8111-111111111111", messages: [{ role: "user", text: "Choose this time" }] }).success).toBe(true);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", selectedDoctorId: "11111111-1111-4111-8111-111111111111", messages: [{ role: "user", text: "Show available times" }] }).success).toBe(true);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", selectedProposalDecision: { proposalId: "11111111-1111-4111-8111-111111111111", decision: "choose_slot" }, messages: [{ role: "user", text: "Choose a slot" }] }).success).toBe(false);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", selectedProposalDecision: { proposalId: "11111111-1111-4111-8111-111111111111", decision: "approve" }, messages: [{ role: "user", text: "Approve" }] }).success).toBe(true);
    expect(assistantChatRequestSchema.safeParse({ role: "doctor", language: "en-IN", selectedSlotId: "11111111-1111-4111-8111-111111111111", messages: [{ role: "user", text: "Choose this time" }] }).success).toBe(false);
    expect(assistantChatRequestSchema.safeParse({ role: "patient", language: "en-IN", selectedDoctorId: "11111111-1111-4111-8111-111111111111", selectedSlotId: "22222222-2222-4222-8222-222222222222", messages: [{ role: "user", text: "Choose this time" }] }).success).toBe(false);
    expect(assistantDecisionSchema.safeParse({ decision: "confirm" }).success).toBe(true);
    expect(assistantDecisionSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});
