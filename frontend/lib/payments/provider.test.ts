import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeSignatureCompare } from "./provider";

describe("payment signature comparison", () => {
  it("accepts the exact digest and rejects tampered values", () => {
    const digest = createHmac("sha256", "test-secret").update("order|payment").digest("hex");
    expect(safeSignatureCompare(digest, digest)).toBe(true);
    expect(safeSignatureCompare(digest, digest.slice(0, -1) + "0")).toBe(false);
  });
});
