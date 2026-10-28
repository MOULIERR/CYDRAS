// The same money math on the phone, the office and the server.
export type Line = { price: number; qty: number; kind?: 'service' | 'part' | 'adjustment' };
export type Discount = { type: 'pct' | 'amt'; value: number; why?: string } | null;
export type Payment = { amount: number; refunded_amount: number; voided_at: string | null; status: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function totals(lines: Line[], taxRate: number, discount: Discount = null, payments: Payment[] = []) {
  const sub = r2(lines.reduce((a, l) => a + Number(l.price) * Number(l.qty), 0));
  const off = !discount || !discount.value ? 0 : r2(Math.min(sub, discount.type === 'pct' ? (sub * discount.value) / 100 : discount.value));
  const tax = r2((sub - off) * taxRate);
  const total = r2(sub - off + tax);
  const paid = r2(payments.filter((p) => !p.voided_at && p.status === 'succeeded').reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount), 0));
  return { sub, off, tax, total, paid, due: r2(Math.max(0, total - paid)), over: r2(Math.max(0, paid - total)) };
}

export function formatMoney(n: number): string {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
