import { afterEach, describe, expect, it } from "vitest";

import { getAuthConfirmRedirect, getSiteUrl } from "../lib/auth/redirects";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("production authentication redirects", () => {
  it("uses the configured site URL without duplicate trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://schedula-demo.vercel.app///";

    expect(getSiteUrl()).toBe("https://schedula-demo.vercel.app");
  });

  it("routes signup confirmation through the server verification endpoint", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://schedula-demo.vercel.app";

    expect(getAuthConfirmRedirect("/onboarding")).toBe(
      "https://schedula-demo.vercel.app/auth/confirm?next=/onboarding",
    );
  });

  it("routes password recovery through the same endpoint", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://schedula-demo.vercel.app";

    expect(getAuthConfirmRedirect("/auth/update-password")).toBe(
      "https://schedula-demo.vercel.app/auth/confirm?next=/auth/update-password",
    );
  });
});
