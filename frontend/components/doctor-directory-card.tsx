import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateLabel } from "@/lib/discovery/format";
import type { DoctorDirectoryRecord } from "@/lib/discovery/types";

export function DoctorDirectoryCard({ doctor }: { doctor: DoctorDirectoryRecord }) {
  return <Card className="flex h-full flex-col">
    <CardHeader>
      <div className="flex items-start justify-between gap-4"><div><CardTitle>{doctor.full_name}</CardTitle><p className="mt-2 text-sm font-medium text-primary">{doctor.specialty}</p></div><Badge variant="secondary">{doctor.experience_years} {doctor.experience_years === 1 ? "year" : "years"}</Badge></div>
      <p className="flex items-center gap-2 pt-2 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden="true" />{doctor.clinic_name}</p>
    </CardHeader>
    <CardContent className="flex-1">
      <div className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><p className="font-medium">Upcoming availability</p>{doctor.available_dates.length ? <div className="mt-1 flex flex-wrap gap-1.5">{doctor.available_dates.slice(0, 3).map((date) => <Badge key={date} variant="outline">{formatDateLabel(date)}</Badge>)}</div> : <p className="mt-1 text-muted-foreground">No upcoming times in the next 30 days.</p>}</div></div>
    </CardContent>
    <CardFooter className="gap-2"><Button asChild className="flex-1"><Link href={`/doctors/${doctor.doctor_id}`}>View profile <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button></CardFooter>
  </Card>;
}
