import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getNotifications, getUnreadNotificationCount, mapNotificationRows } from "../lib/notifications/queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

beforeEach(() => {
  createClientMock.mockReset();
});

describe("notification query mapping", () => {
  it("preserves database order and maps timestamps", () => {
    const rows = mapNotificationRows([
      { id: "new", type: "appointment_booked", title: "New", message: "Newest", read_at: null, created_at: "2026-10-31T10:00:00.000Z", appointment_id: "appointment-1" },
      { id: "old", type: "payment_confirmed", title: "Old", message: "Older", read_at: "2026-10-31T09:30:00.000Z", created_at: "2026-10-31T09:00:00.000Z", appointment_id: "appointment-1" },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
    expect(rows[0].createdAt).toEqual(new Date("2026-10-31T10:00:00.000Z"));
    expect(rows[0].readAt).toBeNull();
    expect(rows[1].readAt).toEqual(new Date("2026-10-31T09:30:00.000Z"));
  });

  it("maps an empty result to an empty feed", () => {
    expect(mapNotificationRows([])).toEqual([]);
  });

  it("returns a safe failure state when the feed query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
    createClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({ limit })),
        })),
      })),
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getNotifications("patient")).resolves.toEqual({ notifications: [], loadFailed: true });
    expect(errorSpy).toHaveBeenCalledWith("[notifications] feed_query_failed", { code: "42501" });
    errorSpy.mockRestore();
  });

  it("uses an exact head count and safely falls back when unread counting fails", async () => {
    const is = vi.fn().mockResolvedValue({ count: null, error: { code: "PGRST000" } });
    const select = vi.fn(() => ({ is }));
    createClientMock.mockResolvedValue({ from: vi.fn(() => ({ select })) } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getUnreadNotificationCount()).resolves.toBe(0);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(is).toHaveBeenCalledWith("read_at", null);
    expect(errorSpy).toHaveBeenCalledWith("[notifications] unread_count_query_failed", { code: "PGRST000" });
    errorSpy.mockRestore();
  });
});
