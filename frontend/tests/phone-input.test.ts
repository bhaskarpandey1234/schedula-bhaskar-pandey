import { describe, expect, it } from "vitest";
import { parsePhoneValue } from "../components/phone-input";

describe("PhoneInput", () => {
  it.each([
    ["+919876543210", "+91", "9876543210"],
    ["+14155552671", "+1", "4155552671"],
    ["+447911123456", "+44", "7911123456"],
    ["+6581234567", "+65", "81234567"],
  ])("parses %s without dropping digits", (value, code, number) => {
    expect(parsePhoneValue(value)).toEqual({ code, number });
    expect(`${code}${number}`).toBe(value);
  });

  it("keeps all digits for an unsupported legacy prefix until the user chooses a code", () => {
    expect(parsePhoneValue("+999123456789")).toEqual({ code: "", number: "999123456789" });
  });

  it("starts empty when no phone value exists", () => {
    expect(parsePhoneValue("")).toEqual({ code: "", number: "" });
  });
});
