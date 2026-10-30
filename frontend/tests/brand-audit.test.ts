import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(entry.name) ? [path] : [];
  });
}

describe("visible product branding", () => {
  it("does not expose Practo wording in application source", () => {
    const root = join(process.cwd(), "app");
    const componentRoot = join(process.cwd(), "components");
    const libRoot = join(process.cwd(), "lib");
    const files = [root, componentRoot, libRoot].flatMap((path) => statSync(path).isDirectory() ? sourceFiles(path) : [path]);
    const matches = files.filter((file) => /practo/i.test(readFileSync(file, "utf8")));
    expect(matches).toEqual([]);
  });
});
