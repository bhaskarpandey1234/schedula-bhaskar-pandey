import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUsers, onboardTestUser, type TestUser } from "../support/local-supabase";

type MockRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  started: boolean;
  start: () => void;
  stop: () => void;
  emit: (transcript: string) => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
};

declare global {
  interface Window {
    __assistantRecognition?: MockRecognition;
    __assistantSpokenLanguage?: string;
    __assistantCheckoutOpened?: boolean;
    __assistantCheckoutOptions?: {
      handler?: (payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => Promise<void>;
    };
    __assistantPaymentFailed?: (response: { error?: { description?: string; reason?: string } }) => void;
  }
}

const password = "SchedulaPhase8Test!";
const users: TestUser[] = [];

test.afterEach(async () => { await deleteTestUsers(users.splice(0)); });

test("doctor assistant renders verified appointment cards without patient names or internal IDs", async ({ page }) => {
  const doctor = await createTestUser("doctor", "assistant-appointment-cards");
  users.push(doctor);
  await onboardTestUser(doctor);
  await page.route("**/api/assistant/chat", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      text: "I found 2 appointments. Details are shown below.",
      displays: [{ kind: "appointments", title: "Doctor appointments", data: [
        { patient_count: 1, status: "confirmed", slot_start_at: "2026-11-14T04:00:00.000Z", slot_end_at: "2026-11-14T04:30:00.000Z", timezone: "Asia/Kolkata", reason: null },
        { patient_count: 1, status: "confirmed", slot_start_at: "2026-12-08T03:30:00.000Z", slot_end_at: "2026-12-08T05:00:00.000Z", timezone: "Asia/Kolkata", reason: "Consultation" },
      ] }],
    }) });
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
  const conversation = page.getByRole("log", { name: "Assistant conversation" });
  await page.getByPlaceholder("Ask about appointments or slots…").fill("show my upcoming appointments");
  await page.getByPlaceholder("Ask about appointments or slots…").press("Enter");
  await expect(conversation.getByText("I found 2 appointments. Details are shown below.")).toBeVisible();
  await expect(conversation.getByText("2 appointments", { exact: true })).toBeVisible();
  await expect(conversation.getByText("Saturday, November 14, 2026, 9:30 AM – 10:00 AM (Asia/Kolkata)")).toBeVisible();
  await expect(conversation.getByText("Tuesday, December 8, 2026, 9:00 AM – 10:30 AM (Asia/Kolkata)")).toBeVisible();
  await expect(conversation.getByText("Patient count: 1").first()).toBeVisible();
  await expect(conversation.getByText("No specific visit reason provided by patient.")).toBeVisible();
  await expect(conversation.getByText("Visit reason: Consultation")).toBeVisible();
  await expect(conversation.getByText("Raj Pandey", { exact: true })).toHaveCount(0);
  await expect(conversation.getByText(/appointment_id|idempotency key/i)).toHaveCount(0);
});

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
    if (text === "auth fail") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ASSISTANT_PROVIDER_AUTH_FAILED" }) });
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
  await page.getByLabel("Assistant language").click();
  await page.getByRole("option", { name: "Hindi" }).click();
  await expect(page.getByLabel("Assistant language")).toHaveText("Hindi");
  await page.getByRole("button", { name: "Start one-turn voice input" }).click();
  await page.getByRole("button", { name: "Start continuous voice mode" }).click();
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
  await input.fill("auth fail");
  await input.press("Enter");
  await expect(page.getByText("The AI service rejected the configured API key. Check the server configuration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(1);

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

test("patient assistant shows grounded doctor fees and selectable timezone-aware slots", async ({ page }) => {
  const patient = await createTestUser("patient", "assistant-doctor-results");
  users.push(patient);
  await onboardTestUser(patient);
  const selectedIds: string[] = [];
  const selectedDoctorIds: string[] = [];
  let confirmRequests = 0;
  let paymentVerifications = 0;

  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ text: string }>; selectedDoctorId?: string; selectedSlotId?: string };
    const text = body.messages.at(-1)?.text;
    if (text === "ask for typed time") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Please tell me the date and time.", displays: [] }) });
      return;
    }
    if (text === "legacy prose preview") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Great choice! Here is your booking preview. Please confirm: Do you want me to book this appointment?", displays: [] }) });
      return;
    }
    if (body.selectedDoctorId) {
      selectedDoctorIds.push(body.selectedDoctorId);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          text: "These appointment times are available. Choose a slot to review the booking.",
          displays: [{
            kind: "slots",
            title: "Available slots",
            data: [
              { slot_id: "33333333-3333-4333-8333-333333333333", slot_start_at: "2026-09-11T04:30:00.000Z", slot_end_at: "2026-09-11T05:00:00.000Z", timezone: "Asia/Kolkata", capacity: 1, remaining_capacity: 1 },
              { slot_id: "44444444-4444-4444-8444-444444444444", slot_start_at: "2026-09-11T05:00:00.000Z", slot_end_at: "2026-09-11T05:30:00.000Z", timezone: "Asia/Kolkata", capacity: 1, remaining_capacity: 1 },
              { slot_id: "55555555-5555-4555-8555-555555555555", slot_start_at: "2026-09-11T05:30:00.000Z", slot_end_at: "2026-09-11T06:00:00.000Z", timezone: "Asia/Kolkata", capacity: 1, remaining_capacity: 1 },
            ],
          }],
        }),
      });
      return;
    }
    if (body.selectedSlotId) {
      selectedIds.push(body.selectedSlotId);
      if (body.selectedSlotId === "33333333-3333-4333-8333-333333333333") {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "SLOT_UNAVAILABLE" }) });
        return;
      }
      const actionId = body.selectedSlotId === "44444444-4444-4444-8444-444444444444" ? "selected-slot-action-1" : "selected-slot-action-2";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          text: "The selected slot is ready for review.",
          displays: [],
          pendingAction: {
            id: actionId,
            actionType: "booking",
            preview: { operation: "booking", doctor_name: "Dr. Rao", clinic_name: "Heart Clinic", slot_start_at: "2026-09-11T05:00:00.000Z", slot_end_at: "2026-09-11T05:30:00.000Z", timezone: "Asia/Kolkata", consultation_fee_minor: 100000, consultation_currency: "INR" },
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
      });
      return;
    }
    if (text === "Find a cardiologist") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          text: "I found 1 verified doctor. Their details are shown below.",
          displays: [{
            kind: "doctors",
            title: "Verified doctors",
            data: [{ doctor_id: "11111111-1111-4111-8111-111111111111", full_name: "Dr. Rao", specialty: "Cardiology", clinic_name: "Heart Clinic", experience_years: 9, consultation_fee_minor: 100000, consultation_currency: "INR" }],
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: "These appointment times are available. Choose a slot to review the booking.",
        displays: [{
          kind: "slots",
          title: "Available slots",
          data: [
            { slot_id: "33333333-3333-4333-8333-333333333333", slot_start_at: "2026-09-11T04:30:00.000Z", slot_end_at: "2026-09-11T05:00:00.000Z", timezone: "Asia/Kolkata", capacity: 1, remaining_capacity: 1 },
            { slot_id: "44444444-4444-4444-8444-444444444444", slot_start_at: "2026-09-11T05:00:00.000Z", slot_end_at: "2026-09-11T05:30:00.000Z", timezone: "Asia/Kolkata", capacity: 1, remaining_capacity: 1 },
          ],
        }],
      }),
    });
  });
  await page.route("**/api/assistant/actions/selected-slot-action-*", async (route) => {
    const body = route.request().postDataJSON() as { decision: string };
    if (body.decision === "confirm") {
      confirmRequests += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "payment_required",
          result: { paymentId: "payment-1", orderId: "order-1", keyId: "rzp_test_key", amountMinor: 100000, currency: "INR" },
        }),
      });
      return;
    }
    if (body.decision === "payment_verified") paymentVerifications += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "succeeded" }) });
  });
  await page.addInitScript(() => {
    class MockRazorpay {
      constructor(options: Record<string, unknown>) {
        window.__assistantCheckoutOptions = options as Window["__assistantCheckoutOptions"];
      }
      open() { window.__assistantCheckoutOpened = true; }
      on(event: string, handler: (response: { error?: { description?: string; reason?: string } }) => void) {
        if (event === "payment.failed") window.__assistantPaymentFailed = handler;
      }
    }
    Object.defineProperty(window, "Razorpay", { value: MockRazorpay, configurable: true });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(patient.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await page.goto("/patient/assistant");

  const conversation = page.getByRole("log", { name: "Assistant conversation" });
  const input = page.getByLabel("Message to the assistant");
  await input.fill("ask for typed time");
  await input.press("Enter");
  await expect(conversation.getByText("Please tell me the date and time.")).toBeVisible();
  await input.fill("13 Nov 2026 9:00 AM – 9:30 AM");
  await input.press("Enter");
  await expect(conversation.getByText("Please choose an available-time button, or use “See available times” on a verified doctor card. A time typed in chat cannot be booked.")).toBeVisible();

  await input.fill("legacy prose preview");
  await input.press("Enter");
  await expect(conversation.getByText(/Do you want me to book this appointment/)).toBeVisible();
  await input.fill("yes");
  await input.press("Enter");
  await expect(conversation.getByText("There is no booking ready to confirm yet. Choose an available slot button first, then confirm its review.")).toBeVisible();
  expect(confirmRequests).toBe(0);

  await input.fill("Find a cardiologist");
  await input.press("Enter");
  await expect(conversation.getByRole("heading", { name: "Dr. Rao" })).toBeVisible();
  await expect(conversation.getByText("₹1,000", { exact: true })).toBeVisible();
  await expect(conversation.getByText("₹5", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "See available times for Dr. Rao" }).click();
  await expect(conversation.getByRole("heading", { name: "Available slots" })).toBeVisible();
  await expect(conversation.getByText("Friday, September 11, 2026")).toBeVisible();
  await expect(conversation.getByText("10:00 AM – 10:30 AM")).toBeVisible();
  await expect(conversation.getByText("10:30 AM – 11:00 AM")).toBeVisible();

  await page.getByRole("button", { name: /Choose appointment slot: Friday, September 11, 2026, 10:00 AM/ }).click();
  await expect(page.getByText("That time is no longer available. Ask me to refresh the doctor's available slots and choose another time.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await page.getByRole("button", { name: /Choose appointment slot: Friday, September 11, 2026, 10:30 AM/ }).click();
  await expect(page.getByText("Review before confirming")).toBeVisible();
  await expect(conversation.getByText("Friday, September 11, 2026, 10:30 AM – 11:00 AM (Asia/Kolkata)")).toBeVisible();
  await expect(conversation.getByText("₹1,000", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__assistantCheckoutOpened))).toBe(true);
  expect(confirmRequests).toBe(1);
  await page.evaluate(async () => {
    const handler = window.__assistantCheckoutOptions?.handler;
    if (!handler) throw new Error("Checkout payment handler was not registered.");
    await handler({ razorpay_payment_id: "payment-provider-1", razorpay_order_id: "order-1", razorpay_signature: "signature-1" });
  });
  await expect(conversation.getByText("Payment verified and your appointment is confirmed.")).toBeVisible();
  expect(paymentVerifications).toBe(1);
  expect(selectedDoctorIds).toEqual(["11111111-1111-4111-8111-111111111111"]);

  await page.getByRole("button", { name: /Choose appointment slot: Friday, September 11, 2026, 11:00 AM/ }).click();
  await expect(conversation.getByText("Review before confirming")).toHaveCount(1);
  await page.evaluate(() => {
    window.__assistantCheckoutOpened = false;
    window.__assistantPaymentFailed = undefined;
  });
  await page.getByRole("button", { name: "Confirm" }).last().click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__assistantCheckoutOpened))).toBe(true);
  await page.evaluate(() => {
    const handler = window.__assistantPaymentFailed;
    if (!handler) throw new Error("Checkout failure handler was not registered.");
    handler({ error: { description: "Payment declined" } });
  });
  await expect(conversation.getByText("Payment failed safely. No appointment was confirmed.")).toBeVisible();
  expect(confirmRequests).toBe(2);
  expect(selectedIds).toEqual(["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"]);
});

