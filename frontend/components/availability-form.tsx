"use client";

import { useActionState, useEffect, useState } from "react";
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
type Mode = "weekly" | "monthly" | "custom";
type SessionType = "recurring" | "specific_date";
type RecurrenceMethod = "day" | "date";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Generating slots…" : "Create availability"}</Button>;
}

export function AvailabilityForm({ timezone, defaultDate, initialMode = "weekly" }: { timezone: string; defaultDate: string; initialMode?: Mode }) {
  const [state, action] = useActionState(createAvailabilityAction, {} as AvailabilityActionState);
  const [sessionType, setSessionType] = useState<SessionType>(initialMode === "custom" ? "specific_date" : "recurring");
  const [recurrenceMethod, setRecurrenceMethod] = useState<RecurrenceMethod>(initialMode === "monthly" ? "date" : "day");
  const [schedulingType, setSchedulingType] = useState<"wave" | "stream">("wave");
  const submittedSessionType = state.values?.sessionType;
  const submittedRecurrenceMethod = state.values?.recurrenceMethod;
  const submittedSchedulingType = state.values?.schedulingType;
  useEffect(() => {
    if (submittedSessionType === "recurring" || submittedSessionType === "specific_date") setSessionType(submittedSessionType);
    if (submittedRecurrenceMethod === "day" || submittedRecurrenceMethod === "date") setRecurrenceMethod(submittedRecurrenceMethod);
    if (submittedSchedulingType === "wave" || submittedSchedulingType === "stream") setSchedulingType(submittedSchedulingType);
  }, [submittedSessionType, submittedRecurrenceMethod, submittedSchedulingType]);
  const submittedDays = state.values?.consultingDays?.split(",").filter(Boolean) ?? null;
  const isRecurringByDay = sessionType === "recurring" && recurrenceMethod === "day";
  const isRecurringByDate = sessionType === "recurring" && recurrenceMethod === "date";
  return (
    <Card>
      <CardHeader><CardTitle>Create availability</CardTitle><CardDescription>Set a finite recurring schedule or availability for one specific date. New recurring schedules can span up to 12 months.</CardDescription></CardHeader>
      <CardContent>
        <form action={action} noValidate className="grid gap-4">
          <input type="hidden" name="timezone" value={state.values?.timezone ?? timezone} />
          <div className="grid min-w-0 gap-2"><Label htmlFor="session-type">Session type</Label><CustomSelect id="session-type" name="sessionType" value={sessionType} onValueChange={(value) => setSessionType(value as SessionType)} options={[{ value: "recurring", label: "Recurring" }, { value: "specific_date", label: "Specific date" }]} required /></div>
          {sessionType === "recurring" && <div className="grid min-w-0 gap-2"><Label htmlFor="recurrence-method">Recurring by</Label><CustomSelect id="recurrence-method" name="recurrenceMethod" value={recurrenceMethod} onValueChange={(value) => setRecurrenceMethod(value as RecurrenceMethod)} options={[{ value: "day", label: "By day — selected weekdays" }, { value: "date", label: "By date — monthly date range" }]} required /><FieldError id="availability-recurrence-method-error">{state.fieldErrors?.recurrenceMethod}</FieldError></div>}
          <div className="grid min-w-0 gap-2"><Label htmlFor="scheduling-type">Scheduling type</Label><CustomSelect id="scheduling-type" name="schedulingType" value={schedulingType} onValueChange={(value) => setSchedulingType(value as "wave" | "stream")} options={[{ value: "wave", label: "Wave — repeated appointment slots" }, { value: "stream", label: "Stream — shared arrival window" }]} required /><p className="text-xs text-muted-foreground">Wave creates independent duration slots. Stream creates one capacity-limited arrival window.</p></div>
          {isRecurringByDay ? <>
            <fieldset className="grid min-w-0 gap-2"><legend className="text-sm font-medium">Consulting days</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{consultingDays.map(([value, label]) => <label key={value} className="flex min-w-0 items-center gap-2 text-sm"><Checkbox name="consultingDays" value={value} defaultChecked={submittedDays ? submittedDays.includes(String(value)) : value <= 5} />{label}</label>)}</div><FieldError id="availability-days-error">{state.fieldErrors?.consultingDays}</FieldError></fieldset>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2"><div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceStartDate">Starts on</Label><Input id="recurrenceStartDate" name="recurrenceStartDate" type="date" defaultValue={state.values?.recurrenceStartDate ?? defaultDate} required /></div><div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceEndDate">Ends on</Label><Input id="recurrenceEndDate" name="recurrenceEndDate" type="date" defaultValue={state.values?.recurrenceEndDate} required /></div></div>
          </> : isRecurringByDate ? <>
            <div className="grid min-w-0 gap-3"><div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceStartDate">First recurring date</Label><Input id="recurrenceStartDate" name="recurrenceStartDate" type="date" defaultValue={state.values?.recurrenceStartDate ?? defaultDate} required /></div><div className="grid min-w-0 gap-2"><Label htmlFor="monthlyRangeEndDay">Last day each month</Label><Input id="monthlyRangeEndDay" name="monthlyRangeEndDay" type="number" min="1" max="31" defaultValue={state.values?.monthlyRangeEndDay ?? "20"} required /></div><div className="grid min-w-0 gap-2"><Label htmlFor="recurrenceEndDate">Repeat through</Label><Input id="recurrenceEndDate" name="recurrenceEndDate" type="date" defaultValue={state.values?.recurrenceEndDate} required /></div></div><FieldError id="availability-monthly-error">{state.fieldErrors?.recurrenceStartDate ?? state.fieldErrors?.monthlyRangeEndDay ?? state.fieldErrors?.recurrenceEndDate}</FieldError>
          </> : <div className="grid gap-2"><Label htmlFor="sessionDate">Specific date</Label><Input id="sessionDate" name="sessionDate" type="date" defaultValue={state.values?.sessionDate ?? defaultDate} aria-invalid={Boolean(state.fieldErrors?.sessionDate)} required /><FieldError id="availability-date-error">{state.fieldErrors?.sessionDate}</FieldError></div>}
          <div className="grid min-w-0 gap-2 md:grid-cols-2"><div className="grid min-w-0 gap-2"><Label htmlFor="startTime">Start time</Label><Input id="startTime" name="startTime" type="time" defaultValue={state.values?.startTime} aria-invalid={Boolean(state.fieldErrors?.startTime)} required /><FieldError id="availability-start-error">{state.fieldErrors?.startTime}</FieldError></div><div className="grid min-w-0 gap-2"><Label htmlFor="endTime">End time</Label><Input id="endTime" name="endTime" type="time" defaultValue={state.values?.endTime} aria-invalid={Boolean(state.fieldErrors?.endTime)} required /><FieldError id="availability-end-error">{state.fieldErrors?.endTime}</FieldError></div></div>
          <p className="text-sm text-muted-foreground">Timezone: {timezone}</p>
          <div className="grid min-w-0 gap-2 md:grid-cols-2"><div className="grid min-w-0 gap-2">{schedulingType === "wave" ? <><Label htmlFor="intervalMinutes">Appointment duration</Label><CustomSelect id="intervalMinutes" name="intervalMinutes" defaultValue={state.values?.intervalMinutes ?? "30"} options={[{ value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }, { value: "60", label: "60 minutes" }]} required error={Boolean(state.fieldErrors?.intervalMinutes)} /><FieldError id="availability-interval-error">{state.fieldErrors?.intervalMinutes}</FieldError></> : <><Label>Appointment duration</Label><p className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">Stream uses the full window</p></>}</div><div className="grid min-w-0 gap-2"><Label htmlFor="capacity">{schedulingType === "wave" ? "Patients per slot" : "Patients per window"}</Label><Input id="capacity" name="capacity" type="number" min="1" max="10" defaultValue={state.values?.capacity ?? "3"} aria-invalid={Boolean(state.fieldErrors?.capacity)} required /><FieldError id="availability-capacity-error">{state.fieldErrors?.capacity}</FieldError></div></div>
          <FormErrorSummary error={state.error} /><SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
