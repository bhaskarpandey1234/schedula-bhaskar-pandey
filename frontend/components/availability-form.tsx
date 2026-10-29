"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAvailabilityAction, type AvailabilityActionState } from "@/lib/availability/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FieldError, FormErrorSummary } from "@/components/ui/form-feedback";
import { Checkbox } from "@/components/ui/checkbox";

const consultingDays = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Generating slots…" : "Create availability"}</Button>;
}

export function AvailabilityForm({ timezone, defaultDate }: { timezone: string; defaultDate: string }) {
  const [state, action] = useActionState(createAvailabilityAction, {} as AvailabilityActionState);
  const [mode, setMode] = useState<"weekly" | "custom">("weekly");
  return <Card><CardHeader><CardTitle>Create availability</CardTitle><CardDescription>Set weekly consulting hours or a one-day custom override. Slots are generated automatically for the next 30 days.</CardDescription></CardHeader><CardContent><form action={action} noValidate className="grid gap-4"><input type="hidden" name="timezone" value={state.values?.timezone ?? timezone} /><div className="grid gap-2"><Label htmlFor="availability-mode">Session type</Label><CustomSelect id="availability-mode" name="mode" value={mode} onValueChange={(value) => setMode(value as "weekly" | "custom")} options={[{ value: "weekly", label: "Weekly consulting days" }, { value: "custom", label: "Custom date" }]} required /></div>{mode === "weekly" ? <fieldset className="grid gap-2"><legend className="text-sm font-medium">Consulting days</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{consultingDays.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><Checkbox name="consultingDays" value={value} defaultChecked={value <= 5} />{label}</label>)}</div><FieldError id="availability-days-error">{state.fieldErrors?.consultingDays}</FieldError></fieldset> : <div className="grid gap-2"><Label htmlFor="sessionDate">Custom date</Label><Input id="sessionDate" name="sessionDate" type="date" defaultValue={state.values?.sessionDate ?? defaultDate} aria-invalid={Boolean(state.fieldErrors?.sessionDate)} required /><FieldError id="availability-date-error">{state.fieldErrors?.sessionDate}</FieldError></div>}<div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="startTime">Start time</Label><Input id="startTime" name="startTime" type="time" defaultValue={state.values?.startTime} aria-invalid={Boolean(state.fieldErrors?.startTime)} required /><FieldError id="availability-start-error">{state.fieldErrors?.startTime}</FieldError></div><div className="grid gap-2"><Label htmlFor="endTime">End time</Label><Input id="endTime" name="endTime" type="time" defaultValue={state.values?.endTime} aria-invalid={Boolean(state.fieldErrors?.endTime)} required /><FieldError id="availability-end-error">{state.fieldErrors?.endTime}</FieldError></div></div><p className="text-sm text-muted-foreground">Timezone: {timezone}</p><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="intervalMinutes">Slot interval</Label><CustomSelect id="intervalMinutes" name="intervalMinutes" defaultValue={state.values?.intervalMinutes ?? "30"} options={[{ value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }, { value: "60", label: "60 minutes" }]} required error={Boolean(state.fieldErrors?.intervalMinutes)} /><FieldError id="availability-interval-error">{state.fieldErrors?.intervalMinutes}</FieldError></div><div className="grid gap-2"><Label htmlFor="capacity">Patients per slot</Label><Input id="capacity" name="capacity" type="number" min="1" max="10" defaultValue={state.values?.capacity ?? "3"} aria-invalid={Boolean(state.fieldErrors?.capacity)} required /><FieldError id="availability-capacity-error">{state.fieldErrors?.capacity}</FieldError></div></div><FormErrorSummary error={state.error} /><SubmitButton /></form></CardContent></Card>;
}
