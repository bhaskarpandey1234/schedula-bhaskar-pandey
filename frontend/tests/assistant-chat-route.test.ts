import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditInsert: vi.fn(),
  runGeminiAssistant: vi.fn(),
}));

vi.mock("@/lib/assistant/config", () => ({
  assistantConfig: { textModel: "gemini-3.8-flash" },
  assertAssistantMutationOrigin: vi.fn(),
  assistantErrorStatus: (error: unknown) => error instanceof Error && error.message === "ASSISTANT_UNAVAILABLE" ? 503 : 400,
  requireAssistantPilotAccess: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-000000000001" },
    supabase: { from: () => ({ insert: mocks.auditInsert }) },
  })),
}));

vi.mock("@/lib/assistant/gemini", () => ({
  runGeminiAssistant: mocks.runGeminiAssistant,
}));

import { POST } from "@/app/api/assistant/chat/route";

function request() {
  return new Request("https://preview.example/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://preview.example" },
    body: JSON.stringify({ role: "doctor", language: "en-IN", messages: [{ role: "user", text: "hello" }] }),
  });
}

describe("assistant chat route audit events", () => {
  beforeEach(() => {
    mocks.auditInsert.mockReset().mockResolvedValue({ error: null });
    mocks.runGeminiAssistant.mockReset();
  });

  it("records one sanitized failure after provider recovery is exhausted", async () => {
    mocks.runGeminiAssistant.mockRejectedValueOnce(new Error("ASSISTANT_UNAVAILABLE"));
    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "ASSISTANT_UNAVAILABLE" });
    expect(mocks.auditInsert).toHaveBeenCalledTimes(1);
    const audit = mocks.auditInsert.mock.calls[0]?.[0];
    expect(audit).toMatchObject({
      user_id: "00000000-0000-4000-8000-000000000001",
      role: "doctor",
      event_type: "chat_turn",
      outcome: "failed",
      model: "gemini-3.8-flash",
      language: "en-IN",
      error_code: "ASSISTANT_UNAVAILABLE",
    });
    expect(JSON.stringify(audit)).not.toContain("hello");
  });

  it("audits the model that succeeded without exposing it publicly", async () => {
    mocks.runGeminiAssistant.mockResolvedValueOnce({ text: "Hello.", displays: [], pendingAction: undefined, model: "gemini-3.7-flash" });
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "Hello.", displays: [] });
    expect(mocks.auditInsert).toHaveBeenCalledWith(expect.objectContaining({ outcome: "succeeded", model: "gemini-3.7-flash" }));
  });
});
