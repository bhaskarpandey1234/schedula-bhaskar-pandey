import { describe, expect, it } from "vitest";
import { careAreasForSpecialty } from "./care-areas";

describe("care areas", () => {
  it("maps known specialties to cautious common care areas", () => {
    expect(careAreasForSpecialty("Cardiology")).toContain("Heart health checks");
  });

  it("provides a safe generic fallback for new specialties", () => {
    expect(careAreasForSpecialty("New specialty")).toHaveLength(3);
  });
});
