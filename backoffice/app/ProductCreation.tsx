'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { getPromptTenant, gisPromptRequest } from './actions';

type Tenant = { id: string; name: string; status: string };
type ApiResult<T> = { success: boolean; data?: T; error?: string; message?: string };
type Master = { id: string; name: string; code?: string };
type Draft = {
  name: string; Matatag: string; Description: string; product_tags: string;
  item_hint?: string | null; stone_hint?: string | null; status: '0' | '1'; product_variants_enable: '0';
  SKU: string; ID: string; item: string; item_id: string; stone: string; stone_id: string;
  preview?: { valid?: boolean; can_create?: boolean; warnings?: unknown[]; errors?: unknown[] };
  outcome?: string;
};
const PRODUCT_BATCH_SIZE = 20;
const PRODUCT_PAGE_SIZE = 20;

async function api<T>(tenantId: string, path: string, body: unknown): Promise<ApiResult<T>> {
  const timeoutMs = path.endsWith('/product-creation/drafts') ? 15 * 60_000 : 125_000;
  return await gisPromptRequest<T>(tenantId, path, body, timeoutMs);
}

function exactMaster(masters: Master[], hint?: string | null) {
  const normalize = (value: string) => value.trim().replace(/\s*\(AI\)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/ies$/, 'y').replace(/s$/, '');
  const normalized = hint ? normalize(hint) : '';
  const matches = normalized ? masters.filter((item) => normalize(item.name) === normalized || (!!item.code && normalize(item.code) === normalized)) : [];
  return matches.length === 1 ? matches[0] : undefined;
}

function requestedItemMaster(prompt: string, masters: Master[]) {
  const requestedTypes: Array<{ pattern: RegExp; master: string }> = [
    { pattern: /\b(?:rings?|wedding bands?)\b|แหวน/i, master: 'Ring' },
    { pattern: /\b(?:necklaces?)\b|สร้อยคอ/i, master: 'Necklace' },
    { pattern: /\b(?:bracelets?|bangles?)\b|สร้อยข้อมือ/i, master: 'Bracelet' },
    { pattern: /\b(?:earrings?|hoops?)\b|ต่างหู/i, master: 'Earring' },
    { pattern: /\b(?:pendants?)\b|จี้/i, master: 'Pendant' },
    { pattern: /\b(?:anklets?)\b|สร้อยข้อเท้า/i, master: 'Anklet' },
  ];
  const requested = requestedTypes.find((entry) => entry.pattern.test(prompt));
  return requested ? exactMaster(masters, requested.master) : undefined;
}

function countFromPrompt(value: string): number | undefined {
  const match = value.match(/\b(?:add|create|make|generate)\s+(?:exactly\s+)?([\d,]+)\b|\b([\d,]+)\s*(?:unique\s+)?(?:products?|pieces|items|pcs|rings?|necklaces?|bracelets?|earrings?)\b|\b([\d,]+)\s*ชิ้น|ชิ้น\s*([\d,]+)/i);
  const found = match?.slice(1).find(Boolean);
  return found ? Math.max(1, Number(found.replace(/,/g, ''))) : undefined;
}

function withAiMarker(value: string, maxLength?: number) {
  const marker = '(AI)';
  const clean = value.trim().replace(/\s*\(AI\)$/i, '');
  const available = maxLength ? maxLength - marker.length - 1 : undefined;
  const content = available ? Array.from(clean).slice(0, available).join('').trimEnd() : clean;
  return `${content} ${marker}`;
}

