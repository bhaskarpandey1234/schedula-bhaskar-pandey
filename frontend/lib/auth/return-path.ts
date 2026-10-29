const bookingPath = /^\/patient\/doctors\/[0-9a-f-]{36}\/book\/[0-9a-f-]{36}$/i;

export function safeReturnPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") return undefined;
  return bookingPath.test(value) ? value : undefined;
}
