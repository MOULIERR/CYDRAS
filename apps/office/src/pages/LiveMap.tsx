// Live map like the mockup: where each clocked-in tech is (last phone location), today's jobs,
// counts, live updates, location sharing settings, and a full-screen TV mode for the shop.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { PageH, initials, dayStart, dayLabel, today, addDays, hm, money0, useCompany } from '../ui';

const COL = { route: '#f26b1d', site: '#2a7de1', free: '#1f8a4c', next: '#5f6670', need: '#c92a2a', done: '#8a919b' };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`; };
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

type Crew = { id: string; name: string; ping: any; job: any; state: 'route' | 'site' | 'free' };
type Data = { crew: Crew[]; jobs: any[]; feed: { at: string; t: string; k: keyof typeof COL }[]; collected: number; counts: { route: number; site: number; need: number } };

function useLiveData(c: string) {
  const r = useLive<Data>(async () => {
    const start = dayStart(today()).toISOString(), end = dayStart(addDays(today(), 1)).toISOString();
    const open = check(await supabase.from('time_entries').select('member_id, clock_in').eq('company_id', c).is('clock_out', null).is('deleted_at', null)) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c).eq('active', true)) as any[];
    const pings = check(await supabase.from('location_pings').select('member_id, at, lat, lng').eq('company_id', c).gte('at', new Date(Date.now() - 12 * 3600000).toISOString()).order('at', { ascending: false }).limit(1000)) as any[];
    const jobs = check(await supabase.from('jobs').select('id, number, type, status, status_times, starts_at, customers(name), sites(address, lat, lng), job_assignments(member_id, deleted_at)').eq('company_id', c).gte('starts_at', start).lt('starts_at', end).is('deleted_at', null).order('starts_at')) as any[];
    let collected = 0;
    try { collected = (check(await supabase.from('payments').select('amount, refunded_amount, voided_at, status').eq('company_id', c).gte('taken_at', start).lt('taken_at', end)) as any[]).filter((p) => p.status === 'succeeded' && !p.voided_at).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount), 0); } catch { /* techs can't see payments */ }
    const name = (id: string) => people.find((p) => p.id === id)?.name ?? '';
    const techs = (j: any) => (j.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => a.member_id);
    const last: Record<string, any> = {}; for (const p of pings) if (!last[p.member_id]) last[p.member_id] = p;
    const crew: Crew[] = open.map((t) => {
      const mine = jobs.filter((j) => techs(j).includes(t.member_id));
      const now = mine.find((j) => j.status === 'on_site') ?? mine.find((j) => j.status === 'on_the_way');
      const next = now ?? mine.find((j) => j.status === 'scheduled');
      return { id: t.member_id, name: name(t.member_id), ping: last[t.member_id], job: next, state: now?.status === 'on_site' ? 'site' : now ? 'route' : 'free' };
    });
    const feed: Data['feed'] = [];
    for (const j of jobs) {
      const who = techs(j).map((id: string) => name(id).split(' ')[0]).join(' & ') || 'Someone';
      const st = j.status_times ?? {}, cn = j.customers?.name ?? '';
      if (st.on_the_way) feed.push({ at: st.on_the_way, t: `${who} is on the way to ${cn}`, k: 'route' });
      if (st.on_site) feed.push({ at: st.on_site, t: `${who} started the job at ${cn}`, k: 'site' });
      if (st.done) feed.push({ at: st.done, t: `${who} finished ${cn}`, k: 'free' });
    }
    for (const t of open) feed.push({ at: t.clock_in, t: `${name(t.member_id).split(' ')[0]} clocked in`, k: 'next' });
    feed.sort((a, b) => b.at.localeCompare(a.at));
    const live = jobs.filter((j) => !['done', 'canceled', 'no_show'].includes(j.status));
    return { crew, jobs, feed, collected, counts: { route: jobs.filter((j) => j.status === 'on_the_way').length, site: jobs.filter((j) => j.status === 'on_site').length, need: live.filter((j) => !techs(j).length).length } };
  }, ['location_pings', 'time_entries', 'jobs'], c, [c]);
  // Location pings also come in every few seconds; refresh on a timer too.
  useEffect(() => { const iv = setInterval(() => r.reload(), 30000); return () => clearInterval(iv); }, [r.reload]); // eslint-disable-line
  return r;
}

function MapView({ data, dark = false, height }: { data: Data | null; dark?: boolean; height: string }) {
  const box = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null), fitted = useRef(false);
  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: true }).setView([27.95, -82.46], 10);
    L.tileLayer(dark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: dark ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap contributors' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const ro = new ResizeObserver(() => map.current?.invalidateSize()); ro.observe(box.current);
    return () => { ro.disconnect(); map.current?.remove(); map.current = null; fitted.current = false; };
  }, [dark]);
  useEffect(() => {
    if (!data || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const j of data.jobs) if (j.sites?.lat != null && j.sites?.lng != null && !['done', 'canceled', 'no_show'].includes(j.status)) {
      const need = !(j.job_assignments ?? []).some((a: any) => !a.deleted_at);
      const col = need ? COL.need : j.status === 'on_site' ? COL.site : COL.next;
      pts.push([j.sites.lat, j.sites.lng]);
      L.marker([j.sites.lat, j.sites.lng], { icon: L.divIcon({ className: '', html: `<div class="mapjob" style="border-color:${col};color:${col}">${need ? '!' : '⌂'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindPopup(`<b>${esc(j.customers?.name ?? '')}</b><br>${hm(j.starts_at)} · ${esc(j.type)}${need ? '<br><b style="color:#c92a2a">Needs a tech</b>' : ''}<br>${esc(j.sites.address)}`).addTo(layer.current);
    }
    for (const t of data.crew) if (t.ping) {
      pts.push([t.ping.lat, t.ping.lng]);
      L.marker([t.ping.lat, t.ping.lng], { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: `<div class="maptech" style="background:${COL[t.state]}">${esc(initials(t.name))}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .bindPopup(`<b>${esc(t.name)}</b><br>${t.job ? esc(`${t.state === 'free' ? 'Next: ' : ''}${t.job.customers?.name ?? ''} · ${t.job.type}`) : 'Free'}<br><small>${ago(t.ping.at)}</small>`).addTo(layer.current);
    }
    if (pts.length && !fitted.current) { map.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 }); fitted.current = true; }
  }, [data]);
  return <div ref={box} style={{ height, width: '100%', background: dark ? '#1b2028' : undefined }} aria-label="Map of techs and today's jobs" />;
}

function CrewList({ data, tv = false, onJob }: { data: Data; tv?: boolean; onJob?: (id: string) => void }) {
  if (!data.crew.length) return <div className={tv ? '' : 'empty'} style={tv ? { opacity: 0.6, padding: '8px 0' } : undefined}>Nobody is clocked in.</div>;
  return <>{data.crew.map((t) => <div key={t.id} className="lm-row">
    <span className="lm-av" style={{ background: COL[t.state] }}>{initials(t.name)}</span>
    <div className="lm-t"><b>{t.name}</b><br /><span className="lm-s">{t.state === 'route' ? 'On the way' : t.state === 'site' ? 'On site' : 'Free'}{t.job ? ` · ${t.state === 'free' ? 'next ' : ''}` : ''}
      {t.job && (onJob ? <button className="lnk" onClick={() => onJob(t.job.id)}>{t.job.customers?.name}</button> : t.job.customers?.name)}</span></div>
    <span className="lm-p">{t.ping ? ago(t.ping.at) : 'no location yet'}</span></div>)}</>;
}
const Feed = ({ data, n }: { data: Data; n: number }) => <>{data.feed.slice(0, n).map((f, i) => <div key={i} className="lm-f"><span className="lm-fd" style={{ background: COL[f.k] }} /><span>{f.t}</span><span className="lm-s" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{ago(f.at)}</span></div>)}{!data.feed.length && <span className="lm-s">Nothing yet today.</span>}</>;

function TV({ data, company, money, onExit }: { data: Data; company: any; money: boolean; onExit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15000);
    try { ref.current?.requestFullscreen?.().catch(() => {}); } catch { /* not allowed */ }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
    const fs = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('keydown', k);
    const t = setTimeout(() => document.addEventListener('fullscreenchange', fs), 500);
    return () => { clearInterval(iv); clearTimeout(t); document.removeEventListener('keydown', k); document.removeEventListener('fullscreenchange', fs); try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ } };
  }, [onExit]);
  const done = data.jobs.filter((j) => j.status === 'done').length;
  const stat = (v: React.ReactNode, l: string, col?: string) => <span style={{ textAlign: 'center' }}><b style={{ display: 'block', font: '700 34px var(--display)', color: col }}>{v}</b><span className="tvl">{l}</span></span>;
  const up = data.jobs.filter((j) => j.status === 'scheduled').slice(0, 6);
  return (
    <div ref={ref} id="tv" role="dialog" aria-label="TV mode" className="tv">
      <div className="tvtop">
        <img src="/icon.svg" alt="" style={{ width: 40, height: 40, borderRadius: 10, background: '#fff' }} />
        <b style={{ font: '700 26px var(--display)', letterSpacing: '.03em' }}>{(company?.name ?? '').toUpperCase()}</b><span className="lm-live" style={{ fontSize: 14 }}>LIVE</span><span style={{ flex: 1 }} />
        {stat(data.counts.route, 'On the way', '#f26b1d')}{stat(data.counts.site, 'On site', '#4c9cf0')}{stat(data.counts.need, 'Need a tech', '#f06a6a')}{stat(`${done}/${data.jobs.length}`, 'Jobs done')}
        {money && stat(money0(data.collected), 'Collected', '#4cc27c')}
        <span style={{ textAlign: 'right' }}><b style={{ display: 'block', font: '700 34px var(--display)' }}>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</b><span style={{ fontSize: 12, opacity: 0.7 }}>{dayLabel(today(), true)}</span></span>
        <button onClick={onExit} aria-label="Exit TV mode" className="tvx">Exit ✕</button>
      </div>
      <div className="tvmid"><div style={{ minHeight: 0 }}><MapView data={data} dark height="100%" /></div>
        <div className="tvside"><div className="tvh">Crew</div><CrewList data={data} tv />
          <div className="tvh" style={{ marginTop: 14 }}>Coming up</div>
          {up.map((j) => { const need = !(j.job_assignments ?? []).some((a: any) => !a.deleted_at); return <div key={j.id} className="lm-f"><span className="lm-fd" style={{ background: need ? COL.need : COL.next }} /><b>{hm(j.starts_at)}</b><span>{j.customers?.name}</span><span className="lm-s" style={{ marginLeft: 'auto' }}>{need ? <b style={{ color: '#f06a6a', opacity: 1 }}>Needs a tech</b> : j.type}</span></div>; })}
          {!up.length && <span className="lm-s">No more jobs today.</span>}</div></div>
      <div className="tvbot"><b style={{ fontSize: 12, letterSpacing: '.1em', opacity: 0.6, flex: 'none' }}>LATEST</b><div style={{ display: 'flex', gap: 28, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}><Feed data={data} n={3} /></div></div>
    </div>
  );
}

export function LiveMap() {
  const { member } = useSession();
  const c = member!.company_id, owner = member!.role === 'owner';
  const nav = useNavigate();
  const company = useCompany(c);
  const { data } = useLiveData(c);
  const [tv, setTv] = useState(false);
  const exitTv = useCallback(() => setTv(false), []);
  const [err, setErr] = useState('');
  const cfg = { techsSee: false, tvMoney: false, ...(company?.settings?.live ?? {}) };
  const setCfg = async (k: string, v: boolean) => { setErr(''); try { check(await supabase.from('companies').update({ settings: { ...(company?.settings ?? {}), live: { ...cfg, [k]: v } } }).eq('id', c)); } catch (e) { setErr((e as Error).message); } };
  const jobsDone = data?.jobs.filter((j) => j.status === 'done').length ?? 0;
  return (
    <>
      <PageH eyebrow="Work" title="Live map" right={<div className="row"><span className="lm-live">LIVE</span><span className="s">Updates on its own</span><button className="btn dark" onClick={() => setTv(true)} disabled={!data}>📺 TV mode</button></div>} />
      <div className="grid g4">
        <div className="card kpi"><span className="eyebrow">On the way</span><b style={{ color: COL.route }}>{data?.counts.route ?? '—'}</b></div>
        <div className="card kpi"><span className="eyebrow">On site</span><b style={{ color: COL.site }}>{data?.counts.site ?? '—'}</b></div>
        <div className="card kpi"><span className="eyebrow">Need a tech</span><b style={{ color: data?.counts.need ? COL.need : undefined }}>{data?.counts.need ?? '—'}</b></div>
        <div className="card kpi"><span className="eyebrow">Jobs today</span><b>{data?.jobs.length ?? '—'}</b><span className="s">{jobsDone} done</span></div>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="cols"><div className="colA">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>{!tv && <MapView data={data} height="min(68vh, 640px)" />}</div>
        <div className="row wrap s" style={{ fontSize: 13.5, gap: 14 }}>{([[COL.route, 'On the way'], [COL.site, 'On site'], [COL.free, 'Free'], [COL.next, 'Next stop'], [COL.need, 'Needs a tech']] as const).map(([col, l]) => <span key={l} className="row" style={{ gap: 6 }}><span className="dot" style={{ background: col }} />{l}</span>)}</div>
      </div><div className="colB">
        <div className="card"><h3>Crew right now</h3>{data ? <CrewList data={data} onJob={(id) => nav(`/job/${id}`)} /> : <span className="s">Loading…</span>}</div>
        <div className="card"><h3>Live updates</h3>{data ? <Feed data={data} n={8} /> : <span className="s">Loading…</span>}</div>
        <div className="card"><h3>Location sharing</h3>
          <label className="prow" style={{ flexWrap: 'nowrap' }}><span className="t" style={{ flex: 1 }}><b>Only while clocked in</b><br /><span className="s">Phones share location during work hours only. Never at home or on days off. Always on.</span></span><input type="checkbox" className="sw" checked disabled aria-label="Only while clocked in" /></label>
          {([['techsSee', 'Techs can see each other', 'Off: only the owner and supervisors see the map. Works once the phone app is updated.'], ['tvMoney', 'Show money on the TV', "Off: the TV shows jobs and crew, never dollars."]] as const).map(([k, t, d]) =>
            <label key={k} className="prow" style={{ flexWrap: 'nowrap' }}><span className="t" style={{ flex: 1 }}><b>{t}</b><br /><span className="s">{d}</span></span><input type="checkbox" className="sw" disabled={!owner} checked={!!(cfg as any)[k]} onChange={(e) => setCfg(k, e.target.checked)} aria-label={t} /></label>)}
          <span className="s">Each tech sees a notice on their phone that the office can see their location while they're working.</span></div>
      </div></div>
      {tv && data && <TV data={data} company={company} money={!!cfg.tvMoney && owner} onExit={exitTv} />}
    </>
  );
}

