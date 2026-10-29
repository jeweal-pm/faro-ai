'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Filter, LayoutGrid, LoaderCircle, Pencil, Send, Table2, X } from 'lucide-react';
import { getPromptTenant, gisPromptRequest } from './actions';

type Tenant = { id: string; name: string; status: string };
type PurchaseOrderLine = { product_name: string; sku: string; quantity: number | null; unit_price: number | null; line_total: number | null };
type PurchaseOrderDisplay = {
  po_number: string; supplier_name: string; status: string; date: string | null; delivery_date: string | null;
  line_count: number; total_quantity: number | null; total_amount: number | null; lines: PurchaseOrderLine[];
  filtered?: boolean; filter_label?: string;
};
type Message = { role: 'user' | 'assistant'; text: string; purchaseOrders?: PurchaseOrderDisplay[]; sourcePurchaseOrders?: PurchaseOrderDisplay[]; language?: 'th' | 'en'; historyAfter?: ModelMessage[] };
type PendingConfirmation = { draft_id: string; kind: 'create_purchase_order' | 'receive_inventory'; preview: Record<string, unknown>; expires_in_seconds: number };
type ModelMessage = Record<string, unknown>;
type ApiResult<T> = { success: boolean; data?: T; error?: string; message?: string };

type PoLineFilter = { field: 'unit_price' | 'quantity' | 'line_total'; operator: '<' | '<=' | '>' | '>=' | '='; value: number; label: string };

function parsePoLineFilter(prompt: string): PoLineFilter | null {
  const normalized = prompt.trim().replaceAll(',', '');
  const comparison = normalized.match(/<=|>=|≤|≥|<|>|\b(?:not more than|no greater than|not greater than|not less than|not higher than|not lower than|no higher than|no lower than|at most|no more than|not over|up to|less than|lower than|below|under|cheaper than|at least|no less than|greater than|higher than|more than|above|over)\b|(?:ไม่เกิน|ไม่มากกว่า|น้อยกว่า|ต่ำกว่า|ไม่น้อยกว่า|อย่างน้อย|มากกว่า|สูงกว่า|เกิน)/i);
  if (!comparison || comparison.index === undefined) return null;
  const valueMatch = normalized.slice(comparison.index + comparison[0].length).match(/^\s*(?:[$€£]\s*)?(\d+(?:\.\d+)?)/);
  if (!valueMatch) return null;
  const value = Number(valueMatch[1]);
  if (!Number.isFinite(value)) return null;

  const operatorText = comparison[0].toLowerCase();
  let operator: PoLineFilter['operator'];
  if (operatorText === '<' || operatorText === '≤' || /^(?:not more than|no greater than|not greater than|not higher than|no higher than|at most|no more than|not over|up to|ไม่เกิน|ไม่มากกว่า)$/.test(operatorText)) operator = operatorText === '<' ? '<' : '<=';
  else if (operatorText === '>' || /^(?:not less than|not lower than|no lower than|at least|no less than|ไม่น้อยกว่า|อย่างน้อย)$/.test(operatorText)) operator = operatorText === '>' ? '>' : '>=';
  else if (operatorText === '<=') operator = '<=';
  else if (operatorText === '>=') operator = '>=';
  else if (/^(?:greater than|higher than|more than|above|over|มากกว่า|สูงกว่า|เกิน)$/.test(operatorText)) operator = '>';
  else operator = '<';

  const context = normalized.slice(0, comparison.index).toLowerCase();
  const field: PoLineFilter['field'] = /(?:line\s*(?:total|amount)|total\s*per\s*line|ยอดต่อรายการ|ยอดรวมต่อรายการ)/i.test(context)
    ? 'line_total'
    : /(?:\b(?:qty|quantity|units)\b|\bnumber\s+of\s+units\b|จำนวน)/i.test(context)
      ? 'quantity'
      : 'unit_price';
  return { field, operator, value, label: `${field === 'unit_price' ? 'Unit price' : field === 'quantity' ? 'Quantity' : 'Line amount'} ${operator} ${formatPoNumber(value)}` };
}

