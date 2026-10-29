'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Activity, Boxes, BrainCircuit, Building2, Check, ChevronRight, CircleDollarSign, Database, KeyRound, LoaderCircle, LogOut, Plus, Settings2, ShieldCheck, Sparkles, Workflow } from 'lucide-react';

type ApiResult<T> = { success: boolean; data?: T; error?: string; message?: string };
type Tenant = { id: string; name: string; status: string; available_credits: number; used_credits: number };
type Provider = { id: string; provider: string; name: string; endpoint_url: string; enabled: boolean; secret_hint: string | null; max_input_usd_per_million_tokens: number; max_output_usd_per_million_tokens: number; max_image_usd_per_image: number; discovered_model_count: number; eligible_model_count: number; models_synced_at: string | null; jev_eligible: boolean };
type Job = { id: string; status: string; total_documents: number; completed_documents: number; collection_name: string; embedding_model: string; job_kind?: string; error_code: string | null };
type AuditEvent = { id: string; actor_email: string | null; action: string; resource_type: string; created_at: string; tenant_id: string | null };
type McpIntegration = 'gis' | 'gms' | 'erp' | 'custom';
type McpConnection = {
  id: string; integration_key: McpIntegration; display_name: string; endpoint_url: string; auth_method: 'bearer' | 'x-api-key'; enabled: boolean;
  connection_status: 'untested' | 'connected' | 'error'; discovered_tools: string[]; allowed_tools: string[];
  secret_hint: string | null; last_checked_at: string | null; last_error_code: string | null;
};
export type Section = 'overview' | 'tenants' | 'providers' | 'routing' | 'knowledge' | 'mcp' | 'learning' | 'audit' | 'settings';

async function adminApi<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof document !== 'undefined') {
    const csrf = document.cookie.split('; ').find((part) => part.startsWith('__Host-faroai_admin_csrf=') || part.startsWith('faroai_admin_csrf='))?.split('=').slice(1).join('=');
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  }
  const response = await fetch(`/api/admin${path}`, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' });
  return await response.json() as ApiResult<T>;
}

