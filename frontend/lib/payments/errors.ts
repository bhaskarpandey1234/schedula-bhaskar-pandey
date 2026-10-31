const genericPaymentError = "Payment is being reconciled. Check Payments before retrying so you do not pay twice.";

export function presentPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  if (!message || normalized.includes("minified react error") || normalized.includes("server components render") || normalized.includes("digest")) {
    return genericPaymentError;
  }
  if (normalized.includes("payment is not captured")) return "Payment has not been captured yet. Please wait a moment and try again.";
  if (normalized.includes("signature")) return "Payment verification failed. Check Payments before retrying.";
  if (normalized.includes("payment order was not found")) return "This payment session has expired. Please start booking again.";
  return message.length <= 240 ? message : genericPaymentError;
}
