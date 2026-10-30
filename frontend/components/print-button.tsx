"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print acknowledgement" }: { label?: string }) {
  return <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">{label}</Button>;
}
