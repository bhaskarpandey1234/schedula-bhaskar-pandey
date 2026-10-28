import { connection } from "next/server";
import Link from "next/link";
import { CalendarDays, ClipboardList, UserRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/guards";
import { getDoctorSchedule } from "@/lib/availability/actions";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function DoctorPage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctors").select("timezone").eq("id", account.user.id).single();
  if (!doctor) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: doctor.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const schedule = await getDoctorSchedule(today);
  const booked = schedule.slots.reduce((total, slot) => total + slot.allocated_count, 0);
  return <PortalShell role="doctor" name={account.profile.full_name}><div className="grid gap-6">
    <div><p className="text-sm font-medium text-primary">Doctor dashboard</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Your practice at a glance.</h1><p className="mt-2 text-muted-foreground">Manage today’s availability and keep appointments moving.</p></div>
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4 text-primary" />Today’s slots</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{schedule.slots.length}</p><p className="text-sm text-muted-foreground">Published availability</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4 text-primary" />Booked today</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{booked}</p><p className="text-sm text-muted-foreground">Patient appointments</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Profile</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Keep your public details current.</p><Button asChild size="sm" variant="outline" className="mt-3"><Link href="/doctor/profile">View profile</Link></Button></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button asChild><Link href="/doctor/schedule">Manage schedule</Link></Button><Button asChild variant="outline"><Link href="/doctor/appointments">View appointments</Link></Button></CardContent></Card>
  </div></PortalShell>;
}