export default function AdminConsole({ section }: { section: Section }) {
  const [identity, setIdentity] = useState<{ email: string } | null>(null);
  const [authConfig, setAuthConfig] = useState<{ oidc_enabled: boolean; local_enabled: boolean; oidc_label: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [routingTenantId, setRoutingTenantId] = useState('');
  const [eligibleModelCount, setEligibleModelCount] = useState(0);
  const [maxEstimatedRequestCost, setMaxEstimatedRequestCost] = useState('');
  const [maxInputTokens, setMaxInputTokens] = useState('8192');
  const [maxImagesPerRequest, setMaxImagesPerRequest] = useState('0');
  const [routingLoading, setRoutingLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [providerDraft, setProviderDraft] = useState({ provider: 'openrouter', name: '', endpoint_url: 'https://openrouter.ai/api/v1', secret: '', max_input_usd_per_million_tokens: '', max_output_usd_per_million_tokens: '', max_image_usd_per_image: '0' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const config = await adminApi<{ oidc_enabled: boolean; local_enabled: boolean; oidc_label: string | null }>('/auth/config');
      setAuthConfig(config.data ?? null);
      const session = await adminApi<{ email: string }>('/auth/session');
      if (!session.success) { setIdentity(null); setLoading(false); return; }
      setIdentity(session.data ?? null);
      const [tenantData, providerData, auditData] = await Promise.all([
        adminApi<{ items: Tenant[] }>('/tenants?limit=50'),
        adminApi<{ items: Provider[] }>('/providers'),
        adminApi<{ items: AuditEvent[] }>('/audit-events?limit=12'),
      ]);
      setTenants(tenantData.data?.items ?? []);
      setRoutingTenantId((current) => current || tenantData.data?.items?.[0]?.id || '');
      setProviders(providerData.data?.items ?? []);
      setAudit(auditData.data?.items ?? []);
    } catch { setError('FaroAI could not be reached. Check that the API and database are running.'); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setError(''); setNotice(''); }, [section]);
  useEffect(() => {
    if (section !== 'knowledge' || !tenants[0]) return;
    void adminApi<{ items: Job[] }>(`/tenants/${tenants[0].id}/embedding/jobs?limit=30`).then((result) => setJobs(result.data?.items ?? [])).catch(() => setJobs([]));
  }, [section, tenants]);
  useEffect(() => {
    if (section !== 'routing' || !routingTenantId) return;
    let active = true;
    setRoutingLoading(true);
    setError('');
    void adminApi<{ eligible_model_count: number; spending_policy: { max_estimated_cost_per_request_usd: number | null; max_input_tokens: number; max_images_per_request: number } }>(`/tenants/${routingTenantId}/model-candidates`)
      .then((result) => {
        if (!active) return;
        setEligibleModelCount(result.data?.eligible_model_count ?? 0);
        setMaxEstimatedRequestCost(result.data?.spending_policy.max_estimated_cost_per_request_usd?.toString() ?? '');
        setMaxInputTokens(String(result.data?.spending_policy.max_input_tokens ?? 8192));
        setMaxImagesPerRequest(String(result.data?.spending_policy.max_images_per_request ?? 0));
        if (!result.success) setError(result.message ?? 'Model candidates could not be loaded.');
      })
      .catch(() => { if (active) setError('Model candidates could not be loaded.'); })
      .finally(() => { if (active) setRoutingLoading(false); });
    return () => { active = false; };
  }, [section, routingTenantId]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get('email') ?? '').trim();
    const submittedPassword = String(formData.get('password') ?? '');
    if (!submittedEmail || !submittedPassword) {
      setSaving(false); setError('Enter your email and password.'); return;
    }
    const result = await adminApi<{ email: string }>('/auth/local/login', { method: 'POST', body: JSON.stringify({ email: submittedEmail, password: submittedPassword }) });
    setSaving(false);
    if (!result.success) { setError(result.message ?? 'Sign in failed.'); return; }
    setPassword(''); await load();
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const result = await adminApi<Tenant>('/tenants', { method: 'POST', body: JSON.stringify({ name: tenantName }) });
    setSaving(false);
    if (!result.success) { setError(result.message ?? 'Tenant could not be created.'); return; }
    setTenantName(''); await load();
  }

  async function grantCredits(event: FormEvent<HTMLFormElement>, tenantId: string) {
    event.preventDefault(); setSaving(true);
    const amount = Number(creditAmounts[tenantId]);
    const result = await adminApi(`/tenants/${tenantId}/credits`, { method: 'POST', body: JSON.stringify({ amount, entry_type: amount > 0 ? 'grant' : 'adjustment', reason: 'Platform admin credit adjustment' }) });
    setSaving(false);
    if (!result.success) { setError(result.message ?? 'Credits could not be adjusted.'); return; }
    setCreditAmounts({ ...creditAmounts, [tenantId]: '' }); await load();
  }

  async function addProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const result = await adminApi<{ id: string }>('/providers', { method: 'POST', body: JSON.stringify({
      ...providerDraft,
      max_input_usd_per_million_tokens: Number(providerDraft.max_input_usd_per_million_tokens),
      max_output_usd_per_million_tokens: Number(providerDraft.max_output_usd_per_million_tokens),
      max_image_usd_per_image: Number(providerDraft.max_image_usd_per_image),
      enabled: true,
    }) });
    if (!result.success || !result.data?.id) { setSaving(false); setError(result.message ?? 'Provider could not be saved.'); return; }
    const discovery = await adminApi<{ count: number; eligible_count: number }>(`/providers/${result.data.id}/models/discover`, { method: 'POST', body: '{}' });
    setSaving(false);
    setProviderDraft({ ...providerDraft, name: '', secret: '' });
    await load();
    if (discovery.success) setNotice(`Provider saved. ${discovery.data?.eligible_count ?? 0} models currently fit this connection's price limits.`);
    else setError(`Provider saved, but its model catalog could not be synced: ${discovery.message ?? 'check the connection and try again.'}`);
  }

  async function saveModelCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestCost = maxEstimatedRequestCost.trim() ? Number(maxEstimatedRequestCost) : null;
    const inputTokenLimit = Number(maxInputTokens);
    const imageLimit = Number(maxImagesPerRequest);
    if ((requestCost !== null && (!Number.isFinite(requestCost) || requestCost < 0 || requestCost > 100))
        || !Number.isInteger(inputTokenLimit) || inputTokenLimit < 128 || inputTokenLimit > 128000
        || !Number.isInteger(imageLimit) || imageLimit < 0 || imageLimit > 16) {
      setError('Enter a non-negative cost ceiling up to $100, an input budget from 128 to 128,000 tokens, and an image limit from 0 to 16.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    const result = await adminApi(`/tenants/${routingTenantId}/model-candidates`, {
      method: 'PUT', body: JSON.stringify({
        max_estimated_cost_per_request_usd: requestCost, max_input_tokens: inputTokenLimit,
        max_images_per_request: imageLimit,
      }),
    });
    setSaving(false);
    if (!result.success) { setError(result.message ?? 'Model routing policy could not be saved.'); return; }
    setNotice('Routing policy saved. Jev selects from models that fit each provider connectionâ€™s price limits.');
  }

  async function logout() {
    await adminApi('/auth/logout', { method: 'POST', body: '{}' });
    setIdentity(null);
  }

  if (loading) return <main className="admin-loading"><LoaderCircle className="spin" /> Loading FaroAI platformâ€¦</main>;
  if (!identity) return <main className="login-shell">
    <div className="login-card"><div className="login-mark"><Sparkles size={20} /></div><p className="eyebrow">FAROAI PLATFORM</p><h1>Welcome back</h1><p className="login-intro">Sign in to manage tenants, model access, and knowledge operations.</p>
      {authConfig?.oidc_enabled && <a className="oidc-button" href="/api/admin/auth/oidc/start"><ShieldCheck size={17} /> Continue with {authConfig.oidc_label ?? 'single sign-on'}</a>}
      {authConfig?.oidc_enabled && authConfig.local_enabled && <div className="login-divider"><span>or use break-glass login</span></div>}
      {authConfig?.local_enabled && <form className="login-form" onSubmit={login}>
        <label>Email address<input name="email" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input name="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="primary-button" disabled={saving}>{saving ? 'Signing inâ€¦' : 'Sign in'}</button>
      </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!authConfig?.oidc_enabled && !authConfig?.local_enabled && <p className="form-error">Backoffice login is disabled by deployment configuration.</p>}
      <a className="back-home" href="/">Back to AI discovery</a>
    </div>
  </main>;

  const nav: Array<{ id: Section; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'tenants', label: 'Tenants & credits', icon: Building2 },
    { id: 'providers', label: 'AI providers', icon: BrainCircuit },
    { id: 'routing', label: 'Jev model routing', icon: Workflow },
    { id: 'knowledge', label: 'Knowledge & jobs', icon: Database },
    { id: 'mcp', label: 'MCP connections', icon: Boxes },
    { id: 'learning', label: 'Learning & training', icon: Sparkles },
    { id: 'audit', label: 'Audit trail', icon: ShieldCheck },
    { id: 'settings', label: 'Deployment', icon: Settings2 },
  ];

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <a href="/" className="admin-brand"><span className="brand-glyph"><Sparkles size={16} /></span><span>faro<span className="brand-ai">ai</span><small>PLATFORM</small></span></a>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{nav.map((item) => { const Icon = item.icon; const href = item.id === 'overview' ? '/admin' : `/admin/${item.id}`; return <Link key={item.id} href={href} aria-current={section === item.id ? 'page' : undefined} className={`nav-item ${section === item.id ? 'active' : ''}`}><Icon size={17} /><span>{item.label}</span>{section === item.id && <ChevronRight size={14} className="nav-chevron" />}</Link>; })}</nav>
      <div className="sidebar-bottom"><div className="admin-user"><span className="avatar">{identity.email[0]?.toUpperCase()}</span><span className="user-label"><b>{identity.email}</b><small>Platform administrator</small></span></div><button className="logout-button" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><span className="crumb">FaroAI</span><span className="crumb-sep">/</span><span>{nav.find((item) => item.id === section)?.label}</span></div><a href="/" className="discovery-link"><Sparkles size={15} /> Open AI discovery</a></header>
      <div className="admin-content">
        {error && <p className="admin-alert" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {section === 'overview' && <>
          <div className="page-heading"><div><p className="eyebrow">PLATFORM CONTROL</p><h1>Good to see you</h1><p>Hereâ€™s the current view of FaroAI operations.</p></div><span className="live-pill"><i /> Control plane active</span></div>
          <div className="stat-grid"><Stat icon={Building2} label="Active tenants" value={tenants.filter((tenant) => tenant.status === 'active').length} sub={`${tenants.length} total accounts`} /><Stat icon={CircleDollarSign} label="Available credits" value={tenants.reduce((sum, tenant) => sum + Number(tenant.available_credits), 0).toLocaleString()} sub="model request units" /><Stat icon={KeyRound} label="Provider connections" value={providers.filter((provider) => provider.enabled).length} sub={`${providers.length} configured`} /><Stat icon={Workflow} label="Embedding jobs" value={jobs.filter((job) => job.status === 'processing' || job.status === 'queued').length} sub="active across tenants" /></div>
          <div className="content-grid"><section className="panel"><PanelTitle title="Tenant activity" action="Manage tenants" href="/admin/tenants" />{tenants.slice(0, 5).map((tenant) => <div className="tenant-row" key={tenant.id}><span className="tenant-avatar">{tenant.name.slice(0, 1).toUpperCase()}</span><div className="tenant-name"><b>{tenant.name}</b><small>{tenant.id.slice(0, 8)}â€¦</small></div><span className={`status-pill ${tenant.status}`}>{tenant.status}</span><strong className="credit-value">{Number(tenant.available_credits).toLocaleString()} <small>credits</small></strong></div>)}{tenants.length === 0 && <Empty text="No tenants yet. Create the first tenant to get started." />}</section>
            <section className="panel"><PanelTitle title="Recent platform changes" action="View audit" href="/admin/audit" />{audit.slice(0, 6).map((event) => <div className="audit-row" key={event.id}><span className="audit-icon"><Check size={13} /></span><div><b>{event.action.replaceAll('.', ' ')}</b><small>{event.actor_email ?? 'System'} Â· {new Date(event.created_at).toLocaleString()}</small></div></div>)}{audit.length === 0 && <Empty text="Platform actions will appear here." />}</section></div>
        </>}
        {section === 'tenants' && <><PageTitle eyebrow="CUSTOMER ACCOUNTS" title="Tenants & credits" description="Manage tenant access and model request allowances." />
          <section className="panel"><PanelTitle title="Tenant accounts" /><form className="inline-create" onSubmit={createTenant}><input value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="New tenant name" aria-label="New tenant name" required /><button className="primary-button compact" disabled={saving}><Plus size={15} /> Add tenant</button></form>
            <div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Status</th><th>Available</th><th>Used</th><th>Grant / adjust credits</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><b>{tenant.name}</b><small>{tenant.id}</small></td><td><span className={`status-pill ${tenant.status}`}>{tenant.status}</span></td><td>{Number(tenant.available_credits).toLocaleString()}</td><td>{Number(tenant.used_credits).toLocaleString()}</td><td><form className="credit-form" onSubmit={(event) => grantCredits(event, tenant.id)}><input type="number" aria-label={`Credits for ${tenant.name}`} value={creditAmounts[tenant.id] ?? ''} onChange={(event) => setCreditAmounts({ ...creditAmounts, [tenant.id]: event.target.value })} placeholder="+500 / -50" required /><button className="soft-button" disabled={saving}>Apply</button></form></td></tr>)}</tbody></table></div>
          </section></>}
        {section === 'providers' && <><PageTitle eyebrow="MODEL ACCESS" title="AI providers" description="Set price limits per connection. FaroAI syncs model prices and filters eligible models before Jev selects one." />
          <div className="provider-grid">{providers.map((provider) => <article className="provider-card" key={provider.id}><div className="provider-head"><span className="provider-icon"><BrainCircuit size={18} /></span><span className={`status-pill ${provider.enabled ? 'active' : 'suspended'}`}>{provider.enabled ? 'enabled' : 'disabled'}</span></div><h3>{provider.name}</h3><p className="provider-kind">{provider.provider}</p><p className="provider-endpoint">{provider.endpoint_url}</p><ProviderPriceLimits provider={provider} onSaved={load} onError={setError} onNotice={setNotice} /><p className="secret-status"><ShieldCheck size={14} /> {provider.secret_hint ? `Credential ${provider.secret_hint}` : 'No credential stored'}</p></article>)}{providers.length === 0 && <Empty text="No provider connections configured yet." />}</div>
          <section className="panel provider-form-panel"><PanelTitle title="Add provider connection" /><form className="provider-form" onSubmit={addProvider}><label>Provider<select value={providerDraft.provider} onChange={(event) => setProviderDraft({ ...providerDraft, provider: event.target.value, endpoint_url: event.target.value === 'openrouter' ? 'https://openrouter.ai/api/v1' : '' })}><option value="openrouter">OpenRouter</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option></select></label><label>Connection name<input value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.target.value })} required /></label><label className="wide-field">API endpoint<input type="url" value={providerDraft.endpoint_url} onChange={(event) => setProviderDraft({ ...providerDraft, endpoint_url: event.target.value })} placeholder="https:// or allowed local model host" required /></label><label className="wide-field">Provider API key<input type="password" value={providerDraft.secret} onChange={(event) => setProviderDraft({ ...providerDraft, secret: event.target.value })} autoComplete="new-password" placeholder="Stored encrypted; never shown again" required={providerDraft.provider === 'openrouter'} /></label><label>Maximum input price (USD / 1M tokens)<input type="number" min="0" max="10" step="any" value={providerDraft.max_input_usd_per_million_tokens} onChange={(event) => setProviderDraft({ ...providerDraft, max_input_usd_per_million_tokens: event.target.value })} required /></label><label>Maximum output price (USD / 1M tokens)<input type="number" min="0" max="10" step="any" value={providerDraft.max_output_usd_per_million_tokens} onChange={(event) => setProviderDraft({ ...providerDraft, max_output_usd_per_million_tokens: event.target.value })} required /></label><label>Maximum image price (USD / image)<input type="number" min="0" max="10" step="any" value={providerDraft.max_image_usd_per_image} onChange={(event) => setProviderDraft({ ...providerDraft, max_image_usd_per_image: event.target.value })} required /></label><button className="primary-button compact" disabled={saving}>{saving ? 'Savingâ€¦' : 'Save provider'}</button></form><p className="form-footnote">Each input and output limit must be $10 per 1M tokens or less. Image limits must be $10 per image or less. Models and token rates are discovered automatically. FaroAI enforces these limits; free or unknown-price models are excluded. Credentials are encrypted before storage.</p></section>
        </>}
        {section === 'routing' && <><PageTitle eyebrow="REQUEST-TIME SELECTION" title="Jev model routing" description="Eligible models are derived from provider connection price limits. Configure only tenant request budgets; Jev selects a model automatically." />
          <section className="panel routing-panel">
            {tenants.length === 0 ? <Empty text="Create a tenant before configuring its model candidates." /> : <>
              <label className="routing-tenant">Tenant<select value={routingTenantId} onChange={(event) => setRoutingTenantId(event.target.value)}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
              {routingLoading ? <div className="empty-state"><LoaderCircle className="spin" size={20} /><p>Loading eligible modelsâ€¦</p></div> : eligibleModelCount === 0 ? <Empty text="No models currently meet the price limits configured on enabled provider connections." /> : <form onSubmit={saveModelCandidates}>
                <div className="routing-summary"><b>{eligibleModelCount} eligible models</b><span>Jev selects automatically from the synced models that pass each provider connectionâ€™s input/output price limits. Free and unknown-price models are excluded.</span></div>
                <div className="routing-budget-grid">
                  <label>Maximum estimated request cost (USD)<input type="number" min="0" max="100" step="any" value={maxEstimatedRequestCost} onChange={(event) => setMaxEstimatedRequestCost(event.target.value)} placeholder="No ceiling" /></label>
                  <label>Maximum input-token budget<input type="number" min="128" max="128000" step="1" value={maxInputTokens} onChange={(event) => setMaxInputTokens(event.target.value)} required /></label>
                  <label>Maximum billed images per request<input type="number" min="0" max="16" step="1" value={maxImagesPerRequest} onChange={(event) => setMaxImagesPerRequest(event.target.value)} required /></label>
                </div>
                <p className="form-footnote">The request estimate uses token rates, per-image rates, and the configured request limits. This request spending policy applies across the tenantâ€™s eligible providers and is independent of each provider connectionâ€™s model price limits.</p>
                <p className="form-footnote">In hosted mode Jev selects from eligible models for each request. FaroAI checks the selected model against the current provider price limits before inference.</p>
                <button className="primary-button compact" disabled={saving}>{saving ? 'Savingâ€¦' : 'Save request policy'}</button>
              </form>}
            </>}
          </section>
        </>}
        {section === 'knowledge' && <><PageTitle eyebrow="RETRIEVAL OPERATIONS" title="Knowledge & embedding jobs" description="Add tenant-owned knowledge, review it before Qdrant indexing, and inspect embedding work." />
          <section className="panel"><PanelTitle title="Embedding jobs" />{tenants.length > 1 && <p className="form-footnote">Showing the selected first tenant in this initial console. Tenant-specific navigation follows the current deployment mode.</p>}{jobs.length === 0 ? <Empty text="No embedding jobs for this tenant yet." /> : <div className="table-wrap"><table><thead><tr><th>Job</th><th>State</th><th>Progress</th><th>Collection / model</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><code>{job.id.slice(0, 12)}â€¦</code></td><td><span className={`status-pill ${job.status === 'completed' ? 'active' : job.status === 'failed' ? 'suspended' : 'pending'}`}>{job.status}</span></td><td>{job.completed_documents} / {job.total_documents}</td><td>{job.collection_name}<small>{job.job_kind === 'catalogue_products' ? 'Product catalog · ' : 'Knowledge · '}{job.embedding_model}</small></td></tr>)}</tbody></table></div>}</section>
          <KnowledgeDocuments tenants={tenants} />
        </>}
        {section === 'mcp' && <><PageTitle eyebrow="TOOL CONNECTIVITY" title="MCP connections" description="Configure tenant endpoints and credentials for GIS, GMS, ERP, and other MCP servers." />
          <section className="panel"><PanelTitle title="Tenant MCP connections" />{tenants.length ? <McpConnections tenants={tenants} /> : <Empty text="Create a tenant before configuring MCP connections." />}</section>
          <section className="panel"><PanelTitle title="Existing tenant MCP sources" />{tenants[0] ? <McpSources tenantId={tenants[0].id} /> : <Empty text="No tenant is available." />}</section>
        </>}
        {section === 'learning' && <><PageTitle eyebrow="CONSENTED IMPROVEMENT" title="Learning & training" description="Review opted-in AI interactions, add approved answers to tenant search, and prepare supervised fine-tuning datasets." /><LearningOperations tenants={tenants} /></>}
        {section === 'audit' && <><PageTitle eyebrow="ACCOUNTABILITY" title="Audit trail" description="Review platform changes and tenant operations." /><section className="panel">{audit.map((event) => <div className="audit-row roomy" key={event.id}><span className="audit-icon"><ShieldCheck size={13} /></span><div><b>{event.action.replaceAll('.', ' ')}</b><small>{event.actor_email ?? 'System'} Â· {event.resource_type} Â· {event.tenant_id ? `tenant ${event.tenant_id.slice(0, 8)}â€¦` : 'platform'} Â· {new Date(event.created_at).toLocaleString()}</small></div></div>)}</section></>}
        {section === 'settings' && <><PageTitle eyebrow="DEPLOYMENT CONFIGURATION" title="Runtime settings" description="Deployment values are read-only. Procurement conversation history can be changed here and applies immediately." /><RuntimeSettings /></>}
      </div>
    </main>
  </div>;
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Activity; label: string; value: string | number; sub: string }) { return <article className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{sub}</small></article>; }
function PanelTitle({ title, action, href }: { title: string; action?: string; href?: string }) { return <div className="panel-title"><h2>{title}</h2>{action && href && <Link href={href}>{action}<ChevronRight size={14} /></Link>}</div>; }
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></div>; }
function Empty({ text }: { text: string }) { return <div className="empty-state"><Boxes size={22} /><p>{text}</p></div>; }