function applyPoLineFilter(orders: PurchaseOrderDisplay[], filter: PoLineFilter): PurchaseOrderDisplay[] {
  return orders.map((order) => {
    const lines = order.lines.filter((line) => {
      const candidate = line[filter.field];
      if (candidate === null || !Number.isFinite(candidate)) return false;
      if (filter.operator === '<') return candidate < filter.value;
      if (filter.operator === '<=') return candidate <= filter.value;
      if (filter.operator === '>') return candidate > filter.value;
      if (filter.operator === '>=') return candidate >= filter.value;
      return candidate === filter.value;
    });
    const quantityKnown = lines.every((line) => line.quantity !== null);
    const amountKnown = lines.every((line) => line.line_total !== null);
    return {
      ...order,
      lines,
      line_count: lines.length,
      total_quantity: quantityKnown ? lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0) : null,
      total_amount: amountKnown ? lines.reduce((sum, line) => sum + (line.line_total ?? 0), 0) : null,
      filtered: true,
      filter_label: filter.label,
    };
  });
}

function localizePoFilterLabel(filter: PoLineFilter, language: 'th' | 'en') {
  if (language === 'en') return filter.label;
  const field = filter.field === 'unit_price' ? 'ราคาต่อหน่วย' : filter.field === 'quantity' ? 'จำนวน' : 'ยอดต่อรายการ';
  const operator = filter.operator === '<' ? 'น้อยกว่า' : filter.operator === '<=' ? 'ไม่เกิน' : filter.operator === '>' ? 'มากกว่า' : filter.operator === '>=' ? 'อย่างน้อย' : 'เท่ากับ';
  return `${field} ${operator} ${formatPoNumber(filter.value)}`;
}

function isPoContextFollowUp(prompt: string) {
  if (/\b(?:create|make|raise|receive|approve|cancel)\b|(?:สร้าง|เปิด|รับสินค้า|รับของ|อนุมัติ|ยกเลิก)/i.test(prompt)) return false;
  return /\b(?:only|filter|under|over|below|above|less|more|price|quantity|qty|items?|lines?|those|these|them|status|supplier|sort)\b|(?:เฉพาะ|กรอง|ต่ำกว่า|มากกว่า|ไม่เกิน|อย่างน้อย|จำนวน|รายการ|สินค้า|ราคา|สถานะ|ผู้ขาย|เรียง)/i.test(prompt);
}

function formatPoNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatPoDate(value: string | null) {
  if (!value) return '—';
  return value.includes('T') ? value.slice(0, value.indexOf('T')) : value;
}

function formatPoStatus(value: string, language: 'th' | 'en') {
  if (language !== 'th') return value || 'Status unavailable';
  const status = value.trim().toLowerCase();
  if (status.includes('pending')) return 'รออนุมัติ';
  if (status.includes('approved')) return 'อนุมัติแล้ว';
  if (status.includes('completed')) return 'เสร็จสมบูรณ์';
  if (status.includes('cancel')) return 'ยกเลิก';
  return value || 'ไม่ระบุสถานะ';
}

type PurchaseOrderView = 'cards' | 'table';

