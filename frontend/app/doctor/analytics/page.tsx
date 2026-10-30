import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";

export const instant = false;

type UtilizationRow = {
  period: string;
  total_slots: number;
  booked_slots: number;
  cancelled_slots: number;
  utilization_percent: number;
};

function UtilizationBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export default async function DoctorAnalyticsPage() {
  await connection();
  const account = await requireRole("doctor");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doctor_slot_utilization");
  const rows: UtilizationRow[] = error ? [] : ((data ?? []) as UtilizationRow[]);

  const totalSlots = rows.reduce((s, r) => s + Number(r.total_slots), 0);
  const totalBooked = rows.reduce((s, r) => s + Number(r.booked_slots), 0);
  const overallUtilization = totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0;

  return (
    <PortalShell role="doctor" name={account.profile.full_name}>
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-medium text-primary">Analytics</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Slot utilization</h1>
          <p className="mt-2 text-muted-foreground">Weekly booking rates across the last 12 weeks and next 4 weeks.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total slots</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{totalSlots}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Booked</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{totalBooked}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Overall utilization</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{overallUtilization}%</p></CardContent>
          </Card>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No data yet" description="Utilization data will appear once you have published slots." />
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Weekly breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="hidden grid-cols-5 gap-4 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Week of</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Booked</span>
                  <span className="text-right">Cancelled</span>
                  <span className="text-right">Utilization</span>
                </div>
                {rows.map((row) => (
                  <div key={row.period} className="grid gap-2">
                    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                      <span className="font-medium">{row.period}</span>
                      <span className="text-right text-muted-foreground">{row.total_slots}</span>
                      <span className="text-right text-muted-foreground">{row.booked_slots}</span>
                      <span className="text-right text-muted-foreground">{row.cancelled_slots}</span>
                      <span className="text-right font-medium">{row.utilization_percent}%</span>
                    </div>
                    <UtilizationBar percent={Number(row.utilization_percent)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
