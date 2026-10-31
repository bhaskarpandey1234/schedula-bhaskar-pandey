"use client";

import { useState } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";

export const phoneCountryCodes = [
  { value: "+91", label: "India +91" },
  { value: "+1", label: "US +1" },
  { value: "+44", label: "UK +44" },
  { value: "+65", label: "Singapore +65" },
] as const;

export function parsePhoneValue(defaultValue: string) {
  const code = phoneCountryCodes.map((option) => option.value).sort((a, b) => b.length - a.length).find((value) => defaultValue.startsWith(value));
  if (code) return { code, number: defaultValue.slice(code.length).replace(/\D/g, "") };
  return { code: "", number: defaultValue.replace(/\D/g, "") };
}

export function PhoneInput({ defaultValue = "", id = "phone" }: { defaultValue?: string; id?: string }) {
  const parsed = parsePhoneValue(defaultValue);
  const [code, setCode] = useState(parsed.code);
  const [number, setNumber] = useState(parsed.number);
  return <div className="grid grid-cols-[150px_1fr] gap-2"><CustomSelect name="countryCode" defaultValue={code} onValueChange={setCode} options={[{ value: "", label: "Select code" }, ...phoneCountryCodes]} required /><Input id={id} type="tel" name="phoneNumber" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="9876543210" inputMode="tel" required /><input type="hidden" name="phone" value={`${code}${number.replace(/\D/g, "")}`} /></div>;
}