function PurchaseOrderResults({
  orders, language, view, onViewChange,
}: {
  orders: PurchaseOrderDisplay[];
  language: 'th' | 'en';
  view: PurchaseOrderView;
  onViewChange: (view: PurchaseOrderView) => void;
}) {
  const th = language === 'th';
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterField, setFilterField] = useState<PoLineFilter['field']>('unit_price');
  const [filterOperator, setFilterOperator] = useState<PoLineFilter['operator']>('<');
  const [filterValue, setFilterValue] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<PoLineFilter | null>(null);
  const visibleOrders = appliedFilter ? applyPoLineFilter(orders, appliedFilter) : orders;
  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(filterValue);
    if (!filterValue.trim() || !Number.isFinite(value) || value < 0) return;
    const base: PoLineFilter = { field: filterField, operator: filterOperator, value, label: '' };
    setAppliedFilter({ ...base, label: localizePoFilterLabel(base, language) });
  }
  return <div className="procurement-po-results">
    <div className="procurement-po-view-toolbar" role="group" aria-label={th ? 'รูปแบบการแสดงผล' : 'Result display mode'}>
      <button type="button" className={`procurement-po-view-button procurement-po-filter-toggle${filterOpen ? ' is-active' : ''}`} onClick={() => setFilterOpen((open) => !open)} aria-label={th ? 'เปิดตัวกรองรายการ PO' : 'Open PO line filters'} aria-expanded={filterOpen} title={th ? 'กรองรายการ' : 'Filter line items'}>
        <Filter size={16} aria-hidden="true" />
      </button>
      <span>{th ? 'แสดงเป็น' : 'View as'}</span>
      <button type="button" className={`procurement-po-view-button${view === 'cards' ? ' is-active' : ''}`} onClick={() => onViewChange('cards')} aria-label={th ? 'แสดงสินค้าเป็นการ์ด' : 'Show line items as product cards'} aria-pressed={view === 'cards'} title={th ? 'การ์ดสินค้า' : 'Product cards'}>
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      <button type="button" className={`procurement-po-view-button${view === 'table' ? ' is-active' : ''}`} onClick={() => onViewChange('table')} aria-label={th ? 'แสดงเป็นตาราง' : 'Show line items as a table'} aria-pressed={view === 'table'} title={th ? 'ตาราง' : 'Table'}>
        <Table2 size={16} aria-hidden="true" />
      </button>
    </div>
    {filterOpen && <form className="procurement-po-filter-panel" onSubmit={applyFilter}>
      <label>{th ? 'กรองตาม' : 'Filter by'}<select value={filterField} onChange={(event) => setFilterField(event.target.value as PoLineFilter['field'])}>
        <option value="unit_price">{th ? 'ราคาต่อหน่วย' : 'Unit price'}</option>
        <option value="quantity">{th ? 'จำนวน' : 'Quantity'}</option>
        <option value="line_total">{th ? 'ยอดต่อรายการ' : 'Line amount'}</option>
      </select></label>
      <label>{th ? 'เงื่อนไข' : 'Condition'}<select value={filterOperator} onChange={(event) => setFilterOperator(event.target.value as PoLineFilter['operator'])}>
        <option value="<">&lt; {th ? 'น้อยกว่า' : 'less than'}</option><option value="<=">≤ {th ? 'ไม่เกิน' : 'at most'}</option>
        <option value="=">= {th ? 'เท่ากับ' : 'equals'}</option><option value=">=">≥ {th ? 'อย่างน้อย' : 'at least'}</option>
        <option value=">">&gt; {th ? 'มากกว่า' : 'greater than'}</option>
      </select></label>
      <label>{th ? 'ค่า' : 'Value'}<input type="number" min="0" step="any" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} required /></label>
      <div className="procurement-po-filter-actions"><button className="primary-button compact" type="submit">{th ? 'ใช้ตัวกรอง' : 'Apply filter'}</button>
        {appliedFilter && <button className="secondary-button compact" type="button" onClick={() => { setAppliedFilter(null); setFilterValue(''); }}>{th ? 'ล้าง' : 'Clear'}</button>}
      </div>
    </form>}
    {visibleOrders.map((order, index) => <section className="procurement-po-card" key={`${order.po_number}-${index}`} aria-label={`${th ? 'ใบสั่งซื้อ' : 'Purchase order'} ${order.po_number}`}>
      <div className="procurement-po-topline">
        <div><span className="procurement-po-eyebrow">{th ? 'ใบสั่งซื้อ' : 'PURCHASE ORDER'}</span><h3>{order.po_number}</h3></div>
        <span className="procurement-po-status">{formatPoStatus(order.status, language)}</span>
      </div>
      {order.filter_label && <p className="procurement-po-filter">{th ? 'ตัวกรอง' : 'Filter'} · {order.filter_label}</p>}
      <dl className="procurement-po-meta">
        <div><dt>{th ? 'ผู้ขาย' : 'Supplier'}</dt><dd>{order.supplier_name || '—'}</dd></div>
        <div><dt>{th ? 'วันที่' : 'Date'}</dt><dd>{formatPoDate(order.date)}</dd></div>
        {order.delivery_date && <div><dt>{th ? 'กำหนดส่ง' : 'Delivery'}</dt><dd>{formatPoDate(order.delivery_date)}</dd></div>}
      </dl>
      {view === 'cards' ? <div className="procurement-po-item-grid">
        {order.lines.length ? order.lines.map((line, lineIndex) => <article className="procurement-po-item-card" key={`${line.sku}-${lineIndex}`}>
          <h4>{line.product_name || (th ? 'ไม่ระบุชื่อสินค้า' : 'Unnamed product')}</h4>
          <p className="procurement-po-item-sku">{th ? 'SKU' : 'SKU'} · {line.sku || '—'}</p>
          <dl>
            <div><dt>{th ? 'จำนวน' : 'Quantity'}</dt><dd>{formatPoNumber(line.quantity)}</dd></div>
            <div><dt>{th ? 'ราคาต่อหน่วย' : 'Unit price'}</dt><dd>{formatPoNumber(line.unit_price)}</dd></div>
            <div className="is-total"><dt>{th ? 'รวม' : 'Amount'}</dt><dd>{formatPoNumber(line.line_total)}</dd></div>
          </dl>
        </article>) : <p className="procurement-po-empty">{th ? 'ไม่พบรายการที่ตรงกับตัวกรองนี้' : 'No line items match this filter.'}</p>}
      </div> : <div className="procurement-po-table-wrap">
        <table className="procurement-po-table">
          <thead><tr>
            <th scope="col">{th ? 'สินค้า' : 'Product'}</th>
            <th scope="col">SKU</th>
            <th scope="col" className="numeric">{th ? 'จำนวน' : 'Qty'}</th>
            <th scope="col" className="numeric">{th ? 'ราคาต่อหน่วย' : 'Unit price'}</th>
            <th scope="col" className="numeric">{th ? 'รวม' : 'Amount'}</th>
          </tr></thead>
          <tbody>{order.lines.length ? order.lines.map((line, lineIndex) => <tr key={`${line.sku}-${lineIndex}`}>
            <td className="procurement-po-product">{line.product_name || (th ? 'ไม่ระบุชื่อสินค้า' : 'Unnamed product')}</td>
            <td className="procurement-po-sku">{line.sku || '—'}</td>
            <td className="numeric">{formatPoNumber(line.quantity)}</td>
            <td className="numeric">{formatPoNumber(line.unit_price)}</td>
            <td className="numeric procurement-po-line-total">{formatPoNumber(line.line_total)}</td>
          </tr>) : <tr><td colSpan={5} className="procurement-po-empty">{th ? 'ไม่พบรายการที่ตรงกับตัวกรองนี้' : 'No line items match this filter.'}</td></tr>}</tbody>
          <tfoot><tr>
            <th scope="row" colSpan={2}>{order.filtered ? (th ? 'รวมรายการที่ตรงเงื่อนไข' : 'Filtered total') : (th ? 'รวมทั้งหมด' : 'Total')}</th>
            <td className="numeric">{formatPoNumber(order.total_quantity)}</td>
            <td />
            <td className="numeric procurement-po-grand-total">{formatPoNumber(order.total_amount)}</td>
          </tr></tfoot>
        </table>
      </div>}
      <p className="procurement-po-footnote">{order.filtered
        ? (th ? `พบ ${order.line_count} รายการที่ตรงเงื่อนไข` : `${order.line_count} matching line items`)
        : (th ? `ทั้งหมด ${order.line_count} รายการ` : `${order.line_count} line items`)}</p>
    </section>)}
  </div>;
}

