import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const compatibilityRoutes = [
  "app/patient/page.tsx",
  "app/patient/doctors/page.tsx",
  "app/patient/doctors/[doctorId]/page.tsx",
];

describe("Next.js blocking compatibility routes", () => {
  it("marks every request-aware legacy patient route as blocking", async () => {
    await Promise.all(compatibilityRoutes.map(async (route) => {
      const source = await readFile(resolve(process.cwd(), route), "utf8");
      expect(source).toMatch(/export const instant = false/);
    }));
  });
});
