"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { SlotBookingDialog } from "@/components/slot-booking-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import type { DoctorDetailRecord, DoctorSlot } from "@/lib/discovery/types";

export function PatientAvailabilityCalendar({ doctor, groups, role }: { doctor: DoctorDetailRecord; groups: Array<{ date: string; label: string; slots: DoctorSlot[] }>; role?: "patient" | "doctor" }) {
  const [selectedDate, setSelectedDate] = useState(groups[0]?.date ?? "");
  const group = groups.find((item) => item.date === selectedDate);
  return <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"><Calendar value={selectedDate} onChange={setSelectedDate} availableDates={groups.map((item) => item.date)} /><div className="min-w-0">{group ? <Card className="rounded-2xl border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-sm font-bold text-slate-800"><span>{group.label}</span><span className="text-xs font-normal text-slate-500">{group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}</span></CardTitle></CardHeader><CardContent><SlotBookingDialog doctor={doctor} slots={group.slots} role={role} /></CardContent></Card> : <EmptyState title="No availability on this date" description="Choose a highlighted date to view bookable Wave slots or Stream arrival windows." />}</div></div>;
}
