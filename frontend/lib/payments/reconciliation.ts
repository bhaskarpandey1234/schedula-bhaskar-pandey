import type { ProviderPayment } from "@/lib/payments/provider";

export function findMatchingCapturedPayment(
  payments: ProviderPayment[],
  input: { orderId: string; amountMinor: number; currency: string; acceptedStatuses?: readonly string[] },
) {
  const acceptedStatuses = input.acceptedStatuses ?? ["captured"];
  return payments.find((payment) =>
    payment.orderId === input.orderId &&
    payment.amount === input.amountMinor &&
    payment.currency === input.currency &&
    acceptedStatuses.includes(payment.status),
  );
}
