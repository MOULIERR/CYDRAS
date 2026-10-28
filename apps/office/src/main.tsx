import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession, isManager } from './session';
import { supabase } from './supabase';
import { Login, Signup, Join } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { Customers, Customer } from './pages/Customers';
import { Team } from './pages/Team';
import { Timesheets } from './pages/Timesheets';
import { Billing } from './pages/Billing';
import { Soon } from './pages/Soon';
import { Dispatch } from './pages/Dispatch';
import { Job } from './pages/Job';
import { Schedule } from './pages/Schedule';
import { PriceBook } from './pages/PriceBook';
import { Invoices } from './pages/Invoices';
import { Estimates } from './pages/Estimates';
import { Categories, Checklists } from './pages/Setup';
import { Crew, Person } from './pages/Crew';
import { ShopInventory, TechInventory } from './pages/Inventory';
import { Inbox } from './pages/Inbox';
import { Tasks } from './pages/Tasks';
import { NAV, type NavItem } from './nav';

function Shell() {
  const { session, member, loading } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (loading) return <main className="content s">Loading…</main>;
  if (!session) return (
    <div className="authwrap"><Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/join" element={<Join />} />
      <Route path="*" element={<Login />} />
    </Routes></div>
  );
  if (!member) return <div className="authwrap"><Routes><Route path="/signup" element={<Signup />} /><Route path="*" element={<Join />} /></Routes></div>;
  const mgr = isManager(member), owner = member.role === 'owner';
  const allowed = (i: NavItem) => (!i.owner || owner) && (!i.mgr || mgr);
  const to = (i: NavItem) => i.path ?? `/soon/${i.key}`;
  return (
    <div className="app">
      <nav className={`side${open ? ' open' : ''}`} aria-label="Main">
        <div className="row" style={{ margin: '0 8px 14px', gap: 10 }}>
          <img src="/icon.svg" alt="" style={{ width: 38, height: 38, margin: 0, borderRadius: 10, background: '#fff' }} />
          <div><div style={{ font: '700 25px/1 var(--display)', letterSpacing: '.02em' }}>CYDRAS</div><div className="eyebrow" style={{ fontSize: 10 }}>Office</div></div>
        </div>
        {NAV.map(([h, items]) => {
          const it = items.filter(allowed);
          if (!it.length) return null;
          return <div key={h} style={{ display: 'contents' }}>
            <p className="eyebrow navh">{h}</p>
            {it.map((i) => <NavLink key={i.key} to={to(i)} end={i.path === '/'} className="nav" style={{ textDecoration: 'none' }}><span>{i.label}</span>{!i.path && <span className="s" style={{ fontSize: 11 }}>soon</span>}</NavLink>)}
          </div>;
        })}
        <div className="who s">{member.name} · {member.role === 'owner' ? 'Owner' : member.role === 'supervisor' ? 'Supervisor' : member.role}<br />
          <button className="lnk" style={{ marginTop: 6 }} onClick={() => supabase.auth.signOut()}>Sign out</button></div>
      </nav>
      <div className="main">
        <header className="top">
          <button className="btn sm menubtn" aria-label="Open menu" onClick={() => setOpen(!open)}>☰ Menu</button>
          <label className="search"><span aria-hidden="true">🔎</span><input placeholder="Search customers, jobs, invoices" aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter') nav(`/customers?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`); }} /></label>
          {mgr && <Link className="btn pri" to="/jobs?new=1">+ New appointment</Link>}
          <Link className="btn" to="/tasks?new=1">+ Task</Link>
          <Link className="btn" to="/soon/allsettings" aria-label="Settings">⚙ Settings</Link>
          <span style={{ flex: 1 }} />
          <span className="rolesw">Signed in as <b style={{ color: 'var(--ink)' }}>{member.name}</b></span>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/dispatch" element={<Dispatch />} />
            <Route path="/job/:id" element={<Job />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/pricebook" element={<PriceBook />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/estimates" element={<Estimates />} />
            <Route path="/cats" element={<Categories />} />
            <Route path="/checklists" element={<Checklists />} />
            <Route path="/crew" element={<Crew />} />
            <Route path="/crew/:id" element={<Person />} />
            <Route path="/shopinv" element={<ShopInventory />} />
            <Route path="/techinv" element={<TechInventory />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customer/:id" element={<Customer />} />
            {mgr && <Route path="/timesheets" element={<Timesheets />} />}
            {mgr && <Route path="/team" element={<Team />} />}
            {owner && <Route path="/billing" element={<Billing />} />}
            <Route path="/soon/:key" element={<Soon />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 25 }} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><SessionProvider><BrowserRouter><Shell /></BrowserRouter></SessionProvider></StrictMode>,
);
