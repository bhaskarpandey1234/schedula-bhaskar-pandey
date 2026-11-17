export function normalizeCheckinToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toUpperCase();
  return /^T\d{3,}$/.test(token) ? token : null;
}

export function resolveCheckinToken(notificationToken: unknown, queueToken: unknown): string | null {
  return normalizeCheckinToken(notificationToken) ?? normalizeCheckinToken(queueToken);
}