function ProviderPriceLimits({ provider, onSaved, onError, onNotice }: { provider: Provider; onSaved: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [inputLimit, setInputLimit] = useState(String(provider.max_input_usd_per_million_tokens));
  const [outputLimit, setOutputLimit] = useState(String(provider.max_output_usd_per_million_tokens));
  const [imageLimit, setImageLimit] = useState(String(provider.max_image_usd_per_image));
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    setInputLimit(String(provider.max_input_usd_per_million_tokens));
    setOutputLimit(String(provider.max_output_usd_per_million_tokens));
    setImageLimit(String(provider.max_image_usd_per_image));
  }, [provider.id, provider.max_input_usd_per_million_tokens, provider.max_output_usd_per_million_tokens, provider.max_image_usd_per_image]);

  async function discover() {
    setSyncing(true); onError(''); onNotice('');
    const result = await adminApi('/providers/' + provider.id + '/models/discover', { method: 'POST', body: JSON.stringify({}) });
    setSyncing(false);
    if (!result.success) { onError(result.message ?? 'Provider models could not be synced.'); return; }
    onNotice('Provider model catalog and prices synced. Models above the connection limits remain unavailable to Jev.');
    await onSaved();
  }

  async function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Number(inputLimit);
    const output = Number(outputLimit);
    const image = Number(imageLimit);
    if (!Number.isFinite(input) || input < 0 || input > 10 || !Number.isFinite(output) || output < 0 || output > 10 || !Number.isFinite(image) || image < 0 || image > 10) {
      onError('Enter token limits from $0 to $10 per 1M tokens and image limits from $0 to $10 per image.');
      return;
    }
    onError(''); onNotice('');
    setSyncing(true);
    const result = await adminApi(`/providers/${provider.id}/price-limits`, { method: 'PUT', body: JSON.stringify({ max_input_usd_per_million_tokens: input, max_output_usd_per_million_tokens: output, max_image_usd_per_image: image }) });
    if (!result.success) { setSyncing(false); onError(result.message ?? 'Provider price limits could not be saved.'); return; }
    const discovery = await adminApi<{ count: number; eligible_count: number }>(`/providers/${provider.id}/models/discover`, { method: 'POST', body: '{}' });
    setSyncing(false);
    await onSaved();
    if (!discovery.success) {
      onError(`Limits saved, but the provider catalog could not be refreshed: ${discovery.message ?? 'check the connection and try again.'}`);
      return;
    }
    onNotice(`Limits saved. ${discovery.data?.eligible_count ?? 0} paid models fit these limits and are available for Jev to choose.`);
  }

  return <div className="provider-pricing">
    <div className="provider-model-toolbar"><div><b>Automatic model eligibility</b><small>{provider.eligible_model_count} eligible from {provider.discovered_model_count} discovered</small></div><button className="secondary-button" type="button" disabled={syncing} onClick={() => void discover()}>{syncing ? 'Syncingâ€¦' : 'Refresh catalog'}</button></div>
    <form className="provider-form provider-limit-form" onSubmit={saveLimits}>
      <label>Maximum input price (USD / 1M tokens)<input aria-label={`${provider.name} maximum input price`} type="number" min="0" max="10" step="any" value={inputLimit} onChange={(event) => setInputLimit(event.target.value)} required /></label>
      <label>Maximum output price (USD / 1M tokens)<input aria-label={`${provider.name} maximum output price`} type="number" min="0" max="10" step="any" value={outputLimit} onChange={(event) => setOutputLimit(event.target.value)} required /></label>
      <label>Maximum image price (USD / image)<input aria-label={`${provider.name} maximum image price`} type="number" min="0" max="10" step="any" value={imageLimit} onChange={(event) => setImageLimit(event.target.value)} required /></label>
      <button className="soft-button" type="submit" disabled={syncing}>{syncing ? 'Refreshing catalog…' : 'Save limits'}</button>
    </form>
    <small>{provider.provider === 'openrouter' ? (provider.jev_eligible ? 'Jev 1.13 routing is ready on this connection. ' : 'Jev 1.13 needs an enabled OpenRouter connection, a saved API key, and an input limit of at least $0.042 / 1M tokens. ') : ''}{provider.models_synced_at ? `Last catalog sync ${new Date(provider.models_synced_at).toLocaleString()}. ` : 'Catalog has not been synced yet. '}{' '}Synced provider rates are refreshed automatically. Free and unknown-price models are excluded; there is no per-model selection.</small>
  </div>;
}

