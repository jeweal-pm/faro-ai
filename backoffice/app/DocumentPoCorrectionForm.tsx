'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoaderCircle, Plus, Trash2 } from 'lucide-react';

export type DocumentPoCorrection = {
  supplierName: string;
  supplierCode: string;
  supplierAction: 'map_existing' | 'create_from_document';
  locationName: string;
  locationCode: string;
  locationAction: 'map_existing' | 'create_from_document';
  lines: Array<{ name: string; sku: string; quantity: string; unitPrice: string; currency: string }>;
};

type Props = {
  sourceText: string;
  busy: boolean;
  onSubmit: (correction: DocumentPoCorrection) => void;
};

const CORRECTION_START = '--- USER-VERIFIED PO MAPPING (entered by tenant user) ---';
const CORRECTION_END = '--- END USER-VERIFIED PO MAPPING ---';

function sectionValue(text: string, heading: RegExp, stop: RegExp, label: RegExp) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return { name: '', code: '' };
  const section: string[] = [];
  const inlineName = lines[start]!.match(/[:：]\s*(.+)$/)?.[1]?.split('|')[0]?.trim() ?? '';
  for (const line of lines.slice(start + 1)) {
    if (stop.test(line)) break;
    section.push(line);
  }
  const code = section.map((line) => line.match(/\b(?:supplier\s+code|vendor\s+code|location\s+code|store\s+code|code)\s*[:#|：]\s*([^\s|]+)/i)?.[1]).find(Boolean) ?? '';
  const name = inlineName || section.find((line) => !label.test(line) && !/\b(?:code|contact|address|city|state|zip|country|phone|email|currency|tax|type|supplier\s+action)\s*[:：]/i.test(line)) || '';
  return { name: name.split('|')[0]?.trim() ?? '', code };
}

function parseDraft(text: string): DocumentPoCorrection {
  const correctionStart = text.indexOf(CORRECTION_START);
  const correctionEnd = correctionStart >= 0 ? text.indexOf(CORRECTION_END, correctionStart + CORRECTION_START.length) : -1;
  const input = correctionStart >= 0 && correctionEnd >= 0
    ? text.slice(correctionStart + CORRECTION_START.length, correctionEnd).trim()
    : text;
  const supplier = sectionValue(input, /^\s*(?:supplier|vendor)(?:\s*[:：].*)?\s*$/i,
    /^\s*(?:buyer|bill\s*to|ship\s*to|delivery\s*location|requested\s+po|products?)\b/i,
    /^\s*(?:supplier|vendor)\s*[:：]/i);
  const location = sectionValue(input, /^\s*(?:ship\s*to|delivery\s*location)\b.*$/i,
    /^\s*(?:requested\s+po|products?|supplier|buyer|bill\s*to)\b/i,
    /^\s*(?:ship\s*to|delivery\s*location)\s*[:：]/i);
  const supplierAction = /Supplier action:\s*CREATE_NEW/i.test(input) ? 'create_from_document' : 'map_existing';
  const locationAction = /Location action:\s*CREATE_NEW/i.test(input) ? 'create_from_document' : 'map_existing';
  const itemLines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsedLines = itemLines.flatMap((line) => {
    const structured = line.match(/^\s*\d+[.)]\s*(.+?)\s*\|\s*SKU:\s*([^|]*)\|\s*Quantity:\s*([^|]+)\|\s*Unit price:\s*([\d,]+(?:\.\d{1,2})?)\s+([A-Z]{3})\s*$/i);
    if (structured) return [{ name: structured[1]!.trim(), sku: structured[2]!.trim(), quantity: structured[3]!.trim(), unitPrice: structured[4]!.replaceAll(',', ''), currency: structured[5]!.toUpperCase() }];
    const match = line.match(/^\s*\d*[.)]?\s*(.+?)\s+([A-Z0-9][A-Z0-9._/-]{3,})\s+(\d+(?:\.\d+)?)\s+(THB|USD|EUR|GBP)\s+([\d,]+(?:\.\d{1,2})?)\b/i);
    return match ? [{ name: match[1]!.trim(), sku: match[2]!, quantity: match[3]!, currency: match[4]!.toUpperCase(), unitPrice: match[5]!.replaceAll(',', '') }] : [];
  }).slice(0, 100);
  return {
    supplierName: supplier.name,
    supplierCode: supplier.code,
    supplierAction,
    locationName: location.name,
    locationCode: location.code,
    locationAction,
    lines: parsedLines.length ? parsedLines : [{ name: '', sku: '', quantity: '', unitPrice: '', currency: '' }],
  };
}

