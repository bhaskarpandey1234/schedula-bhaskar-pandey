import { describe, expect, it } from "vitest";
import { conversationTitle } from "@/lib/assistant/history";

describe("assistant conversation titles", () => {
  it("uses a compact readable title from the first user message", () => {
    expect(conversationTitle("  Find   a cardiologist near me?  ")).toBe("Find a cardiologist near me");
  });

  it("uses a safe default for an empty message and limits long titles", () => {
    expect(conversationTitle(" ")).toBe("New conversation");
    expect(conversationTitle("a".repeat(100))).toHaveLength(72);
  });
});