test("one-turn mic submits after silence while continuous voice keeps listening", async ({ page }) => {
  const doctor = await createTestUser("doctor", "assistant-voice-modes");
  users.push(doctor);
  await onboardTestUser(doctor);
  const chatLanguages: string[] = [];

  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as { language: string };
    chatLanguages.push(body.language);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Assistant response.", displays: [] }) });
  });
  await page.addInitScript(() => {
    class MockSpeechSynthesisUtterance {
      lang = "";
      onend: (() => void) | null = null;

      constructor(readonly text: string) {}
    }

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      started = false;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event?: { error?: string }) => void) | null = null;

      constructor() {
        window.__assistantRecognition = this;
      }

      start() {
        this.started = true;
      }

      stop() {
        this.started = false;
        this.onend?.();
      }

      emit(transcript: string) {
        this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: true })] });
      }
    }

    Object.defineProperty(window, "SpeechRecognition", { value: MockSpeechRecognition, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: MockSpeechSynthesisUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        speak(utterance: MockSpeechSynthesisUtterance) {
          window.__assistantSpokenLanguage = utterance.lang;
          queueMicrotask(() => utterance.onend?.());
        },
      },
      configurable: true,
    });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(doctor.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/doctor$/);
  await page.goto("/doctor/assistant");
  await page.clock.install();
  await page.getByLabel("Assistant language").click();
  await page.getByRole("option", { name: "Hindi" }).click();

  await page.getByRole("button", { name: "Start one-turn voice input" }).click();
  await expect(page.getByRole("status")).toContainText("One-turn mic is listening");
  await expect(page.getByRole("button", { name: "Finish one-turn voice input" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__assistantRecognition?.lang)).toBe("hi-IN");
  await expect.poll(() => page.evaluate(() => window.__assistantRecognition?.interimResults)).toBe(true);
  await page.evaluate(() => window.__assistantRecognition?.emit("Namaste"));
  await expect(page.getByText("Heard: Namaste")).toBeVisible();
  await page.clock.runFor(6_001);
  await expect(page.getByText("Namaste", { exact: true })).toBeVisible();
  await expect(page.getByText("Assistant response.")).toBeVisible();
  expect(chatLanguages).toEqual(["hi-IN"]);

  await page.getByRole("button", { name: "Start one-turn voice input" }).click();
  await expect(page.getByRole("button", { name: "Finish one-turn voice input" })).toBeEnabled();
  await page.clock.runFor(6_001);
  await expect(page.getByRole("button", { name: "Start one-turn voice input" })).toBeEnabled();
  expect(chatLanguages).toHaveLength(1);

  await page.getByRole("button", { name: "Start continuous voice mode" }).click();
  await expect(page.getByRole("button", { name: "Stop continuous voice mode" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__assistantRecognition?.interimResults)).toBe(false);
  await page.clock.runFor(12_000);
  await expect(page.getByRole("button", { name: "Stop continuous voice mode" })).toBeEnabled();

  await page.getByLabel("Assistant language").click();
  await page.getByRole("option", { name: "English" }).click();
  await expect.poll(() => page.evaluate(() => window.__assistantRecognition?.lang)).toBe("en-IN");
  await page.evaluate(() => window.__assistantRecognition?.emit("Check schedule"));
  await expect(page.getByText("Assistant response.")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__assistantSpokenLanguage)).toBe("en-IN");
  expect(chatLanguages).toEqual(["hi-IN", "en-IN"]);
  await page.getByRole("button", { name: "Stop continuous voice mode" }).click();
  await expect(page.getByRole("button", { name: "Start continuous voice mode" })).toBeEnabled();

  await page.getByRole("button", { name: "Start one-turn voice input" }).click();
  await page.evaluate(() => window.__assistantRecognition?.onerror?.({ error: "not-allowed" }));
  await expect(page.getByText("Microphone access failed. Check browser permission and try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start one-turn voice input" })).toBeEnabled();
});