function McpConnections({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '');
  const [connections, setConnections] = useState<Partial<Record<McpIntegration, McpConnection>>>({});
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!tenants.some((tenant) => tenant.id === tenantId)) setTenantId(tenants[0]?.id ?? ''); }, [tenants, tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    setLoadingConnections(true);
    setError('');
    void adminApi<{ items: McpConnection[] }>(`/tenants/${tenantId}/mcp/connections`)
      .then((result) => {
        if (!active) return;
        if (!result.success) { setError(result.message ?? 'MCP connections could not be loaded.'); return; }
        setConnections(Object.fromEntries((result.data?.items ?? []).map((item) => [item.integration_key, item])));
      })
      .catch(() => { if (active) setError('MCP connections could not be loaded.'); })
      .finally(() => { if (active) setLoadingConnections(false); });
    return () => { active = false; };
  }, [tenantId]);
  const integrations: Array<{ key: McpIntegration; title: string }> = [
    { key: 'gis', title: 'GIS MCP' }, { key: 'gms', title: 'GMS MCP' },
    { key: 'erp', title: 'ERP MCP' }, { key: 'custom', title: 'Other MCP' },
  ];
  return <div className="mcp-connections">
    {tenants.length > 1 && <label className="routing-tenant">Tenant<select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>}
    <p className="form-footnote">Each tenant has separate MCP credentials. Endpoints must use HTTPS and a host approved by the deployment operator. In Docker, localhost points to the AI service container itself, not the Windows host or another container. Testing discovers tools; it does not approve them for Jev.</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {loadingConnections ? <div className="empty-state"><LoaderCircle className="spin" size={20} /><p>Loading MCP connectionsâ€¦</p></div> : <div className="mcp-connection-grid">{integrations.map((item) => <McpConnectionCard key={`${tenantId}-${item.key}`} tenantId={tenantId} integration={item.key} title={item.title} connection={connections[item.key]} onChange={(connection) => setConnections((current) => ({ ...current, [item.key]: connection }))} />)}</div>}
  </div>;
}

