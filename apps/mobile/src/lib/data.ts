// Small read helpers over the phone's copy of the data.
import { useMemo } from 'react';
import { useRows } from './sync';
import { useSession, can } from './session';

export type Job = { id: string; number: number; customer_id: string; site_id: string | null; type: string; category: string | null; starts_at: string; ends_at: string; status: string; summary: string | null; status_times: Record<string, string>; hide_prices: boolean };

export function useMyJobs(from: Date, to: Date) {
  const { member } = useSession();
  const jobs = useRows<any>('jobs');
  const asg = useRows<any>('job_assignments');
  const customers = useRows<any>('customers');
  return useMemo(() => {
    const names = new Map(customers.map((c) => [c.id, c.name]));
    const mine = new Set(asg.filter((a) => a.member_id === member?.id && !a.deleted_at).map((a) => a.job_id));
    const all = can(member, 'allJobs');
    return (jobs as Job[])
      .filter((j) => (all || mine.has(j.id)) && new Date(j.starts_at) >= from && new Date(j.starts_at) < to && j.status !== 'canceled')
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((j) => ({ ...j, customer: names.get(j.customer_id) ?? 'Customer', mine: mine.has(j.id) }));
  }, [jobs, asg, customers, member, from.getTime(), to.getTime()]);
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const STATUS: Record<string, string> = { scheduled: 'Scheduled', on_the_way: 'On the way', on_site: 'On site', done: 'Done', no_show: 'No-show', canceled: 'Canceled' };
