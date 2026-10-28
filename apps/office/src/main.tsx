import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession, isManager } from './session';
import { supabase } from './supabase';
import { Login, Signup, Join } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { Customers } from './pages/Customers';
import { Team } from './pages/Team';
import { Timesheets } from './pages/Timesheets';
import { Billing } from './pages/Billing';

function Shell() {
  const { session, member, loading } = useSession();
  if (loading) return <main className="muted">Loading…</main>;
  if (!session) return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/join" element={<Join />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
  if (!member) return <Routes><Route path="/signup" element={<Signup />} /><Route path="*" element={<Join />} /></Routes>;
  const mgr = isManager(member);
  return (
    <div className="app">
      <nav className="side">
        <div className="brand">CYDRAS</div>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/jobs">Jobs & dispatch</NavLink>
        <NavLink to="/customers">Customers</NavLink>
        {mgr && <NavLink to="/timesheets">Timesheets</NavLink>}
        {mgr && <NavLink to="/team">Team</NavLink>}
        {member.role === 'owner' && <NavLink to="/billing">Billing & bank</NavLink>}
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ padding: '0 12px', fontSize: 13 }}>{member.name} · {member.role}</span>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/customers" element={<Customers />} />
          {mgr && <Route path="/timesheets" element={<Timesheets />} />}
          {mgr && <Route path="/team" element={<Team />} />}
          {member.role === 'owner' && <Route path="/billing" element={<Billing />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><SessionProvider><BrowserRouter><Shell /></BrowserRouter></SessionProvider></StrictMode>,
);
