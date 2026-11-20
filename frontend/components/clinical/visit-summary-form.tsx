"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveDoctorVisitSummaryAction } from "@/lib/clinical/actions";
import type { DoctorVisitSummary } from "@/lib/clinical/queries";

export function VisitSummaryForm({ appointmentId, summary }: { appointmentId: string; summary: DoctorVisitSummary | null }) {
  const [state, action, pending] = useActionState(saveDoctorVisitSummaryAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const publishRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [review, setReview] = useState(false);
  const version = state.version ?? summary?.version ?? 0;

  function submit(publish: boolean) {
    if (publishRef.current) publishRef.current.value = String(publish);
    submittingRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(event) => {
        if (!submittingRef.current) {
          event.preventDefault();
          setReview(true);
          return;
        }
        submittingRef.current = false;
      }}
      className="grid gap-3 rounded-xl border bg-card p-4"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input ref={publishRef} type="hidden" name="publish" value="false" />
      <div>
        <h3 className="font-semibold">Visit summary</h3>
        <p className="mt-1 text-xs text-muted-foreground">Drafts remain doctor-only. Publishing makes this summary visible in the patient’s visit history.</p>
      </div>
      <Textarea name="summary" defaultValue={summary?.summary ?? ""} required maxLength={4000} placeholder="Consultation findings, assessment, plan, and follow-up advice." />
      {review ? (
        <Alert role="dialog" aria-label="Review visit summary" className="border-primary/30 bg-primary/5">
          <AlertTitle>Review visit summary</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Save a doctor-only draft, or publish the patient-facing summary. Publishing cannot be undone; later corrections are saved as a new version.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setReview(false)}>Keep editing</Button>
              <Button type="button" variant="secondary" onClick={() => submit(false)} disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button>
              <Button type="button" onClick={() => submit(true)} disabled={pending}>{pending ? "Publishing…" : "Confirm and publish"}</Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Review summary"}</Button>}
      {state.error && <Alert variant="destructive"><AlertTitle>Could not save visit summary</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>}
      {state.success && <Alert><AlertTitle>Saved</AlertTitle><AlertDescription>{state.success}</AlertDescription></Alert>}
    </form>
  );
}
