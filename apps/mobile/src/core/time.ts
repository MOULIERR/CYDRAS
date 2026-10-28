// Time clock math (hours, breaks, overtime) shared by the phone and office.
export type TimeEntry = { clock_in: string; clock_out: string | null; break_minutes: number; on_break_since?: string | null };

export function workedMinutes(e: TimeEntry, now = new Date()): number {
  const end = e.clock_out ? new Date(e.clock_out) : now;
  const brk = e.break_minutes + (e.on_break_since && !e.clock_out ? Math.max(0, (now.getTime() - new Date(e.on_break_since).getTime()) / 60000) : 0);
  return Math.max(0, Math.round((end.getTime() - new Date(e.clock_in).getTime()) / 60000 - brk));
}

export function weekPay(minutes: number, rate: number, otAfterHours = 40, otMultiplier = 1.5) {
  const reg = Math.min(minutes, otAfterHours * 60), ot = Math.max(0, minutes - otAfterHours * 60);
  return { regMinutes: reg, otMinutes: ot, pay: Math.round(((reg / 60) * rate + (ot / 60) * rate * otMultiplier) * 100) / 100 };
}

export const hm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

/** Distance in miles between two GPS points. */
export function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Drive time from GPS pings: minutes spent moving faster than walking speed. */
export function driveMinutes(pings: { at: string; speed_mps?: number | null; lat: number; lng: number }[]): number {
  let ms = 0;
  for (let i = 1; i < pings.length; i++) {
    const a = pings[i - 1], b = pings[i];
    const dt = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (dt <= 0 || dt > 15 * 60000) continue;
    const mph = (miles(a, b) / (dt / 3600000));
    if ((b.speed_mps ?? 0) > 3 || mph > 7) ms += dt;
  }
  return Math.round(ms / 60000);
}