function McpConnectionCard({ tenantId, integration, title, connection, onChange }: {
  tenantId: string; integration: McpIntegration; title: string; connection?: McpConnection;
  onChange: (connection: McpConnection) => void;
}) {
  const [displayName, setDisplayName] = useState(connection?.display_name ?? title);
  const [endpointUrl, setEndpointUrl] = useState(connection?.endpoint_url ?? '');
  const [authMethod, setAuthMethod] = useState<'bearer' | 'x-api-key'>(connection?.auth_method ?? 'bearer');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [allowedTools, setAllowedTools] = useState<string[]>(connection?.allowed_tools ?? []);
  const [discoveredTools, setDiscoveredTools] = useState<string[]>(connection?.discovered_tools ?? []);
  const [status, setStatus] = useState<McpConnection['connection_status']>(connection?.connection_status ?? 'untested');
  const [secretHint, setSecretHint] = useState(connection?.secret_hint ?? null);
  const [checkedAt, setCheckedAt] = useState(connection?.last_checked_at ?? null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(connection?.display_name ?? title);
    setEndpointUrl(connection?.endpoint_url ?? '');
    setAuthMethod(connection?.auth_method ?? 'bearer');
    setEnabled(connection?.enabled ?? true);
    setAllowedTools(connection?.allowed_tools ?? []);
    setDiscoveredTools(connection?.discovered_tools ?? []);
    setStatus(connection?.connection_status ?? 'untested');
    setSecretHint(connection?.secret_hint ?? null);
    setCheckedAt(connection?.last_checked_at ?? null);
    setApiKey('');
  }, [connection, title]);

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminApi<McpConnection>(`/tenants/${tenantId}/mcp/connections/${integration}`, {
        method: 'PUT', body: JSON.stringify({ display_name: displayName, endpoint_url: endpointUrl, auth_method: authMethod, api_key: apiKey || undefined, enabled, allowed_tools: allowedTools }),
      });
      if (!result.success || !result.data) { setError(result.message ?? 'MCP connection could not be saved.'); return; }
      setApiKey('');
      setStatus(result.data.connection_status); setSecretHint(result.data.secret_hint); setAllowedTools(result.data.allowed_tools);
      setDiscoveredTools(result.data.discovered_tools); setCheckedAt(result.data.last_checked_at);
      onChange(result.data);
      setNotice('Connection settings saved. Test the connection before approving tools.');
    } catch { setError('MCP connection could not be saved.'); }
    finally { setBusy(false); }
  }

  async function testConnection() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminApi<{ connection_status: 'connected'; discovered_tools: string[]; allowed_tools: string[] }>(`/tenants/${tenantId}/mcp/connections/${integration}/test`, { method: 'POST', body: '{}' });
      if (!result.success || !result.data) { setStatus('error'); setError(result.message ?? 'MCP server could not be verified.'); return; }
      setStatus('connected'); setDiscoveredTools(result.data.discovered_tools); setAllowedTools(result.data.allowed_tools);
      setCheckedAt(new Date().toISOString());
      if (connection) onChange({ ...connection, connection_status: 'connected', discovered_tools: result.data.discovered_tools, allowed_tools: result.data.allowed_tools, last_checked_at: new Date().toISOString() });
      setNotice(`Connected. Found ${result.data.discovered_tools.length} tools; choose which ones Jev may use, then save.`);
    } catch { setError('MCP server could not be verified.'); }
    finally { setBusy(false); }
  }

  function toggleTool(tool: string, checked: boolean) {
    setAllowedTools((current) => checked ? [...new Set([...current, tool])] : current.filter((item) => item !== tool));
  }

  return <article className="mcp-connection-card">
    <div className="mcp-connection-heading"><div><p className="eyebrow">TENANT MCP</p><h3>{title}</h3></div><span className={`status-pill ${status === 'connected' ? 'active' : status === 'error' ? 'suspended' : 'pending'}`}>{status}</span></div>
    <form className="mcp-connection-form" onSubmit={save}>
      <label>Connection name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={120} /></label>
      <label>Endpoint URL<input type="url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://mcp.example.com/mcp" required maxLength={1000} /></label>
      <label>API key location<select value={authMethod} onChange={(event) => setAuthMethod(event.target.value as 'bearer' | 'x-api-key')}><option value="bearer">Authorization: Bearer</option><option value="x-api-key">X-API-Key header</option></select></label>
      <label>API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" placeholder={secretHint ? `${secretHint} â€” leave blank to keep` : 'Enter API key'} required={!connection} /></label>
      <label className="mcp-enabled"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable this connection</label>
      <div className="mcp-connection-actions"><button className="primary-button compact" type="submit" disabled={busy}>{busy ? 'Savingâ€¦' : 'Save connection'}</button><button className="secondary-button" type="button" onClick={() => void testConnection()} disabled={busy || !connection}>{busy ? 'Workingâ€¦' : 'Test connection'}</button></div>
    </form>
    {secretHint && <p className="secret-status"><ShieldCheck size={14} /> API key stored encrypted Â· {secretHint}</p>}
    {checkedAt && <p className="mcp-checked">Last tested {new Date(checkedAt).toLocaleString()}</p>}
    {discoveredTools.length > 0 && <fieldset className="mcp-tools"><legend>Tools Jev is allowed to call</legend>{discoveredTools.map((tool) => <label key={tool}><input type="checkbox" checked={allowedTools.includes(tool)} onChange={(event) => toggleTool(tool, event.target.checked)} />{tool}</label>)}<button className="secondary-button" type="button" onClick={() => void save()} disabled={busy}>Save allowed tools</button></fieldset>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
  </article>;
}

function McpSources({ tenantId }: { tenantId: string }) {
  const [items, setItems] = useState<Array<{ id: string; name: string; mode: string; status: string; last_synced_at: string | null }>>([]);
  useEffect(() => { void adminApi<{ items: typeof items }>(`/tenants/${tenantId}/mcp/sources`).then((result) => setItems(result.data?.items ?? [])).catch(() => setItems([])); }, [tenantId]);
  if (!items.length) return <Empty text="No MCP sources registered for this tenant." />;
  return <div className="table-wrap"><table><thead><tr><th>Source</th><th>Mode</th><th>Status</th><th>Last synced</th></tr></thead><tbody>{items.map((source) => <tr key={source.id}><td>{source.name}<small>{source.id}</small></td><td>{source.mode}</td><td><span className={`status-pill ${source.status === 'active' ? 'active' : 'pending'}`}>{source.status}</span></td><td>{source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : 'Not synced'}</td></tr>)}</tbody></table></div>;
}

