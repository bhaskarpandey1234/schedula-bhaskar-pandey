"use client";

import { useActionState } from "react";
import { createAvailabilityAction, type AvailabilityActionState } from "@/lib/availability/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function AvailabilityForm({ timezone, defaultDate }: { timezone: string; defaultDate: string }) {
  const [state, action, pending] = useActionState(createAvailabilityAction, {} as AvailabilityActionState);
  return <Card><CardHeader><CardTitle>Create availability</CardTitle><CardDescription>Set a future same-day window. Schedula will generate wave slots automatically.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="sessionDate">Date</Label><Input id="sessionDate" name="sessionDate" type="date" defaultValue={defaultDate} required /></div><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="startTime">Start time</Label><Input id="startTime" name="startTime" type="time" required /></div><div className="grid gap-2"><Label htmlFor="endTime">End time</Label><Input id="endTime" name="endTime" type="time" required /></div></div><div className="grid gap-2"><Label htmlFor="timezone">Timezone</Label><Input id="timezone" name="timezone" defaultValue={timezone} required /></div><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="intervalMinutes">Slot interval</Label><Select id="intervalMinutes" name="intervalMinutes" defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></Select></div><div className="grid gap-2"><Label htmlFor="capacity">Patients per slot</Label><Input id="capacity" name="capacity" type="number" min="1" max="10" defaultValue="3" required /></div></div>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}<Button type="submit" disabled={pending}>{pending ? "Generating slots…" : "Create availability"}</Button></form></CardContent></Card>;
}
