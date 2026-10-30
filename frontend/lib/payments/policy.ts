export type RefundPolicy = { fullHours: number; partialHours: number; partialPercent: number };
export const defaultRefundPolicy: RefundPolicy = { fullHours: 24, partialHours: 2, partialPercent: 50 };

export function refundPercent(appointmentStart: Date, now = new Date(), policy = defaultRefundPolicy) {
  const hours = (appointmentStart.getTime() - now.getTime()) / 3_600_000;
  if (hours >= policy.fullHours) return 100;
  if (hours >= policy.partialHours) return policy.partialPercent;
  return 0;
}

export function refundAmountMinor(paidMinor: number, alreadyRefundedMinor: number, appointmentStart: Date, now = new Date(), policy = defaultRefundPolicy) {
  return Math.max(0, Math.floor(Math.max(0, paidMinor - alreadyRefundedMinor) * refundPercent(appointmentStart, now, policy) / 100));
}
