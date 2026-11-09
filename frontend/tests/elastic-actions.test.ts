import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile, requireVerifiedUser } from "@/lib/auth/guards";
import { previewElasticAvailabilityAction } from "@/lib/availability/elastic-actions";
import { userFacingAvailabilityError } from "@/lib/availability/elastic";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireCompleteProfile: vi.fn(), requireVerifiedUser: vi.fn() }));

const createClientMock = vi.mocked(createClient);

describe("elastic preview actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCompleteProfile).mockResolvedValue(undefined as never);
    vi.mocked(requireVerifiedUser).mockResolvedValue(undefined as never);
  });

  it("normalizes a missing migration or RPC into an inline-safe error", async () => {
    createClientMock.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("Could not find the function public.preview_doctor_occurrence_adjustment in the schema cache") }) } as never);
    const result = await previewElasticAvailabilityAction({ sessionId: "session", occurrenceDate: "2099-05-01", startTime: "09:00", endTime: "12:00" });
    expect(result).toEqual({ error: expect.stringContaining("migration 0036") });
  });

  it("normalizes scheduling errors without throwing", async () => {
    createClientMock.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("This occurrence has an active payment hold") }) } as never);
    const result = await previewElasticAvailabilityAction({ sessionId: "session", occurrenceDate: "2099-05-01", startTime: "09:00", endTime: "12:00" });
    expect(result).toEqual({ error: expect.stringContaining("active payment hold") });
  });

  it("maps unknown errors to safe copy", () => {
    expect(userFacingAvailabilityError(new Error("private database detail"))).toBe("We could not update this availability. Please review the window and try again.");
  });
});
