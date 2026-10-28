export type FieldErrors = Record<string, string>;

export type FormActionState = {
  error?: string;
  success?: boolean;
  code?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
};

export function formValues(formData: FormData) {
  return Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
}

export function zodFieldErrors(error: unknown) {
  if (!error || typeof error !== "object" || !("issues" in error)) return {};
  const issues = (error as { issues: Array<{ path?: PropertyKey[]; message: string }> }).issues;
  return Object.fromEntries(issues.filter((issue) => issue.path?.[0]).map((issue) => [String(issue.path?.[0]), issue.message]));
}

export function firstZodError(error: unknown) {
  if (!error || typeof error !== "object" || !("issues" in error)) return undefined;
  return (error as { issues: Array<{ message: string }> }).issues[0]?.message;
}
