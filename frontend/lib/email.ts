import { Resend } from "resend";

type BookingEmail = {
  to: string;
  doctorName: string;
  clinicName: string;
  timezone: string;
  slotStartAt: string;
  slotEndAt: string;
  reason: string | null;
};

type EmailClient = {
  emails: {
    send(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  };
};

export type BookingEmailDelivery = "sent" | "skipped" | "failed";

export async function sendBookingConfirmationEmail(details: BookingEmail, client?: EmailClient): Promise<BookingEmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || (!apiKey && !client)) return "skipped";
  const resend = client ?? new Resend(apiKey!);
  try {
    await resend.emails.send({
      from,
      to: details.to,
      subject: `Appointment confirmed with ${details.doctorName}`,
      text: [
        "Your Schedula appointment is confirmed.",
        `Doctor: ${details.doctorName}`,
        `Clinic: ${details.clinicName}`,
        `Time: ${new Intl.DateTimeFormat("en-US", { timeZone: details.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(details.slotStartAt))} – ${new Intl.DateTimeFormat("en-US", { timeZone: details.timezone, timeStyle: "short" }).format(new Date(details.slotEndAt))} (${details.timezone})`,
        details.reason ? `Visit reason: ${details.reason}` : undefined,
      ].filter(Boolean).join("\n"),
    });
    return "sent";
  } catch {
    return "failed";
  }
}