type KnowledgeDocumentRow = {
  id: string; title: string; language: string; content_version: string; status: string;
  approved_by: string | null; approved_at: string | null; content_preview: string; character_count: number;
  updated_at: string;
};

function KnowledgeDocuments({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState('');
  const [items, setItems] = useState<KnowledgeDocumentRow[]>([]);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<'en' | 'th' | 'fr'>('en');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (tenants.length && !tenantId) setTenantId(tenants[0].id); }, [tenants, tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    setError('');
    void adminApi<{ items: KnowledgeDocumentRow[] }>(`/tenants/${tenantId}/knowledge/documents?limit=50`)
      .then((result) => {
        setItems(result.data?.items ?? []);
        if (!result.success) setError(result.message ?? 'Knowledge documents could not be loaded.');
      }).catch(() => setError('Knowledge documents could not be loaded.'));
  }, [tenantId, notice]);

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !title.trim() || !content.trim()) return;
    setBusy(true); setError(''); setNotice('');
    const result = await adminApi<KnowledgeDocumentRow>(`/tenants/${tenantId}/knowledge/documents`, {
      method: 'POST', body: JSON.stringify({ title, language, content }),
    });
    setBusy(false);
    if (!result.success) { setError(result.message ?? 'The knowledge document could not be saved.'); return; }
    setTitle(''); setContent(''); setNotice('Saved as pending review. Approve it to start Qdrant indexing.');
  }

  async function approveDocument(documentId: string) {
    setBusy(true); setError(''); setNotice('');
    const result = await adminApi<{ id: string; status: string; job_id: string }>(`/tenants/${tenantId}/knowledge/documents/${documentId}/approve`, { method: 'POST', body: '{}' });
    setBusy(false);
    if (!result.success) { setError(result.message ?? 'The knowledge document could not be approved.'); return; }
    setNotice('Approved. Qdrant indexing has been queued; the document becomes available for learning after indexing completes.');
  }

  if (!tenants.length) return <section className="panel"><Empty text="Create a tenant before adding knowledge documents." /></section>;
  return <>
    <section className="panel">
      <PanelTitle title="Add tenant knowledge" />
      <p className="form-footnote">Paste trusted business facts or product descriptions as plain text or Markdown. New documents stay pending until a platform admin reviews and approves them. Approval starts tenant-scoped Qdrant indexing; it does not train a model.</p>
      <form className="admin-form" onSubmit={(event) => void addDocument(event)}>
        <label>Tenant<select value={tenantId} onChange={(event) => setTenantId(event.target.value)} required>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
        <div className="form-grid">
          <label>Document title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required placeholder="KT product knowledge — test snapshot" /></label>
          <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'th' | 'fr')}><option value="en">English</option><option value="th">Thai</option><option value="fr">French</option></select></label>
        </div>
        <label>Document text<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={100000} rows={9} required placeholder="Paste the source text here…" /></label>
        <small>{content.length.toLocaleString()} / 100,000 characters</small>
        <button className="primary-button compact" type="submit" disabled={busy || !title.trim() || !content.trim()}>{busy ? 'Saving…' : 'Save for review'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    </section>
    <section className="panel">
      <PanelTitle title="Tenant knowledge documents" />
      {!items.length ? <Empty text="No knowledge documents for this tenant yet." /> : <div className="learning-document-list">
        {items.map((document) => <article className="learning-document-row" key={document.id}>
          <div><strong>{document.title}</strong><small>{document.language.toUpperCase()} · {document.character_count.toLocaleString()} characters · updated {new Date(document.updated_at).toLocaleString()}</small><p>{document.content_preview}{document.character_count > document.content_preview.length ? '…' : ''}</p>
            {document.approved_by && <small>Approved by {document.approved_by}{document.approved_at ? ` · ${new Date(document.approved_at).toLocaleString()}` : ''}</small>}</div>
          <div className="learning-actions"><span className={`status-pill ${document.status === 'approved' ? 'active' : document.status === 'removed' ? 'suspended' : 'pending'}`}>{document.status}</span>
            {document.status === 'pending' && !document.approved_at && <button className="secondary-button" type="button" disabled={busy} onClick={() => void approveDocument(document.id)}>Approve & index</button>}
          </div>
        </article>)}
      </div>}
    </section>
  </>;
}

function RuntimeSettings() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [conversationHistoryEnabled, setConversationHistoryEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void adminApi<Record<string, unknown> & { procurement_conversation_history_enabled: boolean }>('/system/config').then((result) => {
      setSettings(result.data ?? null);
      setConversationHistoryEnabled(result.data?.procurement_conversation_history_enabled ?? true);
      if (!result.success) setError(result.message ?? 'Runtime settings could not be loaded.');
    }).catch(() => setError('Runtime settings could not be loaded.'));
  }, []);
  async function saveConversationSetting() {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await adminApi<{ conversation_history_enabled: boolean }>('/system/procurement-settings', {
        method: 'PUT', body: JSON.stringify({ conversation_history_enabled: conversationHistoryEnabled }),
      });
      if (!result.success || !result.data) throw new Error(result.message ?? 'The procurement setting could not be saved.');
      setConversationHistoryEnabled(result.data.conversation_history_enabled);
      setNotice('Procurement conversation setting saved. It applies to the next request.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The procurement setting could not be saved.');
    } finally { setSaving(false); }
  }
  if (!settings) return <div className="panel"><Empty text={error || 'Loading deployment settings…'} /></div>;
  const deploymentSettings = Object.entries(settings).filter(([key]) => key !== 'procurement_conversation_history_enabled');
  return <>
    <section className="panel procurement-history-setting">
      <div className="panel-title"><h2>Procurement conversation context</h2><span className={`status-pill ${conversationHistoryEnabled ? 'active' : 'pending'}`}>{conversationHistoryEnabled ? 'Enabled' : 'Disabled'}</span></div>
      <p className="form-footnote">When enabled, follow-up prompts include earlier messages so FaroAI can keep their context. Turn it off to send each prompt without previous conversation history and reduce input-token usage. GIS lookups still run for every new request.</p>
      <label className="runtime-setting-toggle"><input type="checkbox" checked={conversationHistoryEnabled} onChange={(event) => { setConversationHistoryEnabled(event.target.checked); setNotice(''); }} disabled={saving} /><span><b>Include conversation history in procurement prompts</b><small>Applies to the next procurement request. Existing GIS result filtering stays local and does not use AI tokens.</small></span></label>
      <button className="soft-button" type="button" onClick={() => void saveConversationSetting()} disabled={saving || !settings}>{saving ? 'Saving…' : 'Save setting'}</button>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    </section>
    <section className="settings-grid">{deploymentSettings.map(([key, value]) => <article className="setting-card" key={key}><span>{key.replaceAll('_', ' ')}</span><b>{String(value)}</b></article>)}</section>
  </>;
}

type LearningCandidate = {
  id: string; question: string; generated_answer: string; preferred_answer: string | null;
  provider: string; model: string; language: string; source_refs: Array<{ kind: string; id: string; label: string }>;
  origin: 'interaction' | 'rag_document'; rag_training_consent: boolean;
  rag_consent: boolean; local_consent: boolean; shared_consent: boolean;
  review_status: string; rag_approved: boolean; local_training_approved: boolean;
  shared_training_approved: boolean; rag_status: string; created_at: string; expires_at: string;
};

type LearningDocument = { id: string; title: string; language: string; content_version: string; status: string };

