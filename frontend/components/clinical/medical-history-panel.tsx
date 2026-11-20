import type { ClinicalMedicalHistory, ClinicalVisit } from "@/lib/clinical/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { parseMedicalDetails } from "@/lib/clinical/vitals";
import {
  ShieldAlert,
  ShieldCheck,
  HeartPulse,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Building2,
  Activity,
  History,
} from "lucide-react";

function dateTime(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function sourceLabel(history: ClinicalMedicalHistory) {
  return history.verification_status === "clinician_verified" ? "Clinician verified" : "Self reported";
}

function allergySeverityBadge(severity: string) {
  switch (severity.toLowerCase()) {
    case "severe":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="size-3" />
          Severe
        </span>
      );
    case "moderate":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          Moderate
        </span>
      );
    case "mild":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400">
          Mild
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {severity || "Unknown"}
        </span>
      );
  }
}

export function MedicalHistorySummaryCards({
  history,
  visits,
}: {
  history: ClinicalMedicalHistory | null;
  visits: ClinicalVisit[];
}) {
  const allergyStatus = history?.allergies.status ?? "unknown";
  const allergyCount = history?.allergies.items.length ?? 0;
  const activeConditionsCount = history?.conditions.items.filter((item) => item.status === "active").length ?? 0;
  const isClinicianVerified = history?.verification_status === "clinician_verified";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Metric 1: Allergy Status */}
      <div className="rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold uppercase tracking-wider">Allergies</span>
          <ShieldAlert className="size-4 text-amber-500" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          {allergyStatus === "none_known" ? "No Known" : allergyCount > 0 ? allergyCount : "None"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {allergyStatus === "none_known"
            ? "Confirmed clear"
            : allergyCount > 0
              ? `${allergyCount} recorded allergen${allergyCount === 1 ? "" : "s"}`
              : "Not recorded"}
        </p>
      </div>

      {/* Metric 2: Active Conditions */}
      <div className="rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold uppercase tracking-wider">Conditions</span>
          <HeartPulse className="size-4 text-primary" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{activeConditionsCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeConditionsCount === 0 ? "No active conditions" : `${activeConditionsCount} active condition${activeConditionsCount === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Metric 3: Total Completed Visits */}
      <div className="rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold uppercase tracking-wider">Visits</span>
          <Stethoscope className="size-4 text-sky-500" />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{visits.length}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {visits.length === 0 ? "No completed visits" : `${visits.length} published summar${visits.length === 1 ? "y" : "ies"}`}
        </p>
      </div>

      {/* Metric 4: Record Verification */}
      <div className="rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold uppercase tracking-wider">Record Status</span>
          <CheckCircle2 className={cn("size-4", isClinicianVerified ? "text-emerald-500" : "text-amber-500")} />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          {isClinicianVerified ? "Verified" : "Self-Reported"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {history ? `Version ${history.version} active` : "No record on file"}
        </p>
      </div>
    </div>
  );
}

export function MedicalHistoryPanel({
  history,
  revisions = [],
  showRevisions = false,
}: {
  history: ClinicalMedicalHistory | null;
  revisions?: ClinicalMedicalHistory[];
  showRevisions?: boolean;
}) {
  if (!history) return <Card><CardContent className="p-5 text-sm text-muted-foreground">No medical history has been recorded yet.</CardContent></Card>;
  const allergyLabel = history.allergies.status === "none_known" ? "No known allergies" : history.allergies.status === "unknown" ? "Allergies not recorded" : "Recorded allergies";
  const details = parseMedicalDetails(history.medical_details);

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden rounded-2xl border shadow-xs">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold sm:text-lg">Current Medical Profile</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Version {history.version} recorded {dateTime(history.created_at)}.
              </p>
            </div>
          </div>
          <Badge
            variant={history.verification_status === "clinician_verified" ? "secondary" : "outline"}
            className={cn(
              "px-2.5 py-0.5 text-xs font-medium",
              history.verification_status === "clinician_verified" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
            )}
          >
            {sourceLabel(history)}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-6 p-5 text-sm">
          {/* Allergies Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldAlert className="size-4 text-amber-500" />
                {allergyLabel}
              </h3>
              {history.allergies.status === "recorded" && (
                <span className="text-xs text-muted-foreground">
                  {history.allergies.items.length} {history.allergies.items.length === 1 ? "item" : "items"}
                </span>
              )}
            </div>

            {history.allergies.status === "none_known" && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Confirmed: No known allergies to medications, foods, or environmental factors.</span>
              </div>
            )}

            {history.allergies.status === "unknown" && (
              <div className="rounded-xl border border-dashed bg-muted/20 p-3.5 text-xs text-muted-foreground">
                Allergy status has not been recorded yet. Update your medical history below if you have any allergies.
              </div>
            )}

            {history.allergies.items.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {history.allergies.items.map((item, index) => (
                  <li key={`${item.substance}-${index}`} className="flex flex-col justify-between rounded-xl border bg-card p-3 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{item.substance}</p>
                      {allergySeverityBadge(item.severity)}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reaction: <span className="font-medium text-foreground/80">{item.reaction || "None specified"}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Conditions Section */}
          <section className="space-y-2.5 border-t pt-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HeartPulse className="size-4 text-primary" />
                Existing conditions
              </h3>
              <span className="text-xs text-muted-foreground">
                {history.conditions.items.length} {history.conditions.items.length === 1 ? "condition" : "conditions"}
              </span>
            </div>

            {history.conditions.items.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/20 p-3.5 text-xs text-muted-foreground">
                No chronic or existing medical conditions recorded.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {history.conditions.items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex flex-col justify-between rounded-xl border bg-card p-3 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                          item.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-muted text-muted-foreground border border-border",
                        )}
                      >
                        {item.status === "active" && <span className="size-1.5 rounded-full bg-emerald-500" />}
                        {item.status}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Notes: <span className="text-foreground/80">{item.notes}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Details Section */}
          {(details.notes || details.healthProfile.currentConcerns.length > 0 || details.healthProfile.pastSurgeries.length > 0 || details.healthProfile.selfReportedMedications.length > 0) && (
            <section className="space-y-2 border-t pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-muted-foreground" />
                Other relevant details
              </h3>
              {details.notes && <div className="rounded-xl bg-muted/40 p-3.5 text-xs leading-relaxed text-foreground/85 whitespace-pre-wrap">{details.notes}</div>}
              {details.healthProfile.currentConcerns.length > 0 && <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Reported concerns:</span> {details.healthProfile.currentConcerns.map((item) => item.description).join(", ")}</p>}
              {details.healthProfile.pastSurgeries.length > 0 && <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Past surgeries:</span> {details.healthProfile.pastSurgeries.map((item) => item.procedure).join(", ")}</p>}
              {details.healthProfile.selfReportedMedications.length > 0 && <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Other medications:</span> {details.healthProfile.selfReportedMedications.map((item) => item.name).join(", ")}</p>}
            </section>
          )}
        </CardContent>
      </Card>

      {/* Revision History (suppressed in patient view, enabled only when showRevisions is true) */}
      {showRevisions && revisions.length > 0 && (
        <Card className="rounded-2xl border shadow-xs">
          <CardHeader className="border-b bg-muted/20 pb-3.5">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-bold sm:text-base">Revision Audit Log</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {revisions.map((revision) => (
              <div key={revision.version} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs transition-colors hover:bg-muted/15">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 items-center justify-center rounded-md border bg-muted/50 font-mono text-xs font-bold text-foreground">
                    v{revision.version}
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{sourceLabel(revision)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Recorded {dateTime(revision.created_at)}
                      {revision.verified_at ? ` · verified ${dateTime(revision.verified_at)}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize text-[11px]">
                  {revision.allergies.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function VisitHistoryPanel({ visits, patientView }: { visits: ClinicalVisit[]; patientView: boolean }) {
  return (
    <Card className="rounded-2xl border shadow-xs">
      <CardHeader className="border-b bg-muted/20 pb-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="size-4 text-primary" />
            <CardTitle className="text-base font-bold sm:text-lg">Completed visits</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {visits.length} {visits.length === 1 ? "consultation" : "consultations"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5">
        {visits.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-4 text-center">
            <Stethoscope className="size-6 text-muted-foreground/60" />
            <p className="mt-2 text-xs font-medium text-muted-foreground">No completed visits yet.</p>
          </div>
        ) : (
          visits.map((visit) => {
            const doctorInitials = visit.doctor_name
              .replace(/^Dr\.\s*/i, "")
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase() || "DR";

            return (
              <article
                key={visit.appointment_id}
                className="overflow-hidden rounded-2xl border bg-card transition-all hover:border-border hover:shadow-sm"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                      {doctorInitials}
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-sm sm:text-base">{visit.doctor_name}</h4>
                      <p className="text-xs font-medium text-muted-foreground">
                        {visit.specialty}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="size-3 text-muted-foreground" />
                          {visit.clinic_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3 text-muted-foreground" />
                          {dateTime(visit.completed_at, visit.timezone)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                    Completed
                  </Badge>
                </div>

                {/* Consultation Summary Section */}
                <div className="p-4">
                  {visit.summary ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                        <Stethoscope className="size-3.5" />
                        <span>
                          {patientView
                            ? "Published visit summary"
                            : visit.summary_status === "draft"
                              ? "Doctor draft"
                              : "Published visit summary"}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-foreground font-medium">
                        {visit.summary}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No summary recorded for this visit.
                    </p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
