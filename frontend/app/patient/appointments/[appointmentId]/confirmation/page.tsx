import Link from "next/link";
import { CalendarCheck, Clock, MapPin, Receipt } from "lucide-react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getAppointmentConfirmation } from "@/lib/booking/queries";
import { getPatientPayments } from "@/lib/payments/queries";
import { formatLocalSlotRange } from "@/lib/scheduling/time";
import { isUuid } from "@/lib/discovery/directory";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const instant = false;

export default async function AppointmentConfirmationPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  await connection();
  const account = await requireRole("patient");
  const { appointmentId } = await params;
  if (!isUuid(appointmentId)) notFound();
  const [confirmation, payments] = await Promise.all([getAppointmentConfirmation(appointmentId), getPatientPayments()]);
  if (!confirmation) notFound();
  const { appointment, doctor, slot, notification } = confirmation;
  const payment = payments.find((item) => item.appointment_id === appointmentId);
  const title = appointment.status === "confirmed" ? "Your appointment is booked." : appointment.status === "payment_pending" ? "Payment is still pending." : "Appointment status updated.";
  return <PortalShell role="patient" name={account.profile.full_name}><div className="mx-auto grid max-w-2xl gap-6"><div className="text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><CalendarCheck className="size-7" aria-hidden="true" /></div><h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">Your visit details and payment state are below.</p></div><Card><CardHeader><CardTitle>{doctor.clinic_name}</CardTitle><CardDescription>{appointment.status === "confirmed" ? "Confirmed appointment" : appointment.status === "payment_pending" ? "Payment pending" : "Appointment status: " + appointment.status}</CardDescription></CardHeader><CardContent className="grid gap-4 text-sm"><p className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden="true" />{formatLocalSlotRange(slot.slot_start_at, slot.slot_end_at, doctor.timezone)} ({doctor.timezone})</p><p className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" />{doctor.clinic_name}</p>{appointment.reason && <div className="rounded-lg bg-muted p-3"><p className="font-medium">Visit reason</p><p className="mt-1 text-muted-foreground">{appointment.reason}</p></div>}{payment && <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="flex items-center gap-2 font-medium"><Receipt className="size-4 text-primary" />Payment: {payment.currency} {(payment.amount_minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} · {payment.payment_status}</p>{payment.refund_status && <p className="mt-1 text-sm text-muted-foreground">Refund: {payment.refund_status}</p>}<Link href={`/patient/payments/${payment.payment_id}`} className="mt-2 inline-flex text-sm font-medium text-primary hover:underline">View payment acknowledgement</Link></div>}</CardContent></Card>{notification && <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="font-medium">{notification.title}</p><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p></div>}<div className="flex flex-wrap justify-center gap-3"><Button asChild><Link href="/doctors">Find another doctor</Link></Button><Button asChild variant="outline"><Link href="/patient/appointments">My appointments</Link></Button></div></div></PortalShell>;
}
