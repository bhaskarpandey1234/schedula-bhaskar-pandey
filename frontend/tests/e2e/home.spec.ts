import { expect, test } from "@playwright/test";

test("renders the Schedula foundation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Schedula/);
  await expect(page.getByRole("main").first()).toBeVisible();
});
