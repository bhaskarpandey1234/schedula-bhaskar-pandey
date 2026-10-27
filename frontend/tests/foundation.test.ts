import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "../lib/config/env";

describe("Phase 1 configuration", () => {
  it("accepts the documented public environment contract", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    });
  });

  it("rejects missing or malformed public values", () => {
    expect(() => parsePublicEnv({})).toThrow();
  });
});