function LearningOperations({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '');
  const [candidates, setCandidates] = useState<LearningCandidate[]>([]);
  const [documents, setDocuments] = useState<LearningDocument[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [settings, setSettings] = useState<{
    local_training_authorized: boolean; local_authorization_reference: string | null;
    shared_training_authorized: boolean; authorization_reference: string | null;
  } | null>(null);
  const [runtime, setRuntime] = useState<{ deployment_mode: string; tenant_mode: string; local_llm_enabled: boolean; shared_training_enabled: boolean } | null>(null);
  const [reference, setReference] = useState('');
  const [localReference, setLocalReference] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [promotions, setPromotions] = useState<Record<string, { rag: boolean; local: boolean; shared: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (tenants[0] && !tenantId) setTenantId(tenants[0].id); }, [tenants, tenantId]);
  useEffect(() => { void adminApi<typeof runtime>('/system/config').then((result) => setRuntime(result.data ?? null)); }, []);
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    setLoading(true); setError('');
    setSettings(null); setCandidates([]); setDocuments([]); setSelectedDocuments([]);
    setPromotions({}); setAnswers({});
    void Promise.all([
      adminApi<{ items: LearningCandidate[] }>(`/tenants/${tenantId}/learning/candidates?limit=50`),
      adminApi<{ local_training_authorized: boolean; local_authorization_reference: string | null; shared_training_authorized: boolean; authorization_reference: string | null }>(`/tenants/${tenantId}/learning/settings`),
      adminApi<{ items: LearningDocument[] }>(`/tenants/${tenantId}/knowledge/documents?limit=100`),
    ]).then(([candidateResult, settingsResult, documentResult]) => {
      if (!active) return;
      setCandidates(candidateResult.data?.items ?? []);
      setSettings(settingsResult.data ?? { local_training_authorized: false, local_authorization_reference: null, shared_training_authorized: false, authorization_reference: null });
      setDocuments(documentResult.data?.items?.filter((document) => document.status === 'approved') ?? []);
      setSelectedDocuments([]);
      setPromotions({});
      setAnswers({});
      setReference(settingsResult.data?.authorization_reference ?? '');
      setLocalReference(settingsResult.data?.local_authorization_reference ?? '');
      if (!candidateResult.success || !settingsResult.success || !documentResult.success) setError(candidateResult.message ?? settingsResult.message ?? documentResult.message ?? 'Learning data could not be loaded.');
    }).catch(() => { if (active) setError('Learning data could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  async function review(candidate: LearningCandidate, reviewStatus: 'approved' | 'rejected') {
    const selected = promotions[candidate.id] ?? {
      rag: candidate.rag_consent,
      local: (candidate.local_consent || candidate.rag_training_consent) && tenantLocalLearningAllowed,
      shared: false,
    };
    const result = await adminApi(`/tenants/${tenantId}/learning/candidates/${candidate.id}/review`, {
      method: 'POST', body: JSON.stringify({
        review_status: reviewStatus,
        preferred_answer: reviewStatus === 'approved' ? (answers[candidate.id] ?? candidate.generated_answer) : undefined,
        add_to_rag: reviewStatus === 'approved' && selected.rag,
        add_to_local_training: reviewStatus === 'approved' && selected.local,
        add_to_shared_training: reviewStatus === 'approved' && selected.shared,
      }),
    });
    if (!result.success) { setError(result.message ?? 'Candidate review failed.'); return; }
    setNotice(reviewStatus === 'approved' ? 'Approved. RAG indexing is queued where selected; no model has been fine-tuned.' : 'Candidate rejected.');
    await refreshCandidates();
  }

  async function refreshCandidates() {
    const result = await adminApi<{ items: LearningCandidate[] }>(`/tenants/${tenantId}/learning/candidates?limit=50`);
    if (result.success) setCandidates(result.data?.items ?? []);
  }

  async function saveSharedAuthorization() {
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    const result = await adminApi(`/tenants/${tenantId}/learning/settings`, {
      method: 'PUT', body: JSON.stringify({
        local_training_authorized: settings.local_training_authorized, local_authorization_reference: localReference,
        shared_training_authorized: settings.shared_training_authorized, authorization_reference: reference,
      }),
    });
    setBusy(false);
    if (!result.success) { setError(result.message ?? 'Tenant learning authorization could not be saved.'); return; }
    setNotice('Tenant learning authorizations saved.');
  }

  async function generateRagLearningDrafts() {
    if (!selectedDocuments.length) return;
    setBusy(true); setError(''); setNotice('');
    const result = await adminApi<{ draft_count: number; provider: string; model: string }>(`/tenants/${tenantId}/learning/rag/generate`, {
      method: 'POST', body: JSON.stringify({ document_ids: selectedDocuments, questions_per_document: 3 }),
    });
    setBusy(false);
    if (!result.success) { setError(result.message ?? 'RAG learning drafts could not be created.'); return; }
    setNotice(String(result.data?.draft_count ?? 0) + ' draft examples created with ' + (result.data?.provider ?? 'local model') + ' / ' + (result.data?.model ?? '') + '. Review each draft before approving it for fine-tuning.');
    setSelectedDocuments([]);
    await refreshCandidates();
  }

  async function deleteCandidate(candidate: LearningCandidate) {
    setBusy(true); setError('');
    const result = await adminApi(`/tenants/${tenantId}/learning/candidates/${candidate.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!result.success) { setError(result.message ?? 'Candidate could not be deleted.'); return; }
    setNotice('Candidate content and its Qdrant knowledge item were deleted.');
    await refreshCandidates();
  }

  async function exportDataset(scope: 'local' | 'shared') {
    const path = scope === 'shared' ? '/learning/datasets/shared/export' : `/tenants/${tenantId}/learning/datasets/local/export`;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin${path}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setError(body?.message ?? 'Dataset export failed.'); setBusy(false); return;
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = href;
      anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'faroai-training.jsonl';
      anchor.click(); URL.revokeObjectURL(href);
      setNotice(`Dataset exported (${blob.size.toLocaleString()} bytes). This prepares examples; it does not train model weights.`);
    } catch { setError('Dataset export failed.'); }
    setBusy(false);
  }

  if (!tenants.length) return <div className="panel"><Empty text="Create a tenant before reviewing learning candidates." /></div>;
  const localAvailable = runtime?.local_llm_enabled === true;
  const tenantLocalLearningAllowed = localAvailable && settings?.local_training_authorized === true;

  return <>
    {error && <p className="admin-alert" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    <section className="panel learning-policy">
      <div className="learning-toolbar"><label>Tenant<select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setNotice(''); }}>
        {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
      </select></label><div className="learning-export-actions">
        <button className="secondary-button" type="button" disabled={busy || !tenantLocalLearningAllowed} onClick={() => void exportDataset('local')}>Export this tenant's fine-tuning dataset</button>
        {tenantLocalLearningAllowed && <a className="secondary-button" href="/local-training/train_lora.py" download>Download training runner</a>}
        <button className="secondary-button" type="button" disabled={busy || !runtime?.shared_training_enabled} onClick={() => void exportDataset('shared')}>Export shared dataset</button>
      </div></div>
      {tenantLocalLearningAllowed && <div className="local-training-runner">
        <strong>Run local fine-tuning on a separate workstation</strong>
        <p>Download the runner and its <a href="/local-training/requirements.txt" download>standard Python dependencies</a> or <a href="/local-training/requirements-gemma4.txt" download>Gemma 4 QLoRA dependencies</a>, then follow the <a href="/local-training/README.md" target="_blank" rel="noreferrer">setup guide</a>. This runs outside FaroAI and does not use Qdrant. LM Studio serves the resulting model; it does not train it.</p>
        <small>Gemma 4 text fine-tuning uses a Transformers checkpoint and 4-bit QLoRA, not the GGUF file downloaded for LM Studio. Use an NVIDIA GPU; 24 GB VRAM is the target to try Gemma 4 12B at 512 tokens, not a guarantee for longer sequences. Keep at least 16 GB system RAM and 60 GB free disk, and unload models from LM Studio while training. Training downloads and output stay on the workstation.</small>
      </div>}
      <div className="learning-authorization">
        <label><input type="checkbox" checked={settings?.local_training_authorized ?? false} onChange={(event) => setSettings((current) => current ? { ...current, local_training_authorized: event.target.checked } : current)} />Tenant authorizes its consented interactions and approved RAG knowledge for this tenant's local learning</label>
        <label>Local learning authorization reference<input value={localReference} onChange={(event) => setLocalReference(event.target.value)} maxLength={300} placeholder="Tenant consent record or contract reference" /></label>
        <button className="soft-button" type="button" disabled={busy || !settings} onClick={() => void saveSharedAuthorization()}>Save learning authorization</button>
        <small>Required for tenant-only dataset export and RAG-to-learning. The export stays scoped to this tenant.</small>
      </div>
      <div className="learning-authorization">
        <label><input type="checkbox" checked={settings?.shared_training_authorized ?? false} onChange={(event) => setSettings((current) => current ? { ...current, shared_training_authorized: event.target.checked } : current)} />Tenant authorization for cross-tenant model improvement is on file</label>
        <label>Authorization reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={300} placeholder="Consent record or contract reference" /></label>
        <button className="soft-button" type="button" disabled={busy || !settings} onClick={() => void saveSharedAuthorization()}>Save learning authorization</button>
        <small>{runtime?.shared_training_enabled ? 'Shared training switch is enabled for this deployment.' : 'Shared training is disabled by deployment configuration.'}</small>
      </div>
    </section>
    <section className="panel learning-rag-sources">
      <PanelTitle title="Build learning drafts from approved RAG knowledge" />
      <p className="form-footnote">Select up to 10 approved tenant documents. FaroAI sends them only to this tenant's configured Ollama or LM Studio model to draft grounded question and answer pairs. Review each pair before it can enter a tenant-only dataset.</p>
      {!settings?.local_training_authorized && <p className="form-footnote">Record this tenant's local learning authorization above to enable this action.</p>}
      {documents.length === 0 ? <Empty text="No approved RAG documents are available for this tenant." /> : <div className="learning-document-list">
        {documents.map((document) => <label key={document.id}><input type="checkbox" checked={selectedDocuments.includes(document.id)} disabled={!tenantLocalLearningAllowed || busy || (!selectedDocuments.includes(document.id) && selectedDocuments.length >= 10)} onChange={(event) => setSelectedDocuments((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} /><span>{document.title}<small>{document.language.toUpperCase()} · {document.content_version}</small></span></label>)}
      </div>}
      <button className="secondary-button" type="button" disabled={busy || !tenantLocalLearningAllowed || !selectedDocuments.length} onClick={() => void generateRagLearningDrafts()}>Draft questions with this tenant's local model</button>
      {!localAvailable && <p className="form-footnote">Local model processing is disabled by deployment configuration. Set FAROAI_LOCAL_LLM_ENABLED=true and configure an approved local provider.</p>}
    </section>
    <section className="learning-candidate-list" aria-busy={loading}>
      {loading ? <div className="panel"><Empty text="Loading learning candidatesâ€¦" /></div> : candidates.length === 0 ? <div className="panel"><Empty text="No pending, consented AI examples for this tenant." /></div> : candidates.map((candidate) => {
        const selected = promotions[candidate.id] ?? {
          rag: candidate.rag_consent,
          local: (candidate.local_consent || candidate.rag_training_consent) && tenantLocalLearningAllowed,
          shared: false,
        };
        return <article className="panel learning-candidate" key={candidate.id}>
          <div className="learning-candidate-head"><div><p className="eyebrow">{candidate.provider} Â· {candidate.model} Â· {candidate.language.toUpperCase()}</p><h2>{candidate.question}</h2></div><span className="status-pill pending">review</span></div>
          <div className="learning-consent-badges"><span className={(candidate.rag_consent || candidate.rag_training_consent) ? 'consent-on' : 'consent-off'}>{candidate.origin === 'rag_document' ? 'Tenant RAG source authorized' : candidate.rag_consent ? 'Customer opted into knowledge improvement' : 'Knowledge improvement not consented'}</span><span className={(candidate.local_consent || candidate.rag_training_consent) ? 'consent-on' : 'consent-off'}>{candidate.rag_training_consent ? 'Tenant authorized RAG learning' : candidate.local_consent ? 'Customer opted into local learning' : 'Local learning not consented'}</span><span className={candidate.shared_consent ? 'consent-on' : 'consent-off'}>Shared training {candidate.shared_consent ? 'consented' : 'not consented'}</span></div>
          <label className="learning-answer">Reviewed answer<textarea value={answers[candidate.id] ?? candidate.preferred_answer ?? candidate.generated_answer} onChange={(event) => setAnswers((current) => ({ ...current, [candidate.id]: event.target.value }))} maxLength={8000} rows={4} /></label>
          {candidate.source_refs.length > 0 && <p className="form-footnote">Sources: {candidate.source_refs.map((source) => source.label || source.id).join(', ')}</p>}
          <div className="learning-promotions">
            <label><input type="checkbox" checked={selected.rag} disabled={!candidate.rag_consent} onChange={(event) => setPromotions((current) => ({ ...current, [candidate.id]: { ...selected, rag: event.target.checked } }))} />Add reviewed answer to tenant Qdrant search</label>
            <label><input type="checkbox" checked={selected.local} disabled={!(candidate.local_consent || candidate.rag_training_consent) || !tenantLocalLearningAllowed} onChange={(event) => setPromotions((current) => ({ ...current, [candidate.id]: { ...selected, local: event.target.checked } }))} />Include as this tenant's local fine-tuning example</label>
            <label><input type="checkbox" checked={selected.shared} disabled={!candidate.shared_consent || !settings?.shared_training_authorized || !runtime?.shared_training_enabled} onChange={(event) => setPromotions((current) => ({ ...current, [candidate.id]: { ...selected, shared: event.target.checked } }))} />Include in the FaroAI shared-model dataset</label>
          </div>
          <p className="learning-expiry">Captured {new Date(candidate.created_at).toLocaleString()} Â· expires {new Date(candidate.expires_at).toLocaleDateString()} if not reviewed Â· Qdrant status: {candidate.rag_status}</p>
          <div className="learning-actions"><button className="primary-button compact" type="button" disabled={busy || (!selected.rag && !selected.local && !selected.shared)} onClick={() => { setBusy(true); setError(''); void review(candidate, 'approved').finally(() => setBusy(false)); }}>Approve selected use</button><button className="soft-button" type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); void review(candidate, 'rejected').finally(() => setBusy(false)); }}>Reject</button><button className="danger-button" type="button" disabled={busy} onClick={() => void deleteCandidate(candidate)}>Delete</button></div>
        </article>;
      })}
    </section>
    <p className="form-footnote">Customer consent comes from the tenant's separate site and is never preselected there. If a customer opted in, the local-learning choice is preselected here for review. Tenant authorization is separate, and manual review is still required. Draft generation and dataset export do not change model weights.</p>
  </>;
}
