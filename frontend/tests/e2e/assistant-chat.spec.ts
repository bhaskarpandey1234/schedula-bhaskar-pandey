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
    if (text === "prepare decline") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "I prepared this action for your confirmation.", displays: [], pendingAction: { id: "action-2", actionType: "booking", preview: { operation: "booking", slot: "Synthetic slot" }, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
      return;
    }
    if (text === "wait") await new Promise((resolve) => setTimeout(resolve, 300));
    const reply = text === "long response"
      ? "This schedule summary contains enough detail to verify independent conversation scrolling. ".repeat(16)
      : "Your schedule is clear.\n\n**Next slot:** Tuesday at 9:00 AM.";
    const displays = text === "long response"
      ? []
      : [{ title: "Upcoming appointments", kind: "appointments", data: [{ patient: "Raj Pandey", clinic: "Aman Clinic" }] }];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: reply, displays }) });
  });
  await page.route("**/api/assistant/actions/action-*", async (route) => {
    const actionId = route.request().url().split("/").at(-1);
    if (actionId === "action-2" && route.request().postDataJSON().decision === "decline") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "declined" }) });
      return;
    }
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "STALE_ACTION" }) });
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(doctor.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/doctor$/);
  await page.goto("/doctor/assistant");

  const heading = page.getByRole("heading", { name: "AI scheduling assistant" });
  const header = page.locator("header");
  await expect(heading).toBeInViewport();
  const headingBox = await heading.boundingBox();
  const headerBox = await header.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);

  const conversation = page.getByRole("log", { name: "Assistant conversation" });
  await expect(conversation).toBeVisible();
  const input = page.getByPlaceholder("Ask about appointments or slots…");
  await expect(input).toBeInViewport();
  await page.getByLabel("Assistant language").selectOption("hi-IN");
  await expect(page.getByLabel("Assistant language")).toHaveValue("hi-IN");
  await page.getByRole("button", { name: "Start voice assistant" }).click();
  await expect(page.getByText("Voice input is not supported in this browser. You can still use text chat.")).toBeVisible();

  await input.fill("draft");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("draft\n");
  await input.fill("");
  await input.fill("hello");
  await input.press("Enter");
  await expect(page.getByText("Your schedule is clear.")).toBeVisible();
  await expect(conversation.getByText("Next slot:", { exact: true })).toBeVisible();
  await expect(conversation.getByText("**Next slot:**")).toHaveCount(0);
  await expect(conversation.getByText("Raj Pandey")).toBeVisible();

  await input.fill("wait");
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Schedula is preparing a response…");
  await expect(conversation.getByText("Your schedule is clear.")).toHaveCount(2);

  await input.fill("long response");
  await input.press("Enter");
  await expect(conversation.getByText(/This schedule summary contains enough detail/)).toBeVisible();
  const scrollMetrics = await conversation.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  await expect(input).toBeInViewport();

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

  await input.fill("prepare decline");
  await input.press("Enter");
  await expect(page.getByText("Review before confirming")).toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Okay, I did not change anything.")).toBeVisible();
});

test("patient assistant first-open layout and suggested prompts are available", async ({ page }) => {
  const patient = await createTestUser("patient", "assistant-patient-browser");
  users.push(patient);
  await onboardTestUser(patient);

  await page.route("**/api/assistant/chat", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "I can help you find an appointment.", displays: [] }) });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(patient.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await page.goto("/patient/assistant");

  await expect(page.getByRole("heading", { name: "AI care assistant" })).toBeInViewport();
  await expect(page.getByRole("log", { name: "Assistant conversation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show my upcoming appointments" })).toBeVisible();
  await page.getByRole("button", { name: "Find a cardiologist" }).click();
  await expect(page.getByText("I can help you find an appointment.")).toBeVisible();
  await expect(page.getByLabel("Message to the assistant")).toBeInViewport();
});
