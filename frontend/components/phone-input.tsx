"use client";

import { useState } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";

export function PhoneInput({ defaultValue = "", id = "phone" }: { defaultValue?: string; id?: string }) {
  const match = defaultValue.match(/^(\+\d{1,3})(.*)$/);
  const [code, setCode] = useState(match?.[1] ?? "+91");
  const [number, setNumber] = useState(match?.[2]?.trim() ?? "");
  return <div className="grid grid-cols-[130px_1fr] gap-2"><CustomSelect name="countryCode" defaultValue={code} onValueChange={setCode} options={[{ value: "+91", label: "India +91" }, { value: "+1", label: "US +1" }, { value: "+44", label: "UK +44" }, { value: "+65", label: "Singapore +65" }]} /><Input id={id} type="tel" name="phoneNumber" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="9876543210" required /><input type="hidden" name="phone" value={`${code}${number.replace(/\D/g, "")}`} /></div>;
}
