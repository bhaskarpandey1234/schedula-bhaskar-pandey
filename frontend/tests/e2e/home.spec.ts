import { expect, test } from "@playwright/test";

test("renders the Schedula foundation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Schedula/);
  await expect(page.getByRole("heading", { name: "Appointments that fit your life and your care." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book care as a patient" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join as a doctor" })).toBeVisible();
});

test("opens the mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await menuButton.click();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();
  await expect(page.locator("#mobile-navigation")).toBeVisible();
  await expect(page.locator("#mobile-navigation").getByRole("link", { name: "How it works" })).toBeVisible();
});
