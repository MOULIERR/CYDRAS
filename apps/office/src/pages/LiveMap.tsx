// Live map like the mockup: where each clocked-in tech is (last phone location), plus today's job addresses.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { PageH, StatusPill, initials, dayStart, today, addDays } from '../ui';

const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`; };

export function LiveMap() {
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null);
  const { data } = useLive(async () => {
    const open = check(await supabase.from('time_entries').select('member_id, clock_in').eq('company_id', c).is('clock_out', null).is('deleted_at', null)) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c).eq('active', true)) as any[];
    const since = new Date(Date.now() - 12 * 3600000).toISOString();
    const pings = check(await supabase.from('location_pings').select('member_id, at, lat, lng').eq('company_id', c).gte('at', since).order('at', { ascending: false }).limit(1000)) as any[];
    const jobs = check(await supabase.from('jobs').select('id, number, type, status, starts_at, customers(name), sites(address, lat, lng), job_assignments(member_id, deleted_at)').eq('company_id', c).gte('starts_at', dayStart(today()).toISOString()).lt('starts_at', dayStart(addDays(today(), 1)).toISOString()).is('deleted_at', null).order('starts_at')) as any[];
    const last: Record<string, any> = {}; for (const p of pings) if (!last[p.member_id]) last[p.member_id] = p;
    const crew = open.map((t) => {
      const p = people.find((x) => x.id === t.member_id);
      const mine = jobs.filter((j) => (j.job_assignments ?? []).some((a: any) => !a.deleted_at && a.member_id === t.member_id));
      const now = mine.find((j) => j.status === 'on_site') ?? mine.find((j) => j.status === 'on_the_way') ?? mine.find((j) => j.status === 'scheduled');
      return { id: t.member_id, name: p?.name ?? '', ping: last[t.member_id], job: now };
    });
    return { crew, jobs };
  }, ['location_pings', 'time_entries', 'jobs'], c, [c]);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: true }).setView([27.95, -82.46], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!data || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const j of data.jobs) if (j.sites?.lat != null && j.sites?.lng != null) {
      pts.push([j.sites.lat, j.sites.lng]);
      L.marker([j.sites.lat, j.sites.lng], { icon: L.divIcon({ className: '', html: '<div class="mapjob">⌂</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindPopup(`<b>${esc(j.customers?.name ?? '')}</b><br>${esc(j.type)}<br>${esc(j.sites.address)}`).addTo(layer.current);
    }
    for (const t of data.crew) if (t.ping) {
      pts.push([t.ping.lat, t.ping.lng]);
      L.marker([t.ping.lat, t.ping.lng], { icon: L.divIcon({ className: '', html: `<div class="maptech">${esc(initials(t.name))}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .bindPopup(`<b>${esc(t.name)}</b><br>${t.job ? esc(`${t.job.customers?.name ?? ''} · ${t.job.type}`) : 'No job right now'}<br><small>${ago(t.ping.at)}</small>`).addTo(layer.current);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
  }, [data]);

  return (
    <>
      <PageH eyebrow="Work" title="Live map" />
      <div className="cols"><div className="colA"><div className="card" style={{ padding: 0, overflow: 'hidden' }}><div ref={box} style={{ height: 'min(70vh, 560px)', width: '100%' }} aria-label="Map of techs and today's jobs" /></div></div>
        <div className="colB"><div className="card"><div className="cardh"><h3>Clocked in</h3><span className="s">{data?.crew.length ?? 0}</span></div>
          {data?.crew.map((t) => <div key={t.id} className="prow"><span className="av">{initials(t.name)}</span><div className="t"><b>{t.name}</b><br /><span className="s">{t.ping ? `Seen ${ago(t.ping.at)}` : 'No location yet (phone app sends it)'}</span>
            {t.job && <><br /><button className="lnk" onClick={() => nav(`/job/${t.job.id}`)}>{t.job.customers?.name} · {t.job.type}</button></>}</div>{t.job && <StatusPill s={t.job.status} />}</div>)}
          {data && !data.crew.length && <div className="empty">Nobody is clocked in.</div>}
          <span className="s">Location is only shared while a tech is clocked in on the phone app.</span></div></div></div>
    </>
  );
}
function esc(s: string) { return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!)); }