async function api<T>(tenantId: string, path: string, body: unknown): Promise<ApiResult<T>> {
  return await gisPromptRequest<T>(tenantId, path, body);
}

function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !(/(^id$|_id$|^main_po_product_id$|^product_id$)/i.test(key)))
    .map(([key, child]) => [key, stripIds(child)]));
}

export default function ProcurementAssistant({ initialPrompt, onCancel }: { initialPrompt: string; onCancel: () => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>(initialPrompt ? [{ role: 'user', text: initialPrompt }] : []);
  const [modelHistory, setModelHistory] = useState<ModelMessage[]>([]);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [input, setInput] = useState('');
  const [purchaseOrderView, setPurchaseOrderView] = useState<PurchaseOrderView>('cards');
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void getPromptTenant().then((result) => {
      if (!result.ok) setError(result.message);
      else {
        setTenants([{ ...result.tenant, status: 'active' }]);
        setTenantId(result.tenant.id);
      }
      setLoaded(true);
    }).catch(() => { setError('The configured GIS tenant could not be loaded.'); setLoaded(true); });
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy, pending]);
  useEffect(() => { if (editingMessageIndex !== null) composerRef.current?.focus(); }, [editingMessageIndex]);

  useEffect(() => {
    if (!loaded || !tenantId || !initialPrompt.trim() || started.current) return;
    started.current = true;
    void send(initialPrompt, true);
  // The first prompt is deliberately submitted once after the active tenant is known.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, tenantId, initialPrompt]);

  async function send(message: string, alreadyShown = false, context?: { baseMessages: Message[]; history: ModelMessage[] }) {
    const normalized = message.trim();
    if (!normalized || !tenantId || busy) return;
    const baseMessages = context?.baseMessages ?? messages;
    const historyForRequest = context?.history ?? modelHistory;
    const latestPoMessageIndex = baseMessages.reduce((latest, item, index) => item.role === 'assistant' && item.purchaseOrders?.length ? index : latest, -1);
    const latestPoMessage = latestPoMessageIndex >= 0 ? baseMessages[latestPoMessageIndex] : undefined;
    const displayedOrders = latestPoMessage?.purchaseOrders;
    const previousOrders = latestPoMessage?.sourcePurchaseOrders ?? displayedOrders;
    const followUpFilter = parsePoLineFilter(normalized);
    let transcriptBaseMessages = baseMessages;
    if (!context && previousOrders?.length && followUpFilter && isPoContextFollowUp(normalized)
      && displayedOrders?.some((order) => order.filtered)) {
      let precedingUserIndex = -1;
      for (let index = latestPoMessageIndex - 1; index >= 0; index -= 1) {
        if (baseMessages[index].role === 'user') { precedingUserIndex = index; break; }
      }
      if (precedingUserIndex >= 0) transcriptBaseMessages = baseMessages.slice(0, precedingUserIndex);
    }
    const messagePrefix: Message[] = context
      ? [...baseMessages, { role: 'user', text: normalized }]
      : alreadyShown ? messages : [...transcriptBaseMessages, { role: 'user', text: normalized }];
    if (previousOrders?.length && followUpFilter && isPoContextFollowUp(normalized)) {
      setMessages([...messagePrefix]);
      setInput(''); setError(''); setPending(null);
      const language = /[\u0E00-\u0E7F]/.test(normalized) ? 'th' : 'en';
      const filter = { ...followUpFilter, label: localizePoFilterLabel(followUpFilter, language) };
      const filteredOrders = applyPoLineFilter(previousOrders, filter);
      const matchedCount = filteredOrders.reduce((sum, order) => sum + order.line_count, 0);
      const answer = language === 'th'
        ? `พบ ${matchedCount} รายการที่ตรงกับตัวกรอง ${filter.label}`
        : `Found ${matchedCount} line items matching ${filter.label}.`;
      setMessages([...messagePrefix, { role: 'assistant', text: answer, purchaseOrders: filteredOrders, sourcePurchaseOrders: previousOrders, language, historyAfter: historyForRequest }]);
      return;
    }
    setMessages([...messagePrefix]);
    setInput(''); setError(''); setBusy(true); setPending(null);
    setModelHistory(historyForRequest);
    try {
      const result = await api<{
        answer: string; history: ModelMessage[]; pending_confirmation?: PendingConfirmation | null;
        purchase_orders?: PurchaseOrderDisplay[];
      }>(tenantId, `/tenants/${tenantId}/procurement/assistant`, { message: normalized, history: historyForRequest });
      if (!result.success || !result.data) throw new Error(result.message ?? 'FaroAI could not complete the procurement request.');
      setModelHistory(result.data.history ?? []);
      const returnedOrders = Array.isArray(result.data.purchase_orders) ? result.data.purchase_orders : [];
      const purchaseOrders = returnedOrders.length
        ? returnedOrders
        : displayedOrders?.length && isPoContextFollowUp(normalized) ? displayedOrders : [];
      setMessages((current) => [...current, {
        role: 'assistant', text: result.data!.answer, purchaseOrders,
        sourcePurchaseOrders: returnedOrders.length ? undefined : latestPoMessage?.sourcePurchaseOrders ?? displayedOrders,
        language: /[\u0E00-\u0E7F]/.test(normalized) ? 'th' : 'en',
        historyAfter: result.data!.history ?? historyForRequest,
      }]);
      setPending(result.data.pending_confirmation ?? null);
    } catch (requestError) {
      const messageText = requestError instanceof Error ? requestError.message : 'FaroAI could not complete the procurement request.';
      setError(messageText);
      setMessages((current) => [...current, { role: 'assistant', text: messageText }]);
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!tenantId || !pending || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<{
        answer?: string; kind?: string; outcome?: Record<string, unknown>;
        pending_confirmation?: PendingConfirmation;
      }>(tenantId, `/tenants/${tenantId}/procurement/confirm`, { draft_id: pending.draft_id });
      if (!result.success || !result.data) throw new Error(result.message ?? 'GIS did not confirm this operation. Check GIS before retrying.');
      setMessages((current) => [...current, { role: 'assistant', text: result.data!.answer ?? 'GIS confirmed the operation.' }]);
      setPending(result.data.pending_confirmation ?? null);
    } catch (requestError) {
      const messageText = requestError instanceof Error ? requestError.message : 'GIS could not confirm this operation.';
      setError(messageText);
      setMessages((current) => [...current, { role: 'assistant', text: messageText }]);
      setPending(null);
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingMessageIndex !== null) {
      const baseMessages = messages.slice(0, editingMessageIndex);
      const history = [...baseMessages].reverse().find((message) => message.role === 'assistant')?.historyAfter ?? [];
      setEditingMessageIndex(null);
      void send(input, true, { baseMessages, history });
      return;
    }
    void send(input);
  }

  function editPrompt(index: number) {
    const message = messages[index];
    if (busy || message?.role !== 'user') return;
    setInput(message.text);
    setEditingMessageIndex(index);
  }

  function cancelPromptEdit() {
    setEditingMessageIndex(null);
    setInput('');
  }

  const latestUserMessageIndex = messages.reduce((latest, message, index) => message.role === 'user' ? index : latest, -1);

  return <section className="catalog-results procurement-assistant" aria-label="GIS purchase orders and inventory">
    <div className="procurement-heading">
      <div><p className="eyebrow">GIS PROCUREMENT</p><h2>Purchase orders & inventory</h2><p>Ask in Thai or English. FaroAI will check GIS data and pause for review before any write.</p></div>
      <button className="secondary-button" type="button" onClick={onCancel} disabled={busy} aria-label="Close procurement assistant"><X size={16} /> Close</button>
    </div>
    {tenants.length > 1 && <label className="procurement-tenant">Tenant<select value={tenantId} onChange={(event) => setTenantId(event.target.value)} required disabled={busy || messages.length > (initialPrompt ? 1 : 0)}>
      <option value="">Choose tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
    </select></label>}
    {!loaded && <p className="shopping-loading" role="status"><LoaderCircle className="spin" size={16} /> Connecting to the configured GIS workspace…</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    <div className="procurement-transcript" ref={scrollRef} aria-live="polite">
      {messages.map((message, index) => <article className={`procurement-message ${message.role}${message.purchaseOrders?.length ? ' has-po-results' : ''}`} key={`${index}-${message.role}`}>
        {message.role === 'user'
          ? <div className="procurement-user-heading"><strong>You</strong>
            {index === latestUserMessageIndex && <button className="procurement-edit-prompt" type="button" onClick={() => editPrompt(index)} disabled={busy} aria-label="Edit latest prompt"><Pencil size={12} /> Edit</button>}
          </div>
          : <strong>FaroAI</strong>}
        {message.role === 'assistant' && message.purchaseOrders?.length
          ? <>
            {message.text && message.text.length <= 240 && !/(?:\*\*|Item Name:|Unit Price:|Quantity:)/i.test(message.text)
              && <p className="procurement-po-answer">{message.text}</p>}
            <PurchaseOrderResults orders={message.purchaseOrders} language={message.language ?? 'en'} view={purchaseOrderView} onViewChange={setPurchaseOrderView} />
          </>
          : <p>{editingMessageIndex === index ? 'Editing this prompt below.' : message.text}</p>}
      </article>)}
      {busy && <p className="shopping-loading" role="status"><LoaderCircle className="spin" size={16} /> Checking GIS and preparing the next step…</p>}
      {pending && <div className="procurement-preview">
        <div><p className="eyebrow">GIS PREVIEW · {pending.kind === 'create_purchase_order' ? 'PO · PENDING APPROVAL' : 'INVENTORY RECEIPT · PENDING APPROVAL'}</p>
          <p>AI-generated prices, dates, quantities, and master selections are proposals. Review the GIS-verified details below; edit them by sending a correction, or confirm this exact operation to send it to GIS.</p></div>
        <pre>{JSON.stringify(stripIds(pending.preview), null, 2)}</pre>
        <button className="primary-button compact" type="button" onClick={() => void confirm()} disabled={busy}><Check size={15} /> Confirm and send to GIS</button>
      </div>}
    </div>
    <form className="procurement-composer" onSubmit={submit}>
      <textarea ref={composerRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={1500} rows={2}
        placeholder="เช่น ช่วยสร้าง PO แหวน ABC 5 วง / Create a PO for 5 rings, model ABC" disabled={busy || !tenantId} />
      {editingMessageIndex !== null && <button className="secondary-button compact procurement-cancel-edit" type="button" onClick={cancelPromptEdit} disabled={busy}>Cancel edit</button>}
      <button className="primary-button compact" type="submit" disabled={busy || !tenantId || !input.trim()} aria-label={editingMessageIndex !== null ? 'Save and resend edited prompt' : 'Send procurement request'}>
        {busy ? <LoaderCircle className="spin" size={15} /> : editingMessageIndex !== null ? <Check size={15} /> : <Send size={15} />} {editingMessageIndex !== null ? 'Save & resend' : 'Send'}
      </button>
    </form>
  </section>;
}
