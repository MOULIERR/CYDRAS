// Unpaid invoices: who owes you, oldest first. Tap one to open the job and take payment.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useRows } from '../src/lib/sync';
import { money, fmtDay } from '../src/lib/data';
import { Screen, Card, T, H1, Pill } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function Unpaid() {
  const t = useT();
  const inv = useRows<any>('invoices', (i) => i.status === 'open');
  const pays = useRows<any>('payments');
  const custs = useRows<any>('customers');
  const rows = inv.map((i) => ({ i, due: Math.max(0, Number(i.total) - pays.filter((p) => p.invoice_id === i.id && p.status === 'succeeded' && !p.voided_at).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount ?? 0), 0)), c: custs.find((c) => c.id === i.customer_id) }))
    .filter((x) => x.due > 0).sort((a, b) => (a.i.issued_at ?? '').localeCompare(b.i.issued_at ?? ''));
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return <Screen>
    <Card><T s>Total owed</T><H1>{money(rows.reduce((a, x) => a + x.due, 0))}</H1><T s>{rows.length} invoice{rows.length === 1 ? '' : 's'}</T></Card>
    <View style={{ gap: 10 }}>{rows.map(({ i, due, c }) => <Pressable key={i.id} onPress={() => i.job_id && router.push(`/job/${i.job_id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 14, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flex: 1 }}><T b>{c?.name ?? 'Customer'}</T><T s size={14}>Invoice {i.number ? `#${i.number}` : ''} · {i.issued_at ? fmtDay(i.issued_at) : ''}</T></View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}><T mono>{money(due)}</T><Pill text={`${days(i.issued_at)} days`} kind={days(i.issued_at) > 60 ? 'bad' : days(i.issued_at) > 30 ? 'warn' : 'sched'} /></View></Pressable>)}</View>
    {!rows.length ? <T s>Nobody owes you. Nice.</T> : null}
  </Screen>;
}
