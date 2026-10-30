import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";

type PaymentStatus = "creating" | "pending" | "captured" | "failed" | "abandoned" | "expired" | "captured_unallocated";
type RefundStatus = "requested" | "pending" | "processed" | "failed" | null | undefined;

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const details = status === "captured" ? { label: "Paid", Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" } : status === "failed" ? { label: "Payment failed", Icon: XCircle, className: "bg-red-50 text-red-700 ring-red-200" } : status === "expired" || status === "abandoned" ? { label: "Payment expired", Icon: Clock3, className: "bg-slate-100 text-slate-700 ring-slate-200" } : { label: "Payment pending", Icon: Clock3, className: "bg-amber-50 text-amber-800 ring-amber-200" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${details.className}`}><details.Icon className="size-3.5" aria-hidden="true" />{details.label}</span>;
}

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  if (!status) return null;
  const details = status === "processed" ? { label: "Refund processed", Icon: CheckCircle2, className: "bg-sky-50 text-sky-700 ring-sky-200" } : status === "failed" ? { label: "Refund failed", Icon: XCircle, className: "bg-red-50 text-red-700 ring-red-200" } : { label: "Refund requested", Icon: RotateCcw, className: "bg-amber-50 text-amber-800 ring-amber-200" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${details.className}`}><details.Icon className="size-3.5" aria-hidden="true" />{details.label}</span>;
}
