export type RefundState = "requested" | "pending" | "processed" | "failed";

/** Provider state is allowed to advance a refund, but never regress a settled one. */
export function nextRefundState(current: RefundState, event: "processed" | "failed"): RefundState {
  if (current === "processed") return "processed";
  return event;
}

export function isRetryableRefundError(status?: number) {
  return status === undefined || status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
}

export function safeRefundFailureReason(status?: number) {
  if (status === 401 || status === 403) return "Refund provider authentication failed";
  if (status === 400 || status === 404 || status === 422) return "Refund provider rejected the request";
  if (status === 429) return "Refund provider is temporarily rate limited";
  if (status && status >= 500) return "Refund provider is temporarily unavailable";
  return "Refund provider could not be reached";
}
