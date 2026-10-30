export type CheckoutPrefill = {
  name: string;
  email: string;
  contact: string;
};

const internationalPhonePattern = /^\+[1-9]\d{7,14}$/;

export function createCheckoutPrefill(input: {
  name: string | null | undefined;
  email: string | null | undefined;
  contact: string | null | undefined;
}): CheckoutPrefill | null {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const contact = input.contact?.trim() ?? "";

  if (!name || !email || !internationalPhonePattern.test(contact)) return null;
  return { name, email, contact };
}