test("patient assistant supports rescheduling and elastic proposal decisions with confirmation", async ({ page }) => {
  const patient = await createTestUser("patient", "assistant-workflow-parity");
  users.push(patient);
  await onboardTestUser(patient);
  const actionDecisions: string[] = [];

  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      messages: Array<{ text: string }>;
      selectedPatientAppointment?: { appointmentId: string; action: "cancel" | "reschedule" };
      selectedRescheduleSlot?: { appointmentId: string; slotId: string };
      selectedProposalDecision?: { proposalId: string; decision: string; slotId?: string };
    };
    if (body.selectedPatientAppointment?.action === "reschedule") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Choose a replacement time.", displays: [{ kind: "reschedule_slots", title: "Choose a replacement appointment time", data: [{ appointment_id: body.selectedPatientAppointment.appointmentId, slot_id: "22222222-2222-4222-8222-222222222222", slot_start_at: "2026-11-20T05:30:00.000Z", slot_end_at: "2026-11-20T06:00:00.000Z", timezone: "Asia/Kolkata" }] }] }) });
      return;
    }
    if (body.selectedRescheduleSlot) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Review the replacement appointment.", displays: [], pendingAction: { id: "action-reschedule", actionType: "reschedule", preview: { operation: "reschedule", doctor_name: "Dr. Rao", new_slot_start_at: "2026-11-20T05:30:00.000Z", timezone: "Asia/Kolkata" }, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
      return;
    }
    if (body.selectedProposalDecision) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Review your choice.", displays: [], pendingAction: { id: `action-${body.selectedProposalDecision.decision}`, actionType: "elastic_proposal_decision", preview: { operation: "elastic_proposal_decision", decision: body.selectedProposalDecision.decision, appointment_id: "11111111-1111-4111-8111-111111111111", selected_slot_id: body.selectedProposalDecision.slotId ?? null, impact: "The appointment change will be applied." }, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
      return;
    }
    const message = body.messages.at(-1)?.text ?? "";
    const displays = message === "show appointment changes"
      ? [{ kind: "elastic_proposals", title: "Appointment changes needing your decision", data: [{ id: "33333333-3333-4333-8333-333333333333", appointment_id: "11111111-1111-4111-8111-111111111111", timezone: "Asia/Kolkata", old_start_at: "2026-11-19T05:30:00.000Z", recommended_slot_id: "44444444-4444-4444-8444-444444444444", recommended_start_at: "2026-11-20T05:30:00.000Z", recommended_end_at: "2026-11-20T06:00:00.000Z", decision_deadline: "2026-11-18T05:30:00.000Z", candidates: [{ slot_id: "55555555-5555-4555-8555-555555555555", slot_start_at: "2026-11-21T05:30:00.000Z", slot_end_at: "2026-11-21T06:00:00.000Z" }] }] }]
      : [{ kind: "appointments", title: "Your appointments", data: [{ appointment_id: "11111111-1111-4111-8111-111111111111", doctor_name: "Dr. Rao", clinic_name: "Heart Clinic", status: "confirmed", slot_start_at: "2026-11-19T05:30:00.000Z", slot_end_at: "2026-11-19T06:00:00.000Z", timezone: "Asia/Kolkata" }] }];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Here are your appointment details.", displays }) });
  });
  await page.route("**/api/assistant/actions/action-*", async (route) => {
    actionDecisions.push(String(route.request().postDataJSON().decision));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "succeeded" }) });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(patient.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await page.goto("/patient/assistant");
  const conversation = page.getByRole("log", { name: "Assistant conversation" });
  const input = page.getByPlaceholder("Ask about appointments or slots…");

  await input.fill("show my appointments");
  await input.press("Enter");
  await conversation.getByRole("button", { name: "Reschedule" }).click();
  await conversation.getByRole("button", { name: /Choose rescheduling slot:/ }).click();
  await expect(conversation.getByText("Review the replacement appointment.")).toBeVisible();
  await conversation.getByRole("button", { name: "Confirm rescheduling" }).click();
  await expect(conversation.getByText("The appointment was rescheduled.")).toBeVisible();

  await input.fill("show appointment changes");
  await input.press("Enter");
  await conversation.getByRole("button", { name: "Choose another time" }).click();
  await conversation.getByRole("button", { name: /Choose Saturday, November 21, 2026/ }).click();
  await conversation.getByRole("button", { name: "Confirm appointment change" }).click();
  await expect(conversation.getByText("Your appointment change choice was applied.")).toBeVisible();

  await conversation.getByRole("button", { name: "Cancel + request refund" }).click();
  await conversation.getByRole("button", { name: "Cancel appointment and request refund" }).click();
  await expect(conversation.getByText("The appointment was cancelled and any applicable full refund was requested.")).toBeVisible();
  expect(actionDecisions).toEqual(["confirm", "confirm", "confirm"]);
});

