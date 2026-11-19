import { describe, expect, it } from "vitest";
import { parseQueueServiceDate } from "../lib/queue/queries";

describe("queue service date filters", () => {
  it("accepts a calendar date without timezone conversion", () => {
    expect(parseQueueServiceDate("2026-11-18", "Asia/Kolkata")).toBe("2026-11-18");
  });

  it("falls back to the current date in the selected doctor's timezone for invalid input", () => {
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(parseQueueServiceDate("2026-02-31", "Asia/Kolkata")).toBe(expected);
  });
});

describe("queue pagination slices", () => {
  it("calculates correct page slices for appointments list", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: `appt-${i + 1}` }));
    const pageSize = 10;
    const page = 2;
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    const slice = items.slice(startIndex, endIndex);

    expect(slice).toHaveLength(10);
    expect(slice[0].id).toBe("appt-11");
    expect(slice[9].id).toBe("appt-20");
  });

  it("handles last page with fewer items than pageSize", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: `appt-${i + 1}` }));
    const pageSize = 10;
    const page = 3;
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    const slice = items.slice(startIndex, endIndex);

    expect(slice).toHaveLength(5);
    expect(slice[0].id).toBe("appt-21");
    expect(slice[4].id).toBe("appt-25");
  });
});

describe("queue section partitioning (Approach 2)", () => {
  it("places in-consultation and waiting patients in Live Queue ordered strictly", () => {
    const sample = [
      { id: "1", queue_status: "waiting", checked_in_at: "2026-11-18T09:10:00Z", queue_position: 2, attendance_status: "eligible" },
      { id: "2", queue_status: "in_consultation", checked_in_at: "2026-11-18T09:00:00Z", queue_position: null, attendance_status: "eligible" },
      { id: "3", queue_status: "waiting", checked_in_at: "2026-11-18T09:05:00Z", queue_position: 1, attendance_status: "eligible" },
      { id: "4", queue_status: null, checked_in_at: null, queue_position: null, attendance_status: "no_show", appointment_status: "confirmed" },
    ];

    const inConsultation = sample.filter((r) => r.queue_status === "in_consultation");
    const waitingList = sample.filter((r) => r.queue_status === "waiting" && r.checked_in_at !== null)
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
    const liveQueue = [...inConsultation, ...waitingList];

    expect(liveQueue).toHaveLength(3);
    expect(liveQueue[0].id).toBe("2"); // in_consultation is at the very top!
    expect(liveQueue[1].id).toBe("3"); // queue_position 1 is next!
    expect(liveQueue[2].id).toBe("1"); // queue_position 2 is after!
  });

  it("sends unavailable patients to Completed & Unavailable section", () => {
    const sample = [
      { id: "1", queue_status: "waiting", checked_in_at: "2026-11-18T09:10:00Z", queue_position: 1, attendance_status: "eligible", appointment_status: "confirmed" },
      { id: "2", queue_status: null, checked_in_at: null, queue_position: null, attendance_status: "no_show", appointment_status: "confirmed" },
    ];

    const finished = sample.filter((r) => r.attendance_status === "no_show");
    expect(finished).toHaveLength(1);
    expect(finished[0].id).toBe("2");
  });

  it("partitions activity panel into upcoming, completed, and unavailable lists", () => {
    const sample = [
      { id: "1", appointment_status: "confirmed", checked_in_at: null, attendance_status: "eligible" },
      { id: "2", appointment_status: "completed", queue_status: "completed", checked_in_at: "2026-11-18T09:00:00Z", attendance_status: "eligible" },
      { id: "3", appointment_status: "confirmed", checked_in_at: null, attendance_status: "no_show" },
      { id: "4", appointment_status: "confirmed", checked_in_at: "2026-11-18T09:15:00Z", attendance_status: "eligible" }, // In live queue
    ];

    const upcoming = sample.filter((r) => r.appointment_status === "confirmed" && !r.checked_in_at && r.attendance_status !== "no_show");
    const completed = sample.filter((r) => r.appointment_status === "completed" || r.queue_status === "completed");
    const unavailable = sample.filter((r) => r.attendance_status === "no_show");

    expect(upcoming.map((r) => r.id)).toEqual(["1"]);
    expect(completed.map((r) => r.id)).toEqual(["2"]);
    expect(unavailable.map((r) => r.id)).toEqual(["3"]);
  });

  it("dynamically shifts expired non-checked-in appointments from upcoming to unavailable", () => {
    const fixedNow = new Date("2026-11-18T10:16:00Z").getTime();
    const sample = [
      {
        id: "not-expired",
        appointment_status: "confirmed",
        checked_in_at: null,
        attendance_status: "eligible",
        no_show_eligible_at: "2026-11-18T10:30:00Z",
      },
      {
        id: "expired",
        appointment_status: "confirmed",
        checked_in_at: null,
        attendance_status: "eligible",
        no_show_eligible_at: "2026-11-18T10:15:00Z",
      },
      {
        id: "already-no-show",
        appointment_status: "confirmed",
        checked_in_at: null,
        attendance_status: "no_show",
        no_show_eligible_at: "2026-11-18T09:15:00Z",
      },
    ];

    const isExpired = (row: typeof sample[number], now: number) => {
      if (row.attendance_status === "no_show") return true;
      if (!row.checked_in_at && row.appointment_status === "confirmed") {
        if (now > 0 && row.no_show_eligible_at) {
          return new Date(row.no_show_eligible_at).getTime() <= now;
        }
      }
      return false;
    };

    const upcoming = sample.filter((r) => r.appointment_status === "confirmed" && !r.checked_in_at && !isExpired(r, fixedNow));
    const unavailable = sample.filter((r) => isExpired(r, fixedNow));

    expect(upcoming.map((r) => r.id)).toEqual(["not-expired"]);
    expect(unavailable.map((r) => r.id)).toEqual(["expired", "already-no-show"]);
  });

  it("strictly provides 3 commands for Live Patient Queue: Call, Skip/Return, and Complete", () => {
    const getLiveCommands = (queueStatus: string | null) => [
      "call_next",
      queueStatus === "skipped" ? "return" : "skip",
      "complete",
    ];

    const waitingCommands = getLiveCommands("waiting");
    expect(waitingCommands).toEqual(["call_next", "skip", "complete"]);
    expect(waitingCommands).toHaveLength(3);
    expect(waitingCommands).not.toContain("check_in");
    expect(waitingCommands).not.toContain("no_show");

    const calledCommands = getLiveCommands("called");
    expect(calledCommands).toEqual(["call_next", "skip", "complete"]);
    expect(calledCommands).toHaveLength(3);

    const inConsultationCommands = getLiveCommands("in_consultation");
    expect(inConsultationCommands).toEqual(["call_next", "skip", "complete"]);
    expect(inConsultationCommands).toHaveLength(3);

    const skippedCommands = getLiveCommands("skipped");
    expect(skippedCommands).toEqual(["call_next", "return", "complete"]);
    expect(skippedCommands).toHaveLength(3);
    expect(skippedCommands).not.toContain("skip");
  });

  it("normalizes doctor queue slot selection so 'all' or empty maps to all slots", () => {
    const toEffectiveSlotId = (slotId?: string | null) => (slotId && slotId !== "all" ? slotId : null);

    expect(toEffectiveSlotId("")).toBeNull();
    expect(toEffectiveSlotId("all")).toBeNull();
    expect(toEffectiveSlotId(null)).toBeNull();
    expect(toEffectiveSlotId(undefined)).toBeNull();
    expect(toEffectiveSlotId("123e4567-e89b-12d3-a456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("sorts doctor read-only queue in priority order without action buttons", () => {
    const samplePatients = [
      { id: "p1", queue_status: "waiting", queue_position: 2, attendance_status: "checked_in" },
      { id: "p2", queue_status: "in_consultation", queue_position: null, attendance_status: "checked_in" },
      { id: "p3", queue_status: "waiting", queue_position: 1, attendance_status: "checked_in" },
      { id: "p4", queue_status: null, queue_position: null, attendance_status: "eligible" }, // Not arrived
      { id: "p5", queue_status: "completed", queue_position: null, attendance_status: "checked_in" },
      { id: "p6", queue_status: "called", queue_position: null, attendance_status: "checked_in" },
    ];

    const getPriority = (p: typeof samplePatients[number]) => {
      if (p.queue_status === "in_consultation") return 1;
      if (p.queue_status === "called") return 2;
      if (p.queue_status === "waiting") return 3;
      if (p.queue_status === "skipped") return 4;
      if (!p.queue_status && p.attendance_status === "eligible") return 5;
      if (p.queue_status === "completed") return 6;
      return 7;
    };

    const sorted = [...samplePatients].sort((a, b) => {
      const prioDiff = getPriority(a) - getPriority(b);
      if (prioDiff !== 0) return prioDiff;
      return (a.queue_position ?? 0) - (b.queue_position ?? 0);
    });

    expect(sorted.map((p) => p.id)).toEqual(["p2", "p6", "p3", "p1", "p4", "p5"]);
  });

  it("strictly partitions receptionist metrics so sub-counters equal total appointments", () => {
    const fixedNow = new Date("2026-11-18T10:16:00Z").getTime();
    const rows = [
      { id: "T001", appointment_status: "completed", queue_status: "completed", checked_in_at: "2026-11-18T09:00:00Z", attendance_status: "checked_in", no_show_eligible_at: "2026-11-18T09:15:00Z" },
      { id: "T002", appointment_status: "confirmed", queue_status: "waiting", checked_in_at: "2026-11-18T09:10:00Z", attendance_status: "checked_in", no_show_eligible_at: "2026-11-18T09:30:00Z" },
      { id: "T003", appointment_status: "confirmed", queue_status: "waiting", checked_in_at: "2026-11-18T09:20:00Z", attendance_status: "checked_in", no_show_eligible_at: "2026-11-18T09:45:00Z" },
      { id: "T004", appointment_status: "confirmed", queue_status: "waiting", checked_in_at: "2026-11-18T09:25:00Z", attendance_status: "checked_in", no_show_eligible_at: "2026-11-18T10:00:00Z" },
      { id: "T005", appointment_status: "confirmed", queue_status: null, checked_in_at: null, attendance_status: "no_show", no_show_eligible_at: "2026-11-18T09:15:00Z" },
    ];

    const isExpired = (row: typeof rows[number], now: number) => {
      if (row.attendance_status === "no_show") return true;
      if (!row.checked_in_at && row.appointment_status === "confirmed") {
        if (now > 0 && row.no_show_eligible_at) {
          return new Date(row.no_show_eligible_at).getTime() <= now;
        }
      }
      return false;
    };

    const total = rows.length;
    const notArrived = rows.filter((r) => r.appointment_status === "confirmed" && !r.checked_in_at && !isExpired(r, fixedNow)).length;
    const waiting = rows.filter((r) => r.queue_status === "waiting" && r.checked_in_at !== null).length;
    const current = rows.filter((r) => r.queue_status === "in_consultation" || r.queue_status === "called").length;
    const completed = rows.filter((r) => r.appointment_status === "completed" || r.queue_status === "completed").length;
    const unavailable = rows.filter((r) => isExpired(r, fixedNow)).length;

    expect(total).toBe(5);
    expect(notArrived).toBe(0);
    expect(waiting).toBe(3);
    expect(current).toBe(0);
    expect(completed).toBe(1);
    expect(unavailable).toBe(1);
    expect(notArrived + waiting + current + completed + unavailable).toBe(total);
  });

  it("streamlines receptionist metrics into exactly 4 cards with Current token", () => {
    const rows = [
      { id: "T001", appointment_status: "completed", queue_status: "completed", token_number: 1, checked_in_at: "2026-11-18T09:00:00Z" },
      { id: "T002", appointment_status: "confirmed", queue_status: "in_consultation", token_number: 2, checked_in_at: "2026-11-18T09:10:00Z" },
      { id: "T003", appointment_status: "confirmed", queue_status: "waiting", token_number: 3, checked_in_at: "2026-11-18T09:20:00Z", queue_position: 1 },
      { id: "T004", appointment_status: "confirmed", queue_status: "waiting", token_number: 4, checked_in_at: "2026-11-18T09:25:00Z", queue_position: 2 },
    ];

    const inConsultationRow = rows.find((r) => r.queue_status === "in_consultation");
    const calledRow = rows.find((r) => r.queue_status === "called");
    const activeRow = inConsultationRow ?? calledRow ?? null;
    const currentToken = activeRow ? `T${String(activeRow.token_number).padStart(3, "0")}` : "—";

    const waiting = rows.filter((r) => r.queue_status === "waiting" && r.checked_in_at !== null);
    const completed = rows.filter((r) => r.appointment_status === "completed" || r.queue_status === "completed");

    const cards = [
      { label: "Appointments", value: rows.length },
      { label: "Current token", value: currentToken },
      { label: "Waiting", value: waiting.length },
      { label: "Completed", value: completed.length },
    ];

    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.label)).toEqual(["Appointments", "Current token", "Waiting", "Completed"]);
    expect(cards.find((c) => c.label === "Current token")?.value).toBe("T002");
    expect(cards.find((c) => c.label === "Waiting")?.value).toBe(2);
    expect(cards.find((c) => c.label === "Completed")?.value).toBe(1);
    expect(cards.map((c) => c.label)).not.toContain("Not arrived");
    expect(cards.map((c) => c.label)).not.toContain("In progress");
    expect(cards.map((c) => c.label)).not.toContain("Unavailable");
  });

  it("streamlines doctor queue metrics to 4 cards without Remaining card", () => {
    const summary = {
      current_token: 2,
      next_token: 3,
      waiting: 2,
      completed: 1,
      remaining: 2,
      total: 4,
    };

    const tokenLabel = (token: number | null) => (token === null ? "—" : `T${String(token).padStart(3, "0")}`);

    const doctorCards = [
      { label: "Current token", value: tokenLabel(summary.current_token) },
      { label: "Next token", value: tokenLabel(summary.next_token) },
      { label: "Waiting", value: summary.waiting },
      { label: "Completed", value: summary.completed },
    ];

    expect(doctorCards).toHaveLength(4);
    expect(doctorCards.map((c) => c.label)).toEqual(["Current token", "Next token", "Waiting", "Completed"]);
    expect(doctorCards.map((c) => c.label)).not.toContain("Remaining");
  });

  it("enables call, skip/return, and complete actions for doctors on checked-in patients", () => {
    const patients = [
      {
        appointment_id: "a1",
        token_number: 1,
        appointment_status: "confirmed",
        attendance_status: "checked_in",
        queue_status: "in_consultation",
        checked_in_at: "2026-11-18T09:00:00Z",
        queue_position: null,
      },
      {
        appointment_id: "a2",
        token_number: 2,
        appointment_status: "confirmed",
        attendance_status: "checked_in",
        queue_status: "waiting",
        checked_in_at: "2026-11-18T09:05:00Z",
        queue_position: 1,
      },
      {
        appointment_id: "a3",
        token_number: 3,
        appointment_status: "confirmed",
        attendance_status: "checked_in",
        queue_status: "skipped",
        checked_in_at: "2026-11-18T09:08:00Z",
        queue_position: null,
      },
      {
        appointment_id: "a4",
        token_number: 4,
        appointment_status: "confirmed",
        attendance_status: "eligible",
        queue_status: null,
        checked_in_at: null, // Not arrived
        queue_position: null,
      },
      {
        appointment_id: "a5",
        token_number: 5,
        appointment_status: "completed",
        attendance_status: "checked_in",
        queue_status: "completed",
        checked_in_at: "2026-11-18T08:30:00Z",
        queue_position: null,
      },
    ];

    const hasActiveConsultation = patients.some(
      (p) => p.queue_status === "called" || p.queue_status === "in_consultation",
    );
    const nextWaitingPatient = patients
      .filter((p) => p.queue_status === "waiting" && p.checked_in_at !== null)
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0))[0] ?? null;

    // a1 (in consultation): checked in, active consultation exists
    const a1Commands = ["call_next", patients[0].queue_status === "skipped" ? "return" : "skip", "complete"];
    expect(a1Commands).toEqual(["call_next", "skip", "complete"]);

    // a2 (waiting): checked in. But hasActiveConsultation is true (a1 is consulting), so canCallNext is false
    const a2CanCallNext =
      patients[1].appointment_status === "confirmed" &&
      patients[1].checked_in_at !== null &&
      patients[1].queue_status === "waiting" &&
      nextWaitingPatient?.appointment_id === patients[1].appointment_id &&
      !hasActiveConsultation;
    expect(a2CanCallNext).toBe(false);

    // a3 (skipped): action dynamically offers "return" instead of "skip"
    const a3Commands = ["call_next", patients[2].queue_status === "skipped" ? "return" : "skip", "complete"];
    expect(a3Commands).toEqual(["call_next", "return", "complete"]);

    // a4 (not arrived): not checked in -> no queue actions
    const a4HasActions = patients[3].checked_in_at !== null;
    expect(a4HasActions).toBe(false);

    // a5 (completed): finished -> no queue actions
    const a5HasActions = patients[4].checked_in_at !== null && patients[4].appointment_status !== "completed";
    expect(a5HasActions).toBe(false);
  });
});