export default function ProductCreation({ tenants: initialTenants, promptText, onCancel }: { tenants?: Tenant[]; promptText?: string; onCancel?: () => void }) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants ?? []);
  const [tenantLoadError, setTenantLoadError] = useState('');
  const [tenantsLoaded, setTenantsLoaded] = useState(!!initialTenants);
  const [tenantId, setTenantId] = useState(initialTenants?.find((tenant) => tenant.status === 'active')?.id ?? '');
  const [prompt, setPrompt] = useState(promptText ?? '');
  const [count, setCount] = useState(String(countFromPrompt(promptText ?? '') ?? 1));
  const [items, setItems] = useState<Draft[]>([]);
  const [itemMasters, setItemMasters] = useState<Master[]>([]);
  const [stoneMasters, setStoneMasters] = useState<Master[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; completed: number; total: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const embedded = promptText !== undefined;
  const autoStarted = useRef(false);
  const generationAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialTenants) return;
    void getPromptTenant().then((result) => {
      if (!result.ok) setTenantLoadError(result.message);
      else {
        const configured = { ...result.tenant, status: 'active' };
        setTenants([configured]);
        setTenantId(configured.id);
      }
      setTenantsLoaded(true);
    }).catch(() => {
      setTenantLoadError('The configured GIS tenant could not be loaded.');
      setTenantsLoaded(true);
    });
  }, [initialTenants]);

  useEffect(() => {
    if (!tenants.some((tenant) => tenant.id === tenantId && tenant.status === 'active')) {
      setTenantId(tenants.find((tenant) => tenant.status === 'active')?.id ?? '');
    }
  }, [tenants, tenantId]);

  function update(index: number, changes: Partial<Draft>) {
    setItems((current) => current.map((item, position) => position === index
      ? { ...item, ...changes, preview: undefined, outcome: undefined }
      : item));
    setConfirmed(false);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await generateFor(tenantId, prompt, Number(count));
  }

  async function generateFor(selectedTenantId: string, requestedPrompt: string, amount: number) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      setError('Choose a product count from 1 to 1,000.');
      return;
    }
    setBusy(true); setError(''); setNotice(''); setItems([]); setConfirmed(false); setPageIndex(0);
    setProgress({ phase: embedded ? 'Preparing products for GIS' : 'Loading verified GIS masters', completed: 0, total: amount });
    let generatedItems: Draft[] = [];
    const controller = new AbortController();
    generationAbort.current = controller;
    try {
      const masters = await api<{ masters: Record<string, Master[]> }>(selectedTenantId, `/tenants/${selectedTenantId}/product-creation/tool`, {
        action: 'masters', types: ['item', 'stone'],
      });
      if (!masters.success || !masters.data) throw new Error(masters.message ?? 'GIS product master data could not be loaded.');
      const itemList = masters.data.masters?.item ?? [];
      const stoneList = masters.data.masters?.stone ?? [];
      setItemMasters(itemList); setStoneMasters(stoneList);
      for (let offset = 0; offset < amount; offset += PRODUCT_BATCH_SIZE) {
        if (controller.signal.aborted) throw new DOMException('Generation stopped', 'AbortError');
        const batchIndex = Math.floor(offset / PRODUCT_BATCH_SIZE);
        const batchCount = Math.min(PRODUCT_BATCH_SIZE, amount - offset);
        setProgress({ phase: embedded ? 'Creating products in GIS' : 'Generating creative product concepts', completed: offset, total: amount });
        const result = await api<{ drafts: Array<Omit<Draft, 'item' | 'item_id' | 'stone' | 'stone_id'>> }>(
          selectedTenantId, `/tenants/${selectedTenantId}/product-creation/drafts`, {
            prompt: requestedPrompt, count: batchCount, batch_index: batchIndex,
            avoid_names: generatedItems.slice(-60).map((draft) => draft.name),
          },
        );
        if (!result.success || !result.data) throw new Error(result.message ?? 'AI product drafts could not be generated.');
        const batchItems = result.data.drafts.map((draft) => {
          const item = requestedItemMaster(requestedPrompt, itemList) ?? exactMaster(itemList, draft.item_hint);
          const stone = exactMaster(stoneList, draft.stone_hint);
          return { ...draft, Matatag: withAiMarker(draft.Matatag), Description: withAiMarker(draft.Description, 500), item: item?.name ?? '', item_id: item?.id ?? '', stone: stone?.name ?? '', stone_id: stone?.id ?? '' };
        });
        const existingCodes = new Set(generatedItems.flatMap((draft) => [draft.SKU, draft.ID]));
        const batchCodes = batchItems.flatMap((draft) => [draft.SKU, draft.ID]);
        if (new Set(batchCodes).size !== batchCodes.length || batchCodes.some((code) => existingCodes.has(code))) {
          throw new Error('FAROAI generated a duplicate SKU or Product ID. No products were created; regenerate the batch before previewing.');
        }
        generatedItems = [...generatedItems, ...batchItems];
        setProgress({ phase: embedded ? 'Creating products in GIS' : 'Generating creative product concepts', completed: generatedItems.length, total: amount });
      }
      const creditsUsed = Math.ceil(amount / PRODUCT_BATCH_SIZE);
      if (embedded) {
        if (controller.signal.aborted)
          throw new DOMException('Product creation was stopped before GIS submission.', 'AbortError');
        setProgress({ phase: 'Creating products in GIS', completed: 0, total: generatedItems.length });
        const queued = await api<{ job_id: string; status: string; item_count: number }>(selectedTenantId,
          `/tenants/${selectedTenantId}/product-creation/tool`, {
            action: 'bulk_create', products: generatedItems.map((draft) => payload(draft)),
          });
        if (!queued.success || !queued.data?.job_id) throw new Error(queued.message ?? 'GIS could not accept the product batch. No products were created.');
        let completed = false;
        for (let attempt = 0; attempt < 240; attempt += 1) {
          if (controller.signal.aborted) throw new DOMException('Creation stopped; check GIS job status before retrying', 'AbortError');
          const status = await api<{ status: string; total: number; progress: number; succeeded: number; failed: number; results?: Array<{ index: number; status: string; error?: string | null }> }>(
            selectedTenantId, `/tenants/${selectedTenantId}/product-creation/tool`, {
              action: 'bulk_status', job_id: queued.data.job_id, offset: 0, limit: 100,
            },
          );
          if (!status.success || !status.data) throw new Error(status.message ?? `GIS accepted job ${queued.data.job_id}, but its status could not be read. Check GIS before retrying.`);
          setProgress({ phase: 'Creating products in GIS', completed: status.data.progress, total: status.data.total });
          if (['completed', 'partial', 'failed'].includes(status.data.status)) {
            if (status.data.status !== 'completed' || status.data.succeeded !== amount || status.data.failed > 0) {
              throw new Error(`GIS finished job ${queued.data.job_id}: ${status.data.succeeded}/${status.data.total} products created, ${status.data.failed} failed. Do not retry the batch; check the job results in GIS.`);
            }
            setNotice(`GIS created all ${status.data.succeeded} products successfully. FAROAI used ${creditsUsed} AI ${creditsUsed === 1 ? 'credit' : 'credits'}.`);
            completed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (!completed) throw new Error(`GIS accepted job ${queued.data.job_id}, but it has not finished yet. Check this job in GIS; do not submit it again.`);
      } else {
        setItems(generatedItems);
        setNotice(`Created ${generatedItems.length} creative drafts. FAROAI generated SKU and Product ID values and matched available GIS item masters. Review the batch before previewing. (${creditsUsed} AI ${creditsUsed === 1 ? 'credit' : 'credits'} used.)`);
      }
    } catch (failure) {
      const canceled = failure instanceof Error && failure.name === 'AbortError';
      const reason = canceled ? 'The operation was stopped; check GIS job status before retrying.' : failure instanceof Error ? failure.message : 'Product creation could not be completed.';
      setError(generatedItems.length
        ? `Prepared ${generatedItems.length} of ${amount} products. GIS creation starts only after the full batch is prepared. ${reason}`
        : reason);
    } finally { generationAbort.current = null; setProgress(null); setBusy(false); }
  }

  function payload(draft: Draft) {
    return {
      name: draft.name.trim(), SKU: draft.SKU.trim(), ID: draft.ID.trim(),
      Matatag: withAiMarker(draft.Matatag), Description: withAiMarker(draft.Description, 500),
      item: draft.item, item_id: draft.item_id, product_tags: draft.product_tags,
      status: draft.status, product_variants_enable: '0',
      ...(draft.stone_id ? { stones: [{ stone: draft.stone, stone_id: draft.stone_id }] } : {}),
    };
  }

  async function previewBatch() {
    setBusy(true); setError(''); setNotice(''); setConfirmed(false); setProgress({ phase: 'Checking GIS previews', completed: 0, total: items.length });
    try {
      const results: Array<{ result: ApiResult<Record<string, unknown>>; preview?: Draft['preview'] }> = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        const result = await api<Record<string, unknown>>(tenantId, `/tenants/${tenantId}/product-creation/tool`, {
          action: 'preview', product: payload(item),
        });
        results.push({ result, preview: (result.data ?? undefined) as Draft['preview'] });
        if ((index + 1) % 10 === 0 || index + 1 === items.length)
          setProgress({ phase: 'Checking GIS previews', completed: index + 1, total: items.length });
      }
      const updated = items.map((item, index) => ({ ...item, preview: results[index]?.preview ?? undefined, outcome: undefined }));
      setItems(updated);
      if (results.some(({ result, preview }) => !result.success || preview?.valid !== true || preview?.can_create === false)) {
        setError('At least one GIS preview needs correction. No product was created. Review the validation result on each item.');
      } else {
        setNotice('All GIS previews passed. Review the payloads, then confirm to create these products.');
      }
    } catch { setError('GIS preview could not be completed. No product was created.'); }
    finally { setProgress(null); setBusy(false); }
  }

  function startEmbeddedCreation() {
    if (!tenantId || busy || !tenantsLoaded) return;
    autoStarted.current = true;
    void generateFor(tenantId, prompt, Number(count));
  }

  function cancelCreation() {
    generationAbort.current?.abort();
    onCancel?.();
  }

  useEffect(() => {
    if (!embedded || !tenantsLoaded || tenants.length !== 1 || !tenantId || autoStarted.current) return;
    autoStarted.current = true;
    void generateFor(tenantId, prompt, Number(count));
  }, [embedded, tenantsLoaded, tenants, tenantId, prompt, count]);

  async function createBatch() {
    if (!confirmed || items.some((item) => item.preview?.valid !== true || item.preview?.can_create === false)) return;
    setBusy(true); setError(''); setNotice(''); setProgress({ phase: 'Creating products in GIS', completed: 0, total: items.length });
    const results = [...items];
    try {
      for (let index = 0; index < results.length; index += 1) {
        // A previous run may have been interrupted after GIS confirmed some rows.
        // Never replay rows whose successful GIS response is already in the UI.
        if (results[index]?.outcome?.startsWith('created')) continue;
        // An ambiguous MCP response may have committed remotely. Require an
        // explicit operator verification before that row can be sent again.
        if (results[index]?.outcome?.startsWith('failed — verify in GIS before retrying')) continue;
        if (results[index]?.outcome?.startsWith('verified absent in GIS'))
          results[index] = { ...results[index]!, outcome: undefined };
        const result = await api<Record<string, unknown>>(tenantId, `/tenants/${tenantId}/product-creation/tool`, {
          action: 'create', confirm: true, product: payload(results[index]!),
        });
        if (!result.success) {
          results[index] = { ...results[index]!, outcome: 'failed — verify in GIS before retrying' };
          setItems([...results]);
          setError(`${index} product(s) were created. This item failed; verify GIS before any retry. Remaining items were not attempted.${result.message ? ` ${result.message}` : ''}`);
          return;
        }
        const createdProduct = result.data?.product && typeof result.data.product === 'object'
          ? result.data.product as Record<string, unknown> : undefined;
        results[index] = { ...results[index]!, outcome: `created${createdProduct?.id ? ` · GIS ID ${String(createdProduct.id)}` : ''}` };
        setItems([...results]);
        if ((index + 1) % 10 === 0 || index + 1 === results.length)
          setProgress({ phase: 'Creating products in GIS', completed: index + 1, total: results.length });
      }
      const createdCount = results.filter((item) => item.outcome?.startsWith('created')).length;
      const unresolvedCount = results.filter((item) => item.outcome?.startsWith('failed — verify in GIS before retrying')).length;
      setNotice(unresolvedCount
        ? `GIS confirmed ${createdCount} products. ${unresolvedCount} ambiguous row(s) remain blocked until verified in GIS.`
        : `GIS confirmed creation of all ${createdCount} products. Previously confirmed rows were not sent again.`);
      setConfirmed(false);
    } catch {
      const completed = results.filter((item) => item.outcome?.startsWith('created')).length;
      setItems(results);
      setError(`${completed} product(s) were confirmed by GIS before the connection failed. Verify the remaining outcomes in GIS before retrying.`);
    } finally { setProgress(null); setBusy(false); }
  }

  const ready = items.length > 0 && items.every((item) => item.SKU.trim() && item.ID.trim() && Array.from(item.name.trim()).length >= 50 && Array.from(item.name.trim()).length <= 100 && item.Matatag.trim() && Array.from(item.Description.trim()).length >= 300 && Array.from(item.Description.trim()).length <= 500 && item.item_id);
  const allPreviewed = items.length > 0 && items.every((item) => item.preview?.valid === true && item.preview?.can_create !== false);
  const pageCount = Math.max(1, Math.ceil(items.length / PRODUCT_PAGE_SIZE));
  const pendingCreateCount = items.filter((item) => !item.outcome?.startsWith('created')
    && (!item.outcome || item.outcome.startsWith('verified absent in GIS'))).length;
  const estimatedCredits = Math.ceil(Number(count) / PRODUCT_BATCH_SIZE);
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageItems = items.slice(currentPage * PRODUCT_PAGE_SIZE, (currentPage + 1) * PRODUCT_PAGE_SIZE);

  return <>
    {!embedded && <div className="page-heading"><div><p className="eyebrow">GIS CATALOG OPERATIONS</p><h1>AI product creation</h1><p>Generate a creative product batch, review the AI-generated details, then confirm before writing to GIS.</p></div></div>}
    {embedded && <div className="product-prompt-heading"><div><p className="eyebrow">GIS PRODUCT REQUEST</p><h2>{prompt}</h2></div><button className="secondary-button" type="button" onClick={cancelCreation}>{busy ? 'Stop generation' : 'Cancel'}</button></div>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {tenantLoadError && <p className="admin-alert" role="alert">{tenantLoadError}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {progress && <p className="admin-notice" role="status">{progress.phase}: {progress.completed} of {progress.total}.</p>}
    {embedded && !tenantsLoaded && <p className="shopping-loading" role="status"><LoaderCircle size={16} className="spin" /> Connecting to the configured GIS workspace…</p>}
    {embedded && tenantsLoaded && tenants.length > 1 && <section className="panel product-create-panel">
      <label>Tenant for this GIS operation<select value={tenantId} onChange={(event) => setTenantId(event.target.value)} required>
        {tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}
      </select></label>
      {Number(count) > PRODUCT_BATCH_SIZE && <p className="form-footnote">This request runs as {estimatedCredits} separate batches of up to 20 products and uses {estimatedCredits} tenant credits.</p>}
      <button className="primary-button compact" type="button" disabled={!tenantId || busy || items.length > 0} onClick={startEmbeddedCreation}>{busy ? 'Working…' : Number(count) > PRODUCT_BATCH_SIZE ? `Generate ${count} drafts · ${estimatedCredits} credits` : 'Generate product drafts'}</button>
    </section>}
    {embedded && tenantsLoaded && tenants.length === 1 && Number(count) > PRODUCT_BATCH_SIZE && items.length === 0 && !busy && <p className="admin-notice" role="status">FaroAI will create {count} products directly in GIS using {estimatedCredits} AI credits.</p>}
    {!embedded && <section className="panel product-create-panel">
      <div className="panel-title"><h2>Describe the product batch</h2></div>
      {tenants.length === 0 ? <div className="empty-state"><p>Create an active tenant before creating GIS products.</p></div> : <form onSubmit={generate}>
        <div className="product-create-form">
          <label>Tenant<select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setItems([]); }} required>
            {tenants.filter((tenant) => tenant.status === 'active').map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}
          </select></label>
          <label>Number of products<input type="number" min="1" max="1000" step="1" value={count} onChange={(event) => setCount(event.target.value)} required /></label>
          <label className="product-prompt-field">Prompt<textarea value={prompt} onChange={(event) => { const next = event.target.value; setPrompt(next); const requestedCount = countFromPrompt(next); if (requestedCount) setCount(String(requestedCount)); }} placeholder="เพิ่มสินค้าเกี่ยวกับ ring 10 ชิ้น หรือ Add 10 diamond jewelry concepts for a modern collection" maxLength={1000} required /></label>
        </div>
        <p className="form-footnote">AI creates varied product concepts with 50–100 character names and 300–500 character descriptions. FAROAI assigns unique SKU/Product IDs and matches existing GIS item masters automatically. Test descriptions and tags carry an (AI) marker. Generation runs in batches of up to 20; each batch uses one tenant AI credit (1,000 products use 50 credits). Product drafts are previewed in GIS and require your confirmation before creation.</p>
        <button className="primary-button compact" disabled={busy || !tenantId}>{busy ? <><LoaderCircle className="spin" size={14} /> Working…</> : <><Sparkles size={14} /> Generate product drafts</>}</button>
      </form>}
    </section>}
    {items.length > 0 && <>
      {pageCount > 1 && <nav className="product-draft-pagination" aria-label="Draft pages"><span>{items.length} products · page {currentPage + 1} of {pageCount}</span><button className="secondary-button" type="button" disabled={currentPage === 0 || busy} onClick={() => setPageIndex(currentPage - 1)}>Previous</button><button className="secondary-button" type="button" disabled={currentPage + 1 >= pageCount || busy} onClick={() => setPageIndex(currentPage + 1)}>Next</button></nav>}
      <div className="product-draft-list">{pageItems.map((item, pageItemIndex) => { const index = currentPage * PRODUCT_PAGE_SIZE + pageItemIndex; return <article className="panel product-draft-card" key={`${index}-${item.name}`}>
        <div className="panel-title"><h2>Product {index + 1}</h2>{item.outcome && <span className="status-pill active">{item.outcome}</span>}{item.preview && <span className={`status-pill ${item.preview.valid && item.preview.can_create !== false ? 'active' : 'suspended'}`}>{item.preview.valid && item.preview.can_create !== false ? 'Preview passed' : 'Needs correction'}</span>}</div>
        <div className="product-draft-fields">
          <div className="product-generated-code"><span>SKU · generated by FAROAI</span><code>{item.SKU}</code></div>
          <div className="product-generated-code"><span>Product ID · generated by FAROAI</span><code>{item.ID}</code></div>
          <label>Product name (50–100 characters)<input value={item.name} onChange={(event) => update(index, { name: event.target.value })} minLength={50} maxLength={100} required /><small>{item.name.length}/100 characters</small></label>
          {item.item_id ? <div className="product-generated-code"><span>GIS item master · matched from GIS</span><code>{item.item}{itemMasters.find((master) => master.id === item.item_id)?.code ? ` · ${itemMasters.find((master) => master.id === item.item_id)?.code}` : ''}</code></div> : <label>GIS item master<select value={item.item_id} onChange={(event) => { const master = itemMasters.find((candidate) => candidate.id === event.target.value); update(index, { item_id: master?.id ?? '', item: master?.name ?? '' }); }} required><option value="">No exact GIS match — choose one</option>{itemMasters.map((master) => <option key={master.id} value={master.id}>{master.name}{master.code ? ` · ${master.code}` : ''}</option>)}</select></label>}
          {item.stone_hint && <label>GIS stone master<select value={item.stone_id} onChange={(event) => { const master = stoneMasters.find((candidate) => candidate.id === event.target.value); update(index, { stone_id: master?.id ?? '', stone: master?.name ?? '' }); }}><option value="">No verified stone selected</option>{stoneMasters.map((master) => <option key={master.id} value={master.id}>{master.name}{master.code ? ` · ${master.code}` : ''}</option>)}</select></label>}
          <label>Product tags<input value={item.product_tags} onChange={(event) => update(index, { product_tags: event.target.value })} maxLength={300} /></label>
          <label className="product-prompt-field">Matatag<input value={item.Matatag} onChange={(event) => update(index, { Matatag: event.target.value })} maxLength={500} required /></label>
          <label className="product-prompt-field">Description (300–500 characters)<textarea value={item.Description} onChange={(event) => update(index, { Description: event.target.value })} minLength={300} maxLength={500} required /><small>{item.Description.length}/500 characters</small></label>
          <label className="product-status-field">Status<select value={item.status} onChange={(event) => update(index, { status: event.target.value as '0' | '1' })}><option value="0">Inactive · recommended for review</option><option value="1">Active</option></select></label>
        </div>
        {item.preview?.warnings && <p className="form-footnote">GIS warnings: {JSON.stringify(item.preview.warnings)}</p>}
        {item.preview?.errors && <p className="admin-alert">GIS validation: {JSON.stringify(item.preview.errors)}</p>}
        {item.outcome?.startsWith('failed — verify in GIS before retrying') && <button className="secondary-button" type="button" disabled={busy} onClick={() => update(index, { outcome: 'verified absent in GIS — safe to retry' })}>I verified this SKU and Product ID are absent in GIS</button>}
      </article>; })}</div>
      <section className="panel product-batch-actions"><p className="form-footnote">Prices, costs, inventory, variant records and images are not included in this initial workflow. Products without location pricing may not appear in shopper search.</p>
        <button className="secondary-button" type="button" disabled={busy || !ready} onClick={() => void previewBatch()}>{busy ? 'Working…' : 'Preview all in GIS'}</button>
        {allPreviewed && <label className="product-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I reviewed the product details above and authorize GIS to create {pendingCreateCount} remaining products for {tenants.find((tenant) => tenant.id === tenantId)?.name}. Previously confirmed products will be skipped; ambiguous results stay blocked until verified.</label>}
        {allPreviewed && <button className="primary-button compact" type="button" disabled={busy || !confirmed || pendingCreateCount === 0} onClick={() => void createBatch()}>{busy ? 'Creating…' : `Confirm and create ${pendingCreateCount} remaining products`}</button>}
      </section>
    </>}
  </>;
}
