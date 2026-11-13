import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUsers, onboardTestUser, type TestUser } from "../support/local-supabase";

const password = "SchedulaPhase8Test!";
const users: TestUser[] = [];

test.afterEach(async () => { await deleteTestUsers(users.splice(0)); });

test("assistant shows success, retry, confirmation, and stale-action recovery states", async ({ page }) => {
  const doctor = await createTestUser("doctor", "assistant-browser");
  users.push(doctor);
  await onboardTestUser(doctor);

  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ text: string }> };
    const text = body.messages.at(-1)?.text;
    if (text === "fail") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ASSISTANT_UNAVAILABLE" }) });
      return;
    }
    if (text === "prepare") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "I prepared this action for your confirmation.", displays: [], pendingAction: { id: "action-1", actionType: "booking", preview: { operation: "booking", slot: "Synthetic slot" }, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Your schedule is clear.", displays: [] }) });
  });
  await page.route("**/api/assistant/actions/action-1", async (route) => {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "STALE_ACTION" }) });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(doctor.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/doctor$/);
  await page.goto("/doctor/assistant");

  const input = page.getByPlaceholder("Ask about appointments or slots…");
  await input.fill("hello");
  await input.press("Enter");
  await expect(page.getByText("Your schedule is clear.")).toBeVisible();

  await input.fill("fail");
  await input.press("Enter");
  await expect(page.getByText("The AI service is temporarily unavailable. Please try again shortly.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await input.fill("prepare");
  await input.press("Enter");
  await expect(page.getByText("Review before confirming")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("That confirmation is stale. Refresh the appointment and prepare a new action.")).toBeVisible();
});
