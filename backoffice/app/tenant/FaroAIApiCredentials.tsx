'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Copy, KeyRound, LoaderCircle, Plus, ShieldCheck, X } from 'lucide-react';
import { requestApi } from '../admin/AdminConsole';

type Credential = { id: string; client_id: string; label: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
type CreatedCredential = Credential & { client_secret: string };
const scopeOptions = [
  { value: 'chat:write', label: 'AI chat and discovery' },
  { value: 'feedback:write', label: 'Search feedback' },
  { value: 'knowledge:write', label: 'Knowledge ingestion' },
  { value: 'mcp:write', label: 'MCP operations' },
  { value: 'catalogue:write', label: 'Product catalogue sync' },
  { value: 'gis:product:write', label: 'Create products through GIS' },
  { value: 'gis:procurement:read', label: 'Read GIS purchase orders and inventory' },
  { value: 'gis:customers:read', label: 'Read customer birthdays and contact details through GIS' },
  { value: 'gis:procurement:write', label: 'Create or receive through GIS' },
  { value: 'document:import', label: 'Business-document import' },
  { value: 'document:procurement', label: 'Prepare a PO preview from an authorized document' },
];

export default function FaroAIApiCredentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState(['chat:write']);
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await requestApi<{ items: Credential[] }>('/api/tenant', '/app-credentials');
      if (!result.success) { setError(result.message ?? 'API credentials could not be loaded.'); return; }
      setCredentials(result.data?.items ?? []);
    } catch { setError('FaroAI could not be reached.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setCreated(null);
    try {
      const result = await requestApi<CreatedCredential>('/api/tenant', '/app-credentials', {
        method: 'POST', body: JSON.stringify({ label, scopes }),
      });
      if (!result.success || !result.data) { setError(result.message ?? 'The API credential could not be created.'); return; }
      setCreated(result.data); setLabel(''); await load();
    } catch { setError('The API credential could not be created.'); }
    finally { setBusy(false); }
  }

  async function revoke(credential: Credential) {
    if (!window.confirm(`Revoke “${credential.label}”? Its existing access tokens will stop working.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestApi('/api/tenant', `/app-credentials/${credential.id}`, { method: 'DELETE', body: '{}' });
      if (!result.success) { setError(result.message ?? 'The API credential could not be revoked.'); return; }
      setNotice(`Credential “${credential.label}” has been revoked.`); await load();
    } catch { setError('The API credential could not be revoked.'); }
    finally { setBusy(false); }
  }

  async function saveScopes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || editScopes.length === 0) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestApi<{ revoked_access_tokens?: number }>('/api/tenant', `/app-credentials/${editing.id}`, {
        method: 'PATCH', body: JSON.stringify({ scopes: editScopes }),
      });
      if (!result.success) { setError(result.message ?? 'The API credential permissions could not be updated.'); return; }
      setNotice(`Permissions updated for “${editing.label}”. Re-save the existing FaroAI connection in GIS to clear its cached token and use the new permissions.`);
      setEditing(null); setEditScopes([]); await load();
    } catch { setError('The API credential permissions could not be updated.'); }
    finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Copied. Keep this value in your server-side secret store.'); }
    catch { setError('Clipboard access is unavailable; select and copy the value manually.'); }
  }

  return <section className="panel tenant-api-credentials" aria-labelledby="faroai-api-access-title">
    <div className="panel-title"><h2 id="faroai-api-access-title"><KeyRound size={15} /> FaroAI API access</h2><span className="status-pill active"><ShieldCheck size={12} /> Tenant-scoped</span></div>
    <p className="form-footnote">Use these credentials from your application server. The secret is shown only once and must never be embedded in browser code.</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {created && <div className="tenant-api-secret" role="status"><div><b>Copy this secret now</b><p>It will not be shown again. Store it in your backend secret manager.</p></div>
      <label>API Key (Client ID)<div className="secret-copy-row"><code>{created.client_id}</code><button type="button" className="soft-button" onClick={() => void copy(created.client_id)}><Copy size={13} /> Copy</button></div></label>
      <label>Secret Key (Client Secret)<div className="secret-copy-row"><code>{created.client_secret}</code><button type="button" className="soft-button" onClick={() => void copy(created.client_secret)}><Copy size={13} /> Copy</button></div></label>
      <button type="button" className="secondary-button" onClick={() => setCreated(null)}>I saved it <X size={13} /></button>
    </div>}
    <form className="tenant-api-create" onSubmit={create}>
      <label>Application label<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={100} placeholder="Customer storefront backend" required /></label>
      <fieldset><legend>Permissions</legend>{scopeOptions.map((option) => <label key={option.value}><input type="checkbox" checked={scopes.includes(option.value)} onChange={() => toggleScope(option.value)} />{option.label}</label>)}</fieldset>
      <button type="submit" className="primary-button compact" disabled={busy || scopes.length === 0}>{busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Create API credentials</button>
    </form>
    <div className="tenant-api-integration"><b>Token endpoint</b><code>POST /v1/oauth/token</code><span>From your application server, send a form-encoded request with <code>grant_type=client_credentials</code>, <code>client_id</code>, and <code>client_secret</code>. Use the returned bearer token for FaroAI API requests; it expires after 1 hour.</span></div>
    <div className="tenant-api-credential-list"><h3>Applications</h3>{loading ? <p className="form-footnote">Loading credentials…</p> : credentials.length === 0 ? <p className="form-footnote">No application credentials have been created.</p> : credentials.map((credential) => <article className="tenant-api-credential-row" key={credential.id}>
      <div><b>{credential.label}</b><code>{credential.client_id}</code><small>{credential.scopes.join(', ')} · {credential.last_used_at ? `Last used ${new Date(credential.last_used_at).toLocaleString()}` : 'Not used yet'}</small></div>
      <span className={`status-pill ${credential.revoked_at ? 'suspended' : 'active'}`}>{credential.revoked_at ? 'revoked' : 'active'}</span>
      {!credential.revoked_at && <button type="button" className="soft-button" onClick={() => { setEditing(credential); setEditScopes([...credential.scopes]); setError(''); setNotice(''); }} disabled={busy}>Edit permissions</button>}
      {!credential.revoked_at && <button type="button" className="soft-button" onClick={() => void revoke(credential)} disabled={busy}>Revoke</button>}
      {editing?.id === credential.id && <form className="tenant-api-create" onSubmit={(event) => void saveScopes(event)}>
        <fieldset><legend>Permissions for {credential.label}</legend>{scopeOptions.map((option) => <label key={option.value}><input type="checkbox" checked={editScopes.includes(option.value)} onChange={() => setEditScopes((current) => current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])} />{option.label}</label>)}</fieldset>
        <p className="form-footnote">Saving permissions revokes this app’s current FaroAI access tokens. Then re-save the existing FaroAI connection in GIS to clear its cached token and request a fresh one. Keep the client ID unchanged and leave the secret field blank; the stored secret is preserved.</p>
        <button type="submit" className="primary-button compact" disabled={busy || editScopes.length === 0}>{busy ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />} Save permissions</button>
        <button type="button" className="soft-button" onClick={() => { setEditing(null); setEditScopes([]); }} disabled={busy}>Cancel</button>
      </form>}
    </article>)}</div>
  </section>;
}
