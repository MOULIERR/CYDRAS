import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { useSession } from '../session';

export function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false); if (error) setErr(error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message);
  }
  return (
    <form className="card auth" onSubmit={go}>
      <h1>Cydras Office</h1>
      <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required /></label>
      <label>Password<input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" required /></label>
      {err && <div className="err">{err}</div>}
      <button className="pri" disabled={busy}>Sign in</button>
      <button type="button" onClick={async () => { if (!email) return setErr('Type your email first'); await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); setErr('Check your email for a link to make a new password.'); }}>Forgot password</button>
      <div className="muted">New shop? <Link to="/signup">Start a free trial</Link> · Have a code? <Link to="/join">Join your team</Link></div>
    </form>
  );
}

export function Signup() {
  const { session, reload } = useSession();
  const [f, setF] = useState({ company: '', name: '', email: '', pw: '', plan: 'team' });
  const [agree, setAgree] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (!agree) return setErr('Please agree to the Terms and Privacy Policy.');
    setBusy(true);
    try {
      if (!session) {
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.pw });
        if (error) throw error;
        if (!data.session) { setErr('Check your email, tap the link, then sign in to finish.'); return; }
      }
      const { error } = await supabase.rpc('create_company', { p_name: f.company.trim(), p_owner_name: f.name.trim(), p_plan: f.plan });
      if (error) throw error;
      await reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="card auth" onSubmit={go}>
      <h1>Start your free trial</h1>
      <div className="muted">14 days free. No card needed.</div>
      <label>Company name<input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} required /></label>
      <label>Your name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
      {!session && <><label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label>Password<input type="password" minLength={8} value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} required /></label></>}
      <label>Plan after the trial<select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
        <option value="solo">Solo · $49/mo · 1 user</option><option value="team">Team · $125/mo · up to 5</option><option value="pro">Pro · $249/mo · up to 10</option></select></label>
      <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to the Terms of Service and Privacy Policy</label>
      {err && <div className="err">{err}</div>}
      <button className="pri" disabled={busy}>Start free trial</button>
      {!session && <Link to="/">I already have an account</Link>}
    </form>
  );
}

export function Join() {
  const { session, reload } = useSession();
  const [f, setF] = useState({ code: '', email: '', pw: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (!session) { const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.pw }); if (error) throw error; if (!data.session) { setErr('Check your email, then sign in and type the code again.'); return; } }
      const { error } = await supabase.rpc('accept_invite', { p_code: f.code.trim() }); if (error) throw error;
      await reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="card auth" onSubmit={go}>
      <h1>Join your team</h1>
      <label>Invite code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required /></label>
      {!session && <><label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label>Make a password<input type="password" minLength={8} value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} required /></label></>}
      {err && <div className="err">{err}</div>}
      <button className="pri" disabled={busy}>Join</button>
      {session ? <><Link to="/signup">Start my own company instead</Link><button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></> : <Link to="/">Back to sign in</Link>}
    </form>
  );
}
