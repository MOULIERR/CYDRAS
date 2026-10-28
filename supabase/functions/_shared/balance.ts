// What is still owed on an invoice, worked out on the server (never trust the phone's number).
export type Pay = { amount: number | string; refunded_amount: number | string; voided_at: string | null; status: string };

export function balanceDue(total: number | string, pays: Pay[]): number {
  const paid = pays.filter((p) => !p.voided_at && p.status === 'succeeded').reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount), 0);
  return Math.max(0, Math.round((Number(total) - paid) * 100) / 100);
}

export function refundable(p: Pay & { method: string }): number {
  if (p.voided_at || p.status !== 'succeeded') return 0;
  return Math.round((Number(p.amount) - Number(p.refunded_amount)) * 100) / 100;
}
