import { expect, test } from "@playwright/test";

test("renders search-first public discovery", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Schedula/);
  await expect(page.getByRole("heading", { name: "Find a doctor. Book with confidence." })).toBeVisible();
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find doctors" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse care" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Browse care areas" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Doctor profiles" })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "For doctors" })).toHaveCount(0);
});

test("mobile navigation exposes the same guest destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.locator("#mobile-navigation");
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Find doctors" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Browse care" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "For doctors" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Sign in" })).toBeVisible();
});
