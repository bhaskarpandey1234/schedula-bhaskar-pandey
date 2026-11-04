export type NotificationTemplateInput = {
  template: string;
  recipientName: string;
  recipientRole: "patient" | "doctor";
  patientName: string;
  doctorName: string;
  clinicName: string;
  timezone: string;
  slotStartAt: string;
  slotEndAt: string;
  schedulingType?: "wave" | "stream";
  amountMinor?: number | null;
  currency?: string | null;
};

function appointmentTime(input: NotificationTemplateInput) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: input.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(input.slotStartAt));
  const end = new Intl.DateTimeFormat("en-US", { timeZone: input.timezone, timeStyle: "short" }).format(new Date(input.slotEndAt));
  return `${input.schedulingType === "stream" ? "Arrive " : ""}${date}–${end} (${input.timezone})`;
}

export function renderNotificationTemplate(input: NotificationTemplateInput, channel: "email" | "sms" | "whatsapp") {
  const time = appointmentTime(input);
  const forDoctor = input.recipientRole === "doctor";
  const reminder = input.template.startsWith("appointment_reminder");
  const subject = reminder ? "Upcoming Schedula appointment" : input.template === "appointment_cancelled" ? "Schedula appointment cancelled" : input.template === "appointment_rescheduled" ? "Schedula appointment rescheduled" : input.template === "refund_processed" ? "Schedula refund processed" : input.template === "refund_failed" ? "Schedula refund update" : input.template === "payment_failed" ? "Schedula payment update" : "Schedula appointment update";
  const body = forDoctor
    ? reminder
      ? `Reminder: ${input.patientName} has an appointment at ${input.clinicName} on ${time}.`
      : input.template === "appointment_cancelled"
        ? `${input.patientName}'s appointment at ${input.clinicName} was cancelled.`
        : input.template === "appointment_rescheduled"
          ? `${input.patientName}'s appointment at ${input.clinicName} is now scheduled for ${time}.`
          : input.template === "appointment_booked"
            ? `New appointment: ${input.patientName} booked a slot at ${input.clinicName} for ${time}.`
            : `Appointment update: ${input.patientName} has an appointment at ${input.clinicName} on ${time}.`
    : reminder
      ? `Reminder: your appointment with ${input.doctorName} at ${input.clinicName} is ${time}.`
      : input.template === "appointment_cancelled"
        ? `Your appointment with ${input.doctorName} at ${input.clinicName} was cancelled. Please choose another available time.`
        : input.template === "appointment_rescheduled"
          ? `Your appointment with ${input.doctorName} at ${input.clinicName} is now scheduled for ${time}.`
        : input.template === "refund_processed"
          ? `Your refund for the Schedula appointment with ${input.doctorName} was processed.`
          : input.template === "refund_failed"
            ? `Your Schedula refund for the appointment with ${input.doctorName} needs attention. Please contact support.`
            : input.template === "payment_failed"
              ? `Payment for your Schedula appointment with ${input.doctorName} was not completed. Please try again if the appointment is still available.`
              : `Your appointment with ${input.doctorName} at ${input.clinicName} is confirmed for ${time}.`;
  return channel === "email" ? { subject, text: `Hello ${input.recipientName},\n\n${body}\n\nSchedula` } : { subject, text: `Schedula: ${body}`.slice(0, 480) };
}
