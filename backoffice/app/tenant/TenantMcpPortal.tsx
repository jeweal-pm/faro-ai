'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { McpConnections, requestApi } from '../admin/AdminConsole';
import FaroAIApiCredentials from './FaroAIApiCredentials';

type TenantSession = { email: string; tenant: { id: string; name: string; status: string }; expires_in_seconds: number };

export default function TenantMcpPortal() {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadSession() {
    setLoading(true);
    try {
      const result = await requestApi<TenantSession>('/api/tenant', '/auth/session');
      setSession(result.success ? result.data ?? null : null);
    } catch { setError('FaroAI could not be reached.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadSession(); }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestApi<TenantSession>('/api/tenant', '/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      if (!result.success || !result.data) { setError(result.message ?? 'Sign in failed.'); return; }
      setSession(result.data); setPassword('');
    } catch { setError('Tenant sign-in is temporarily unavailable.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const result = await requestApi('/api/tenant', '/auth/logout', { method: 'POST', body: '{}' });
      if (!result.success) { setError(result.message ?? 'Sign out failed.'); return; }
      setSession(null); setNotice('You have signed out.');
    } catch { setError('Sign out failed.'); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="admin-loading"><LoaderCircle className="spin" /> Loading tenant workspace…</main>;
  if (!session) return <main className="login-shell">
    <div className="login-card">
      <div className="login-mark"><Sparkles size={20} /></div><p className="eyebrow">FAROAI TENANT</p>
      <h1>Sign in to your workspace</h1>
      <p className="login-intro">Manage MCP connections and application access for your tenant. Ask your platform administrator for an account.</p>
      <form className="login-form" onSubmit={login}>
        <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <a className="back-home" href="/">Back to AI discovery</a>
    </div>
  </main>;

  const tenant = { ...session.tenant, available_credits: 0, used_credits: 0 };
  return <main className="admin-main tenant-mcp-main">
    <header className="admin-topbar"><div><span className="crumb">FaroAI</span><span className="crumb-sep">/</span><span>Tenant workspace</span></div>
      <button className="secondary-button" type="button" onClick={() => void logout()} disabled={busy}><LogOut size={15} /> Sign out</button>
    </header>
    <div className="admin-content">
      <div className="page-heading"><div><p className="eyebrow">TENANT WORKSPACE</p><h1>{tenant.name}</h1><p>Configure the MCP endpoints and tool permissions used by this tenant.</p></div><span className="status-pill active"><ShieldCheck size={13} /> Signed in as {session.email}</span></div>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      <section className="panel"><div className="panel-title"><h2>Your MCP connections</h2></div>
        <McpConnections tenants={[tenant]} apiBase="/api/tenant" />
      </section>
      <FaroAIApiCredentials />
    </div>
  </main>;
}