test("doctor assistant confirms appointment, prescription, and elastic scheduling actions", async ({ page }) => {
  const doctor = await createTestUser("doctor", "assistant-doctor-actions");
  users.push(doctor);
  await onboardTestUser(doctor);
  const confirmedActions: string[] = [];
  await page.route("**/api/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ text: string }> };
    const text = body.messages.at(-1)?.text ?? "";
    const action = text.includes("cancel") ? { actionType: "doctor_cancellation", preview: { operation: "doctor_cancellation", appointment_id: "11111111-1111-4111-8111-111111111111", patient_name: "Patient A", slot_start_at: "2026-11-20T05:30:00.000Z", timezone: "Asia/Kolkata" } }
      : text.includes("completed") ? { actionType: "doctor_completion", preview: { operation: "doctor_completion", appointment_id: "11111111-1111-4111-8111-111111111111", patient_name: "Patient A" } }
      : text.includes("prescription") ? { actionType: "doctor_prescription", preview: { operation: "doctor_prescription", medication_name: "Doctor-entered medicine", dosage: "10 mg", frequency: "daily", duration: "5 days" } }
      : { actionType: "elastic_adjustment", preview: { operation: "elastic_adjustment", classification: "shrink", affected_appointments: 2 } };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "Review this action.", displays: [], pendingAction: { id: `action-${action.actionType}`, ...action, expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
  });
  await page.route("**/api/assistant/actions/action-*", async (route) => {
    confirmedActions.push(String(route.request().url().split("/").at(-1)));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "succeeded" }) });
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
  const conversation = page.getByRole("log", { name: "Assistant conversation" });
  const input = page.getByPlaceholder("Ask about appointments or slots…");

  await input.fill("cancel this appointment");
  await input.press("Enter");
  await conversation.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(conversation.getByText("The appointment was cancelled and the patient was notified.")).toBeVisible();

  await input.fill("mark the appointment completed");
  await input.press("Enter");
  await conversation.getByRole("button", { name: "Mark appointment completed" }).click();
  await expect(conversation.getByText("The appointment was marked completed.")).toBeVisible();

  await input.fill("publish this prescription");
  await input.press("Enter");
  await expect(conversation.getByText("Doctor-entered medicine")).toBeVisible();
  await conversation.getByRole("button", { name: "Publish prescription" }).click();
  await expect(conversation.getByText("The prescription was published to the patient.")).toBeVisible();

  await input.fill("apply schedule change");
  await input.press("Enter");
  await conversation.getByRole("button", { name: "Apply schedule change and notify patients" }).click();
  await expect(conversation.getByText("The schedule change was applied and affected patients were notified.")).toBeVisible();
  expect(confirmedActions).toEqual(["action-doctor_cancellation", "action-doctor_completion", "action-doctor_prescription", "action-elastic_adjustment"]);
});
