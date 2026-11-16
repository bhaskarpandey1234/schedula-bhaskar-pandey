"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clinicAdminAction, type AdminActionState } from "@/lib/clinics/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Clinic = { id: string; name: string; timezone: string };
type Person = { id: string; name: string; clinic_id: string | null };
type Operation = "create_clinic" | "invite_staff" | "assign_doctor" | "assign_staff";
const descriptions: Record<Operation, string> = {
  create_clinic: "Create a new clinic. Doctors and staff receive access only after assignment.",
  invite_staff: "Send an account invitation and give this staff member access to all doctors in the selected clinic.",
  assign_doctor: "Move this doctor to the selected clinic. Staff in that clinic will gain access to the doctor’s appointments. Existing patient-facing clinic names remain unchanged.",
  assign_staff: "Move this staff member’s appointment access to the selected clinic.",
};

function AdminForm({ operation, clinics, doctors, staff }: { operation: Operation; clinics: Clinic[]; doctors: Person[]; staff: Person[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(clinicAdminAction, {} as AdminActionState);
  useEffect(() => { if (state.success) { setOpen(false); router.refresh(); } }, [state.success, router]);
  const label = operation === "create_clinic" ? "Create clinic" : operation === "invite_staff" ? "Invite staff" : operation === "assign_doctor" ? "Assign doctor" : "Assign staff";
  return <div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger><Button type="button" variant="outline">{label}</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{descriptions[operation]}</DialogDescription></DialogHeader>
        <form action={action} className="grid gap-3 text-sm">
          <input type="hidden" name="operation" value={operation} />
          {(operation === "create_clinic" || operation === "invite_staff") && <label className="grid gap-1 font-medium">{operation === "create_clinic" ? "Clinic name" : "Staff full name"}<Input name="name" required minLength={2} maxLength={160} /></label>}
          {operation === "create_clinic" && <label className="grid gap-1 font-medium">IANA timezone<Input name="timezone" defaultValue="Asia/Kolkata" required /></label>}
          {operation !== "create_clinic" && <label className="grid gap-1 font-medium">Clinic<select name="clinicId" className="rounded-md border bg-background p-2" required defaultValue=""><option value="">Choose clinic</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name} · {clinic.timezone}</option>)}</select></label>}
          {operation === "invite_staff" && <label className="grid gap-1 font-medium">Staff email<Input name="email" type="email" required /></label>}
          {operation === "assign_doctor" && <label className="grid gap-1 font-medium">Doctor<select name="doctorId" className="rounded-md border bg-background p-2" required defaultValue=""><option value="">Choose doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>}
          {operation === "assign_staff" && <label className="grid gap-1 font-medium">Staff member<select name="staffId" className="rounded-md border bg-background p-2" required defaultValue=""><option value="">Choose staff member</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
          <div className="rounded-lg border bg-muted/30 p-3">Impact: {descriptions[operation]}</div>
          {state.error && <p role="alert" className="text-destructive">{state.error}</p>}
          {state.stale && <Button type="button" variant="outline" onClick={() => { router.refresh(); setOpen(false); }}>Refresh assignments</Button>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : `Confirm ${label.toLowerCase()}`}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {state.success && <span role="status" className="sr-only">{state.success}</span>}
  </div>;
}

export function ClinicAdminPanel({ clinics, doctors, staff }: { clinics: Clinic[]; doctors: Person[]; staff: Person[] }) {
  const clinicName = (id: string | null) => clinics.find((clinic) => clinic.id === id)?.name ?? "Unassigned";
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Clinic administration</h1><p className="text-sm text-muted-foreground">Assign doctors and staff before they operate a shared clinic queue.</p></div>
    <div className="flex flex-wrap gap-2"><AdminForm operation="create_clinic" clinics={clinics} doctors={doctors} staff={staff} /><AdminForm operation="invite_staff" clinics={clinics} doctors={doctors} staff={staff} /><AdminForm operation="assign_doctor" clinics={clinics} doctors={doctors} staff={staff} /><AdminForm operation="assign_staff" clinics={clinics} doctors={doctors} staff={staff} /></div>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Clinics</h2><ul className="mt-2 space-y-1 text-sm">{clinics.map((clinic) => <li key={clinic.id}>{clinic.name} · {clinic.timezone}</li>)}</ul></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Doctors</h2><ul className="mt-2 space-y-1 text-sm">{doctors.map((doctor) => <li key={doctor.id}>{doctor.name} · {clinicName(doctor.clinic_id)}</li>)}</ul></section>
    <section className="rounded-xl border p-4"><h2 className="font-semibold">Staff</h2><ul className="mt-2 space-y-1 text-sm">{staff.map((person) => <li key={person.id}>{person.name} · {clinicName(person.clinic_id)}</li>)}</ul></section>
  </div>;
}