export function serializeDocumentPoCorrection(value: DocumentPoCorrection) {
  const lines = value.lines.map((line, index) =>
    `${index + 1}. ${line.name.trim()} | SKU: ${line.sku.trim()} | Quantity: ${line.quantity.trim()} | Unit price: ${line.unitPrice.trim()} ${line.currency.trim().toUpperCase()}`);
  return [CORRECTION_START,
    `Supplier: ${value.supplierName.trim()}`,
    `Supplier code: ${value.supplierCode.trim()}`,
    `Supplier action: ${value.supplierAction === 'map_existing' ? 'MAP_EXISTING' : 'CREATE_NEW'}`,
    `Ship To: ${value.locationName.trim()}`,
    `Location code: ${value.locationCode.trim()}`,
    `Location action: ${value.locationAction === 'map_existing' ? 'MAP_EXISTING' : 'CREATE_NEW'}`,
    'PO line items:', ...lines,
    CORRECTION_END,
  ].join('\n');
}

export default function DocumentPoCorrectionForm({ sourceText, busy, onSubmit }: Props) {
  const [draft, setDraft] = useState<DocumentPoCorrection>(() => parseDraft(sourceText));
  useEffect(() => setDraft(parseDraft(sourceText)), [sourceText]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.supplierName.trim() && !draft.supplierCode.trim()) return;
    if (!draft.locationName.trim() && !draft.locationCode.trim()) return;
    if (!draft.lines.length || draft.lines.some((line) => (!line.name.trim() && !line.sku.trim())
      || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0
      || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0 || !line.currency.trim())) return;
    onSubmit(draft);
  }

  return <form className="document-po-correction" onSubmit={submit}>
    <div className="document-po-correction-heading">
      <div><strong>Correct PO details and map GIS masters</strong><p>Enter the exact GIS name/code to map an existing master. Choose “Create new” only when the supplier is absent and the details are supported by this document.</p></div>
    </div>
    <div className="document-po-master-grid">
      <label>Supplier name<input value={draft.supplierName} onChange={(event) => setDraft({ ...draft, supplierName: event.target.value })} maxLength={180} required /></label>
      <label>Supplier code<input value={draft.supplierCode} onChange={(event) => setDraft({ ...draft, supplierCode: event.target.value })} maxLength={100} /></label>
      <label>Supplier action<select value={draft.supplierAction} onChange={(event) => setDraft({ ...draft, supplierAction: event.target.value as DocumentPoCorrection['supplierAction'] })}>
        <option value="map_existing">Map to existing GIS supplier</option><option value="create_from_document">Create new from document</option>
      </select></label>
      <label>Ship-to / Location name<input value={draft.locationName} onChange={(event) => setDraft({ ...draft, locationName: event.target.value })} maxLength={180} required /></label>
      <label>Location code<input value={draft.locationCode} onChange={(event) => setDraft({ ...draft, locationCode: event.target.value })} maxLength={100} /></label>
      <label>Location action<select value={draft.locationAction} onChange={(event) => setDraft({ ...draft, locationAction: event.target.value as DocumentPoCorrection['locationAction'] })}>
        <option value="map_existing">Map to existing GIS Location</option><option value="create_from_document">Create new from document</option>
      </select></label>
    </div>
    <div className="document-po-lines-wrap">
      <table className="document-po-lines"><thead><tr><th>Product name</th><th>GIS SKU</th><th>Qty</th><th>Unit price</th><th>Currency</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{draft.lines.map((line, index) => <tr key={index}>
          <td><input aria-label={`Product name ${index + 1}`} value={line.name} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} maxLength={240} /></td>
          <td><input aria-label={`GIS SKU ${index + 1}`} value={line.sku} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((row, rowIndex) => rowIndex === index ? { ...row, sku: event.target.value } : row) })} maxLength={100} /></td>
          <td><input aria-label={`Quantity ${index + 1}`} type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row) })} required /></td>
          <td><input aria-label={`Unit price ${index + 1}`} type="number" min="0" step="any" value={line.unitPrice} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((row, rowIndex) => rowIndex === index ? { ...row, unitPrice: event.target.value } : row) })} required /></td>
          <td><input aria-label={`Currency ${index + 1}`} value={line.currency} onChange={(event) => setDraft({ ...draft, lines: draft.lines.map((row, rowIndex) => rowIndex === index ? { ...row, currency: event.target.value.toUpperCase() } : row) })} maxLength={3} required /></td>
          <td><button type="button" className="document-po-line-remove" aria-label={`Remove line ${index + 1}`} disabled={draft.lines.length === 1 || busy} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 size={15} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="document-chat-actions">
      <button type="button" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { name: '', sku: '', quantity: '', unitPrice: '', currency: '' }] })} disabled={busy || draft.lines.length >= 100}><Plus size={14} /> Add line</button>
      <button className="is-primary" type="submit" disabled={busy || !draft.supplierName.trim() || !draft.locationName.trim() || draft.lines.some((line) => (!line.name.trim() && !line.sku.trim()) || !line.quantity || !line.unitPrice || !line.currency)}>
        {busy ? <LoaderCircle size={14} className="spin" /> : null} Save corrections and retry GIS PO preview
      </button>
    </div>
  </form>;
}
