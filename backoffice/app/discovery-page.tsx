'use client';

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowRight, Camera, ChevronDown, LoaderCircle, LogOut, Mic, Minus, Paperclip, Plus, Sparkles, X } from 'lucide-react';
import { askFaro, type DiscoveryResult } from './actions';
import { unwrapApi, type DocumentImportJob, type DocumentTypeCatalog } from './document-import/model';
import ProductCreation from './ProductCreation';
import ProcurementAssistant from './ProcurementAssistant';
import CustomerBirthdayAssistant from './CustomerBirthdayAssistant';
import DocumentPoCorrectionForm, { serializeDocumentPoCorrection, type DocumentPoCorrection } from './DocumentPoCorrectionForm';
import { isDocumentRequestHint } from './chat-intent-hints';

type FilterState = {
  product_type?: string;
  metal?: string;
  metal_color?: string;
  metal_karat?: string;
  stone_type?: string;
  stone_shape?: string;
  price_min?: number;
  price_max?: number;
  price_currency?: string;
  selected_facets?: Record<string, string>;
};

type SpeechResultEvent = Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const facets = [
  { name: 'Who is it for?', values: ['Myself', 'Wife', 'Husband', 'Fiancée', 'Fiancé', 'Girlfriend', 'Boyfriend', 'Mother', 'Father', 'Daughter', 'Son', 'Friend', 'Client', 'Bride', 'Groom'] },
  { name: 'Occasion', values: ['Birthday', 'Anniversary', 'Engagement', 'Wedding', 'Graduation', 'Everyday'] },
  { name: 'Jewelry Type', values: ['Ring', 'Necklace', 'Earrings', 'Pendant', 'Bracelet'] },
  { name: 'Metal', values: ['Yellow gold', 'White gold', 'Rose gold', 'Platinum'] },
  { name: 'Gemstone', values: ['Diamond', 'Sapphire', 'Pearl', 'Emerald', 'Ruby'] },
  { name: 'Style', values: ['Classic', 'Minimal', 'Statement', 'Vintage', 'Modern'] },
  { name: 'Budget', values: ['Under $500', '$500–$1,500', '$1,500–$5,000', '$5,000+'] },
  { name: 'Theme', values: ['Nature', 'Heart', 'Floral', 'Geometric'] },
  { name: 'Color', values: ['Yellow', 'White', 'Rose', 'Black'] },
  { name: 'Size', values: ['Small', 'Medium', 'Large'] },
  { name: 'Wear/Lifestyle', values: ['Everyday', 'Formal', 'Work', 'Travel'] },
  { name: 'Avoid', values: ['Diamonds', 'Nickel', 'Large designs', 'Specific gemstone'] },
] as const;

const jewelryTypes: Record<string, string> = { Ring: 'ring', Necklace: 'necklace', Earrings: 'earring', Pendant: 'pendant', Bracelet: 'bracelet' };
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const DOCUMENT_ACTIVE = new Set(['queued', 'validating', 'processing']);

function initialDocumentOcrText(job: DocumentImportJob) {
  if (typeof job.corrected_ocr_text === 'string') return job.corrected_ocr_text;
  return (job.pages ?? []).map((page) => `--- Page ${page.page_number} ---\n${page.ocr_text ?? page.blocks?.map((block) => block.text).join('\n') ?? ''}`)
    .join('\n\n').trim();
}

function isDocumentPoCreationRequest(value: string) {
  const prompt = value.trim();
  if (!prompt) return false;
  return /\b(?:add|attach|import|put|use|convert|turn|make|create|prepare|raise|draft)\b.{0,80}\b(?:this|the|attached)?\s*(?:document|file|pdf|quote|quotation|invoice)\b.{0,50}\b(?:to|into|for|as)\s+(?:a\s+)?(?:po|purchase\s+orders?)\b/i.test(prompt)
    || /\b(?:po|purchase\s+orders?)\b.{0,60}\b(?:from|using|based\s+on)\s+(?:this|the|attached)\s+(?:document|file|pdf|quote|quotation|invoice)\b/i.test(prompt)
    || /(?:เพิ่ม|แนบ|นำ|เอา|แปลง|ใช้|สร้าง|ทำ|เปิด|เตรียม).{0,60}(?:เอกสาร|ไฟล์|ใบเสนอราคา|ใบแจ้งหนี้).{0,50}(?:เข้า|เป็น|ทำ|สร้าง|สำหรับ).{0,30}(?:\bpo\b|purchase\s*order|ใบสั่งซื้อ)|(?:\bpo\b|purchase\s*order|ใบสั่งซื้อ).{0,60}(?:จาก|ตาม|โดยใช้).{0,50}(?:เอกสาร|ไฟล์|ใบเสนอราคา|ใบแจ้งหนี้)/i.test(prompt);
}

function tenantCsrfToken() {
  const entry = document.cookie.split('; ').find((part) => part.startsWith('faroai_tenant_csrf=') || part.startsWith('__Host-faroai_tenant_csrf='));
  if (!entry) return '';
  try { return decodeURIComponent(entry.split('=').slice(1).join('=')); } catch { return ''; }
}

async function documentResponse<T>(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('The document service returned an unreadable response.'); }
  const result = unwrapApi<T>(body);
  if (!response.ok || !result.data) throw new Error(result.message ?? 'The document request could not be completed.');
  return result.data;
}

function buildReadyPrompt(selected: Record<string, string>, originalQuery = '') {
  const recipientNames: Record<string, string> = {
    Myself: 'myself', Wife: 'my wife', Husband: 'my husband', Fiancée: 'my fiancée', Fiancé: 'my fiancé',
    Girlfriend: 'my girlfriend', Boyfriend: 'my boyfriend', Mother: 'my mother', Father: 'my father',
    Daughter: 'my daughter', Son: 'my son', Friend: 'my friend', Client: 'my client', Bride: 'the bride', Groom: 'the groom',
  };
  const recipient = selected['Who is it for?'] ? recipientNames[selected['Who is it for?']] ?? selected['Who is it for?'].toLowerCase() : '';
  const jewelryType = selected['Jewelry Type']?.toLowerCase();
  const article = jewelryType && !['earrings'].includes(jewelryType) ? (/^[aeiou]/.test(jewelryType) ? 'an ' : 'a ') : '';
  const occasionText: Record<string, string> = {
    Birthday: 'for a birthday', Anniversary: 'for an anniversary', Engagement: 'for an engagement',
    Wedding: 'for a wedding', Graduation: 'for a graduation', Everyday: 'for everyday wear',
  };
  const budgetText: Record<string, string> = {
    'Under $500': 'under $500', '$500–$1,500': 'with a budget between $500 and $1,500',
    '$1,500–$5,000': 'with a budget between $1,500 and $5,000', '$5,000+': 'with a budget of at least $5,000',
  };
  const clauses = [
    requestWithType(selected['Jewelry Type'], originalQuery, jewelryType, article),
    selected.Occasion && occasionText[selected.Occasion],
    selected.Style && `in a ${selected.Style.toLowerCase()} style`,
    selected.Metal && `in ${selected.Metal}`,
    selected.Gemstone && `with ${selected.Gemstone.toLowerCase()}`,
    selected.Theme && `with a ${selected.Theme.toLowerCase()} design`,
    selected.Color && `in ${selected.Color.toLowerCase()} tones`,
    selected.Size && `in a ${selected.Size.toLowerCase()} size`,
    selected['Wear/Lifestyle'] && `suitable for ${selected['Wear/Lifestyle'].toLowerCase()} wear`,
    selected.Budget && budgetText[selected.Budget],
  ].filter(Boolean);
  const avoid = selected.Avoid ? `, avoiding ${selected.Avoid.toLowerCase()}` : '';
  const request = originalQuery.trim();
  const intro = request ? `Find jewelry matching “${request}”` : `Find ${jewelryType ? `${article}${jewelryType}` : 'jewelry'}`;
  const recipientText = recipient ? ` for ${recipient}` : '';
  return `${intro}${recipientText}${clauses.length ? ` ${clauses[0]}${clauses.length > 1 ? `, ${clauses.slice(1).join(', ')}` : ''}` : ''}${avoid}.`.slice(0, 500);
}

function requestWithType(selectedType: string | undefined, originalQuery: string, jewelryType: string | undefined, article: string) {
  return selectedType && originalQuery.trim() ? `specifically ${article}${jewelryType}` : undefined;
}

function isInStock(availability?: string | null) {
  return ['available', 'in stock', 'instock', 'true', '1'].includes((availability ?? '').trim().toLowerCase());
}

function money(price: number | null | undefined, currency: string | null | undefined) {
  if (price === null || price === undefined || !currency) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function productSizeChoices(productType?: string | null) {
  const type = (productType ?? '').toLowerCase();
  if (type.includes('ring')) return ['50', '52', '54', '56', '58', '60'];
  if (type.includes('necklace') || type.includes('chain')) return ['40 cm', '45 cm', '50 cm', '55 cm'];
  if (type.includes('bracelet')) return ['16 cm', '18 cm', '20 cm'];
  return ['One size'];
}

function ProductImage({ src, productName, className }: { src?: string | null; productName: string; className: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const fallback = !src || failedSource === src;
  return <img
    className={`${className}${fallback ? ' is-placeholder' : ''}`}
    src={fallback ? '/images/product-image-placeholder.webp' : src}
    alt={fallback ? `Image unavailable for ${productName}` : `${productName} product`}
    loading="lazy"
    referrerPolicy={fallback ? undefined : 'no-referrer'}
    onError={fallback ? undefined : () => setFailedSource(src)}
  />;
}

export default function DiscoveryPage({ trainingOptions = { local: false, shared: false } }: { trainingOptions?: { local: boolean; shared: boolean } }) {
  const [tenantSession, setTenantSession] = useState<{ email: string; tenant: { id: string; name: string } } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [query, setQuery] = useState('');
  const [consented, setConsented] = useState(false);
  const [knowledgeImprovementConsented, setKnowledgeImprovementConsented] = useState(false);
  const [trainingLocalConsented, setTrainingLocalConsented] = useState(false);
  const [trainingSharedConsented, setTrainingSharedConsented] = useState(false);
  const [activeFacet, setActiveFacet] = useState<string>(facets[0].name);
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<FilterState>({});
  const [answer, setAnswer] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState('');
  const [productPrompt, setProductPrompt] = useState<string | null>(null);
  const [procurementPrompt, setProcurementPrompt] = useState<string | null>(null);
  const [customerBirthdayPrompt, setCustomerBirthdayPrompt] = useState<string | null>(null);
  const [procurementDocumentJobId, setProcurementDocumentJobId] = useState<string | null>(null);
  const [procurementRunId, setProcurementRunId] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const [guideOpen, setGuideOpen] = useState(true);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [activeProduct, setActiveProduct] = useState<DiscoveryResult['products'][number] | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; name: string } | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentJob, setDocumentJob] = useState<DocumentImportJob | null>(null);
  const [documentOcrDraft, setDocumentOcrDraft] = useState('');
  const [documentCorrectionBusy, setDocumentCorrectionBusy] = useState(false);
  const [documentRetention, setDocumentRetention] = useState<DocumentTypeCatalog['retention'] | null>(null);
  const [documentPolicyBusy, setDocumentPolicyBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [documentPrompt, setDocumentPrompt] = useState('');
  const [drawerOptions, setDrawerOptions] = useState({ metal: 'White gold', gemstone: 'Diamond', size: '52' });
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const generatedFacetPromptRef = useRef('');
  const promptBeforeFacetsRef = useRef('');
  const documentProcurementStartedRef = useRef<string | null>(null);

  async function loadTenantSession() {
    setSessionLoading(true);
    try {
      const response = await fetch('/api/tenant/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      setTenantSession(response.ok && result?.success ? result.data : null);
    } catch { setTenantSession(null); }
    finally { setSessionLoading(false); }
  }
  useEffect(() => { void loadTenantSession(); }, []);

  useEffect(() => {
    if (!documentJob?.id || !DOCUMENT_ACTIVE.has(documentJob.status)) return;
    const controller = new AbortController();
    let timeout = 0;
    const poll = () => { timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/document-imports/${encodeURIComponent(documentJob.id)}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        const current = await documentResponse<DocumentImportJob>(response);
        setDocumentJob(current);
        if (DOCUMENT_ACTIVE.has(current.status) && !controller.signal.aborted) poll();
      } catch {
        if (!controller.signal.aborted) poll();
      }
    }, 2000); };
    poll();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [documentJob?.id, documentJob?.status]);

  useEffect(() => {
    if (documentJob?.status === 'needs_review') setDocumentOcrDraft(initialDocumentOcrText(documentJob));
  }, [documentJob?.id, documentJob?.status, documentJob?.correction_version, documentJob?.corrected_ocr_text]);

  useEffect(() => {
    if (!documentJob || documentJob.status !== 'needs_review' || documentJob.model_processing_consented !== true
      || !isDocumentPoCreationRequest(documentPrompt) || documentProcurementStartedRef.current === documentJob.id) return;
    documentProcurementStartedRef.current = documentJob.id;
    setProcurementDocumentJobId(documentJob.id);
    setProcurementPrompt(documentPrompt.trim());
  }, [documentJob?.id, documentJob?.status, documentJob?.model_processing_consented, documentPrompt]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSessionBusy(true); setLoginError('');
    try {
      const response = await fetch('/api/tenant/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const result = await response.json();
      if (!response.ok || !result?.success || !result.data?.tenant?.id) { setLoginError(result?.message ?? 'Sign in failed.'); return; }
      setTenantSession(result.data); setLoginPassword('');
    } catch { setLoginError('Tenant sign-in is temporarily unavailable.'); }
    finally { setSessionBusy(false); }
  }

  async function signOut() {
    setSessionBusy(true); setLoginError('');
    try {
      const csrf = document.cookie.split('; ').find((part) => part.startsWith('faroai_tenant_csrf=') || part.startsWith('__Host-faroai_tenant_csrf='))?.split('=').slice(1).join('=');
      const response = await fetch('/api/tenant/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}) }, body: '{}' });
      if (!response.ok) { setLoginError('Sign out failed.'); return; }
      setTenantSession(null); setAnswer(null); setProductPrompt(null); setProcurementPrompt(null); setConsented(false);
    } catch { setLoginError('Sign out failed.'); }
    finally { setSessionBusy(false); }
  }

  function selectReferenceImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1_500_000) {
      setError('Choose a JPEG, PNG, or WebP image smaller than 1.5 MB.');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const base64 = dataUrl.split(',', 2)[1] ?? '';
      if (!base64) { setError('The image could not be read. Try another file.'); return; }
      setReferenceImage({ base64, mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', name: file.name });
      setError('');
    };
    reader.onerror = () => setError('The image could not be read. Try another file.');
    reader.readAsDataURL(file);
  }

  async function selectDocument(file?: File) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const supported = (extension === 'pdf' && (!file.type || file.type === 'application/pdf'))
      || (extension === 'png' && (!file.type || file.type === 'image/png'))
      || (['jpg', 'jpeg'].includes(extension) && (!file.type || file.type === 'image/jpeg'));
    if (!supported || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
      setDocumentFile(null);
      setDocumentError('Choose a PDF, PNG, or JPEG document smaller than 20 MiB.');
      if (documentInputRef.current) documentInputRef.current.value = '';
      return;
    }
    setReferenceImage(null);
    setProcurementDocumentJobId(null); setProcurementPrompt(null);
    documentProcurementStartedRef.current = null;
    setAnswer(null); setProductPrompt(null);
    setDocumentError(''); setDocumentJob(null); setDocumentPrompt(''); setDocumentRetention(null); setDocumentFile(file); setDocumentPolicyBusy(true);
    // AI consent is per document and per prompt; never carry it over from a prior request.
    setConsented(false);
    try {
      const response = await fetch('/api/document-imports/types', { credentials: 'same-origin', cache: 'no-store' });
      const catalog = await documentResponse<DocumentTypeCatalog>(response);
      if (!catalog.retention || !Number.isFinite(catalog.retention.source_hours) || !Number.isFinite(catalog.retention.review_days)) {
        throw new Error('The retention policy is unavailable. This file cannot be sent yet.');
      }
      setDocumentRetention(catalog.retention);
    } catch (cause) {
      setDocumentError(cause instanceof Error ? cause.message : 'The document service is unavailable.');
      setDocumentFile(null);
      if (documentInputRef.current) documentInputRef.current.value = '';
    } finally {
      setDocumentPolicyBusy(false);
    }
  }

  async function sendDocument() {
    if (!documentFile || !documentRetention || documentBusy) return;
    const prompt = query.trim();
    const createPoFromDocument = isDocumentPoCreationRequest(prompt);
    if (createPoFromDocument && !consented) {
      setDocumentError('Allow AI processing of the extracted document text before asking FaroAI to prepare a PO.');
      return;
    }
    setDocumentBusy(true); setDocumentError('');
    const form = new FormData();
    form.set('file', documentFile, documentFile.name);
    try {
      const response = await fetch('/api/document-imports', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: form,
        headers: {
          'x-csrf-token': tenantCsrfToken(),
          'x-faroai-document-import-consent': 'true',
          ...(createPoFromDocument && consented ? { 'x-faroai-document-model-consent': 'true' } : {}),
        },
      });
      const job = await documentResponse<DocumentImportJob>(response);
      setDocumentPrompt(prompt);
      setDocumentJob(job); setDocumentOcrDraft(initialDocumentOcrText(job)); setDocumentFile(null); setQuery(''); setAnswer(null); setError('');
      if (documentInputRef.current) documentInputRef.current.value = '';
    } catch (cause) {
      setDocumentError(cause instanceof Error ? cause.message : 'The document could not be sent.');
    } finally { setDocumentBusy(false); }
  }

  async function saveDocumentOcrCorrection(text = documentOcrDraft) {
    if (!documentJob || documentJob.status !== 'needs_review') throw new Error('Wait until OCR review is ready before saving corrections.');
    const corrected = text.trim();
    if (!corrected) throw new Error('The corrected document text cannot be empty.');
    if (corrected === (documentJob.corrected_ocr_text ?? initialDocumentOcrText(documentJob))) return documentJob;
    const response = await fetch(`/api/document-imports/${encodeURIComponent(documentJob.id)}/draft`, {
      method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-csrf-token': tenantCsrfToken() },
      body: JSON.stringify({ expected_correction_version: documentJob.correction_version ?? 0, ocr_text_correction: corrected }),
    });
    const saved = await documentResponse<{ id: string; status: string; corrected_ocr_text: string | null; correction_version: number }>(response);
    const nextJob = { ...documentJob, corrected_ocr_text: saved.corrected_ocr_text, correction_version: saved.correction_version };
    setDocumentJob(nextJob);
    return nextJob;
  }

  async function saveDocumentCorrectionOnly() {
    if (documentCorrectionBusy) return;
    setDocumentCorrectionBusy(true); setDocumentError('');
    try { await saveDocumentOcrCorrection(); }
    catch (cause) { setDocumentError(cause instanceof Error ? cause.message : 'OCR corrections could not be saved.'); }
    finally { setDocumentCorrectionBusy(false); }
  }

  async function retryDocumentPoWithCorrections() {
    if (!documentJob || documentCorrectionBusy) return;
    if (!documentJob.model_processing_consented || !isDocumentPoCreationRequest(documentPrompt)) {
      setDocumentError('Attach the document with a PO request and allow AI processing before continuing.');
      return;
    }
    setDocumentCorrectionBusy(true); setDocumentError('');
    try {
      await saveDocumentOcrCorrection();
      documentProcurementStartedRef.current = documentJob.id;
      setProcurementRunId((value) => value + 1);
      setProcurementDocumentJobId(documentJob.id);
      setProcurementPrompt(documentPrompt.trim());
    } catch (cause) { setDocumentError(cause instanceof Error ? cause.message : 'The corrected document could not continue to PO review.'); }
    finally { setDocumentCorrectionBusy(false); }
  }

  async function retryDocumentPoWithStructuredCorrections(correction: DocumentPoCorrection) {
    if (!documentJob || documentCorrectionBusy || !procurementPrompt) return;
    if (!documentJob.model_processing_consented || !isDocumentPoCreationRequest(documentPrompt)) {
      setDocumentError('Attach the document with a PO request and allow AI processing before continuing.');
      return;
    }
    const marker = '--- USER-VERIFIED PO MAPPING (entered by tenant user) ---';
    const endMarker = '--- END USER-VERIFIED PO MAPPING ---';
    const start = documentOcrDraft.indexOf(marker);
    const end = start >= 0 ? documentOcrDraft.indexOf(endMarker, start + marker.length) : -1;
    const original = start >= 0 && end >= 0
      ? `${documentOcrDraft.slice(0, start)}\n${documentOcrDraft.slice(end + endMarker.length)}`.trim()
      : documentOcrDraft.trim();
    const updated = `${original}\n\n${serializeDocumentPoCorrection(correction)}`.trim();
    setDocumentCorrectionBusy(true); setDocumentError('');
    try {
      await saveDocumentOcrCorrection(updated);
      setDocumentOcrDraft(updated);
      documentProcurementStartedRef.current = documentJob.id;
      setProcurementRunId((value) => value + 1);
      setProcurementDocumentJobId(documentJob.id);
      setProcurementPrompt(documentPrompt.trim());
    } catch (cause) { setDocumentError(cause instanceof Error ? cause.message : 'The corrected PO details could not be saved and resubmitted.'); }
    finally { setDocumentCorrectionBusy(false); }
  }

  async function deleteDocument() {
    if (!documentJob || documentBusy) return;
    setDocumentBusy(true); setDocumentError('');
    try {
      const response = await fetch(`/api/document-imports/${encodeURIComponent(documentJob.id)}`, {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { 'x-csrf-token': tenantCsrfToken() },
      });
      await documentResponse(response);
      setDocumentJob(null); setDocumentPrompt(''); setDocumentOcrDraft('');
      setProcurementDocumentJobId(null); setProcurementPrompt(null);
      documentProcurementStartedRef.current = null;
    } catch (cause) { setDocumentError(cause instanceof Error ? cause.message : 'The document could not be deleted.'); }
    finally { setDocumentBusy(false); }
  }

  function applyFacet(facet: string, value: string) {
    const nextValue = selectedFacets[facet] === value ? undefined : value;
    const nextSelectedFacets = { ...selectedFacets };
    if (nextValue) nextSelectedFacets[facet] = nextValue;
    else delete nextSelectedFacets[facet];
    setSelectedFacets(nextSelectedFacets);
    const promptBase = query === generatedFacetPromptRef.current ? promptBeforeFacetsRef.current : query.trim();
    promptBeforeFacetsRef.current = promptBase;
    if (Object.keys(nextSelectedFacets).length > 0) {
      const readyPrompt = buildReadyPrompt(nextSelectedFacets, promptBase);
      generatedFacetPromptRef.current = readyPrompt;
      setQuery(readyPrompt);
    } else {
      generatedFacetPromptRef.current = '';
      promptBeforeFacetsRef.current = '';
      setQuery(promptBase);
    }
    setFilters((current) => {
      const next = { ...current };
      const setOrDelete = (key: 'product_type' | 'metal' | 'metal_color' | 'stone_type', selected: string | undefined) => {
        if (selected) next[key] = selected;
        else delete next[key];
      };
      if (facet === 'Jewelry Type') setOrDelete('product_type', nextValue ? jewelryTypes[nextValue] : undefined);
      if (facet === 'Metal') setOrDelete('metal', nextValue?.toLowerCase());
      if (facet === 'Color') setOrDelete('metal_color', nextValue?.toLowerCase());
      if (facet === 'Gemstone') setOrDelete('stone_type', nextValue?.toLowerCase());
      if (facet === 'Budget') {
        delete next.price_min;
        delete next.price_max;
        delete next.price_currency;
        const ranges: Record<string, { min?: number; max?: number }> = {
          'Under $500': { max: 500 },
          '$500–$1,500': { min: 500, max: 1500 },
          '$1,500–$5,000': { min: 1500, max: 5000 },
          '$5,000+': { min: 5000 },
        };
        const range = nextValue ? ranges[nextValue] : undefined;
        if (range?.min !== undefined) next.price_min = range.min;
        if (range?.max !== undefined) next.price_max = range.max;
        if (range) next.price_currency = 'USD';
      }
      return next;
    });
    setAnswer(null);
    setError('');
  }

  function clearFacets() {
    setSelectedFacets({});
    setFilters({});
    if (query === generatedFacetPromptRef.current) setQuery(promptBeforeFacetsRef.current);
    generatedFacetPromptRef.current = '';
    promptBeforeFacetsRef.current = '';
    setAnswer(null);
    setError('');
  }

  function startVoice() {
    const speech = window as SpeechWindow;
    const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceMessage('Voice search is not supported in this browser.');
      return;
    }
    setVoiceMessage('');
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => setQuery(event.results[0]?.[0]?.transcript ?? '');
    recognition.onerror = () => setVoiceMessage('Microphone access was not available.');
    recognition.onend = () => setListening(false);
    setListening(true);
    try { recognition.start(); } catch { setListening(false); setVoiceMessage('Voice search could not start.'); }
  }

  function search() {
    if (documentFile) { void sendDocument(); return; }
    // Customer birthday questions must leave the product-discovery path before
    // any jewelry or procurement fallback can retain/show catalog results.
    if (isCustomerBirthdayPrompt(query)) {
      setError('');
      setAnswer(null);
      setProductPrompt(null);
      setProcurementPrompt(null);
      setCustomerBirthdayPrompt(query.trim());
      return;
    }
    if (isProcurementPrompt(query)) {
      setError('');
      setAnswer(null);
      setProductPrompt(null);
      setCustomerBirthdayPrompt(null);
      setProcurementPrompt(query.trim());
      return;
    }
    if (isProductCreationPrompt(query)) {
      setError('');
      setAnswer(null);
      setProcurementPrompt(null);
      setCustomerBirthdayPrompt(null);
      setProductPrompt(query.trim());
      return;
    }
    setProcurementPrompt(null);
    setProductPrompt(null);
    setCustomerBirthdayPrompt(null);
    if (!consented) {
      setError('Please accept the AI chat notice below to continue.');
      return;
    }
    if (!query.trim()) {
      inputRef.current?.focus();
      return;
    }
    const message = query.trim();
    const discoveryQuery = query === generatedFacetPromptRef.current
      ? promptBeforeFacetsRef.current.trim()
      : message;
    setError('');
    setAnswer(null);
    startTransition(async () => {
      const result = await askFaro({ message, consented, knowledgeImprovementConsented, trainingLocalConsented, trainingSharedConsented,
        state: { ...filters, selected_facets: selectedFacets, discovery_query: discoveryQuery },
        image: referenceImage ? { base64: referenceImage.base64, mediaType: referenceImage.mediaType } : undefined });
      if (result.ok) setAnswer(result.data);
      else setError(result.message);
    });
  }

  function isProductCreationPrompt(value: string) {
    const prompt = value.trim();
    if (/(?:เพิ่ม|สร้าง)\s*(?:สินค้า|product)/i.test(prompt)) return true;
    const hasCreateVerb = /\b(?:add|create|generate|make)\b/i.test(prompt);
    const hasProductSubject = /\b(?:products?|jewelry|rings?|necklaces?|bracelets?|earrings?|pendants?)\b/i.test(prompt);
    const hasExplicitCreationContext = /\b(?:products?|catalog|product list)\b/i.test(prompt) || /\b\d{1,2}\b/.test(prompt);
    return hasCreateVerb && hasProductSubject && hasExplicitCreationContext;
  }

  function isCustomerBirthdayPrompt(value: string) {
    const prompt = value.trim();
    const birthdayCue = /\bbirthdays?\b|\bbirth\s*date\b|\bdate\s+of\s+birth\b|\bborn\b|\bhow\s+old\b|\bage\b|วันเกิด|เกิดวันที่|เกิดเดือน|อายุ/i.test(prompt);
    if (!birthdayCue) return false;
    const explicitCustomer = /\bcustomers?\b|\bclient\b|\bwho\b|\bwhose\b|\banyone\b|\bpeople\b|ลูกค้า|ใคร/i.test(prompt);
    const namedPerson = /\bhow\s+old\s+is\s+.+/i.test(prompt)
      || /\b(?:give|show|find|when|what)\b.+(?:['’]s\s+)?(?:birthdays?|birth\s*date|date\s+of\s+birth|age)\b/i.test(prompt)
      || /\b(?:birthday|birth\s*date|date\s+of\s+birth|age)\s+(?:of|for)\s+\S+/i.test(prompt)
      || /\b\S+\s+birthdays?\s*(?:please)?[?.!]*$/i.test(prompt)
      || /\bwhat\s+year\s+(?:was\s+)?\S.+\s+born\b|\bcan\s+you\s+tell\s+me\s+when\s+.+\s+was\s+born\b/i.test(prompt)
      || /วันเกิดของ|อายุของ/i.test(prompt);
    const productGift = /\b(?:gift|jewelry|jewellery|ring|necklace|earrings?|bracelet|pendant)\b/i.test(prompt)
      && !explicitCustomer;
    return !productGift && (explicitCustomer || namedPerson);
  }

  function isProcurementPrompt(value: string) {
    const prompt = value.trim();
    const hasPurchaseOrder = /\bpo(?:s)?\b(?:\s*[-#]?\s*\d+)?|\bpurchase[-\s]+orders?\b|ใบสั่งซื้อ/i.test(prompt);
    const hasInventory = /\binventory\b|\bstock\b|\binbound\b|\breceipt\b|รับสินค้า|รับของเข้า|ใบรับสินค้า/i.test(prompt);
    const hasSupplier = /\bsuppliers?\b|\bvendors?\b|ผู้ขาย/i.test(prompt);
    const hasAction = /\b(?:create|add|register|activate|enable|make|new|check|search|find|show|list|display|view|get|receive|inspect|export|download|generate|save|provide|prepare|give)\b|สร้าง|เพิ่ม|ลงทะเบียน|เปิดใช้งาน|เปิด|ทำ|เช็ก|ตรวจ|ค้นหา|แสดงรายชื่อ|รับ|ส่งออก|ดาวน์โหลด/i.test(prompt);
    // A file request belongs in the in-chat procurement flow even when it is
    // the first message; the assistant can ask which PO set if scope is absent.
    return (hasAction && (hasPurchaseOrder || hasInventory || hasSupplier))
      || isDocumentRequestHint(prompt)
      || (/\b(?:pdf|xlsx|excel|spreadsheet|docx|word)\b|(?:ไฟล์\s*pdf|พีดีเอฟ|เอ็กเซล|เอกเซล)/i.test(prompt)
        && (hasPurchaseOrder || hasSupplier));
  }

  function openProduct(product: DiscoveryResult['products'][number]) {
    const sizeChoices = productSizeChoices(product.productType);
    setDrawerOptions({ metal: 'White gold', gemstone: 'Diamond', size: product.productType?.toLowerCase().includes('ring') ? '52' : sizeChoices[0] });
    setActiveProduct(product);
  }

  const activeFacetData = facets.find((facet) => facet.name === activeFacet) ?? facets[0];
  const selectedFacetEntries = Object.entries(selectedFacets);
  const birthdayLookupDraft = Boolean(customerBirthdayPrompt) || isCustomerBirthdayPrompt(query);
  const products = answer?.products ?? [];
  const visibleProducts = inStockOnly ? products.filter((product) => isInStock(product.availability)) : products;

  if (sessionLoading) return <main className="login-shell"><div className="login-card"><LoaderCircle className="spin" /><p className="login-intro">Checking your tenant session…</p></div></main>;
  if (!tenantSession) return <main className="login-shell">
    <div className="login-card"><div className="login-mark"><Sparkles size={20} /></div><p className="eyebrow">FAROAI DISCOVERY</p><h1>Sign in to your tenant</h1>
      <p className="login-intro">Sign in with a tenant administrator account. FaroAI will use the tenant attached to your account for searches and requests.</p>
      <form className="login-form" onSubmit={signIn}>
        <label>Email address<input type="email" autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></label>
        <button className="primary-button" disabled={sessionBusy}>{sessionBusy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {loginError && <p className="form-error" role="alert">{loginError}</p>}
      <a className="back-home" href="/tenant">Tenant workspace settings</a>
    </div>
  </main>;

  return (
    <main className="discovery-shell shopping-shell">
      <header className="shopping-topbar">
        <a className="shopping-wordmark" href="/" aria-label="FaroAI home">faro<span>✦</span></a>
        <span className="shopping-tenant-name" title={tenantSession.tenant.id}>{tenantSession.tenant.name}</span>
        <a className="shopping-platform-link" href="/admin">Platform</a>
        <button className="shopping-signout" type="button" onClick={() => void signOut()} disabled={sessionBusy}><LogOut size={14} /> Sign out</button>
        <button className="guide-collapse" type="button" aria-label={guideOpen ? 'Collapse shopping preferences' : 'Expand shopping preferences'} onClick={() => setGuideOpen((open) => !open)}>
          {guideOpen ? <Minus size={17} /> : <Plus size={16} />}
        </button>
      </header>

      <section className="shopping-search-area" aria-label="Jewelry search">
        <form className="shopping-search-form" onSubmit={(event) => { event.preventDefault(); search(); }}>
          <label className="sr-only" htmlFor="faro-query">Search for jewelry</label>
          <input
            ref={inputRef}
            id="faro-query"
            value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            // Do not leave a previous catalog answer beneath a newly typed
            // customer lookup; otherwise it looks as if the birthday query ran.
            setAnswer(null);
            setError('');
            setProductPrompt(null);
            setCustomerBirthdayPrompt(null);
            setProcurementPrompt(null);
            if (documentFile) setConsented(false);
          }}
            placeholder={documentFile ? 'Try: “Add this document to a PO” or “ช่วยทำ PO จากเอกสารนี้”…' : 'Ask FaroAI or search for jewelry…'}
            maxLength={500}
            autoComplete="off"
          />
          <button className="shopping-search-icon" type="button" aria-label="Clear search" onClick={() => { setQuery(''); if (documentFile) setConsented(false); }}><X size={18} /></button>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose jewelry reference image" onChange={(event) => selectReferenceImage(event.target.files?.[0])} />
          <button className={`shopping-search-icon ${referenceImage ? 'is-listening' : ''}`} type="button" disabled={Boolean(documentFile) || documentBusy} aria-label={referenceImage ? `Remove ${referenceImage.name}` : 'Search using a jewelry image'} title={referenceImage ? `Remove ${referenceImage.name}` : 'Search using a jewelry image'} onClick={() => referenceImage ? setReferenceImage(null) : imageInputRef.current?.click()}>
            {referenceImage ? <X size={18} /> : <Camera size={19} />}
          </button>
          <input ref={documentInputRef} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-label="Choose a business document" onChange={(event) => void selectDocument(event.currentTarget.files?.[0])} />
          <button className={`shopping-search-icon ${documentFile ? 'is-listening' : ''}`} type="button" disabled={Boolean(documentJob) || documentBusy} aria-label={documentFile ? `Remove ${documentFile.name}` : 'Attach a business document'} title={documentFile ? `Remove ${documentFile.name}` : 'Attach a business document'} onClick={() => documentFile ? (setDocumentFile(null), setDocumentRetention(null), setDocumentError(''), setDocumentPrompt(''), setConsented(false), documentInputRef.current && (documentInputRef.current.value = '')) : documentInputRef.current?.click()}>
            <Paperclip size={19} />
          </button>
          <button className={`shopping-search-icon ${listening ? 'is-listening' : ''}`} type="button" onClick={startVoice} aria-label="Start voice search" title="Start voice search"><Mic size={20} /></button>
          <button className="shopping-submit" type="submit" aria-label={documentFile ? 'Send document' : 'Search'} title={documentFile ? 'Send document' : 'Search'} disabled={pending || documentBusy || documentPolicyBusy || (Boolean(documentFile) && !documentRetention) || (!query.trim() && !documentFile)}>
            {pending || documentBusy ? <LoaderCircle size={19} className="spin" /> : <ArrowRight size={21} />}
          </button>
        </form>
        {documentFile && <div className="document-attachment-chip" role="status"><Paperclip size={15} /><span>{documentFile.name}</span><small>{(documentFile.size / 1048576).toFixed(1)} MiB</small><button type="button" aria-label="Remove attached document" onClick={() => { setDocumentFile(null); setDocumentRetention(null); setDocumentError(''); setConsented(false); if (documentInputRef.current) documentInputRef.current.value = ''; }}><X size={15} /></button></div>}
        {documentFile && documentRetention && <p className="document-attachment-note">{isDocumentPoCreationRequest(query)
          ? `Send for local OCR and PO review · Extracted text may be sent to your configured AI model · File kept up to ${documentRetention.source_hours} hours · Review data up to ${documentRetention.review_days} days`
          : `Send for local OCR only · File kept up to ${documentRetention.source_hours} hours · OCR text up to ${documentRetention.review_days} days${query.trim() ? ' · Your message will appear as a note; AI will not analyze it yet' : ''}`}</p>}
        {documentError && <p className="shopping-error" role="alert">{documentError}</p>}
        {documentJob && <section className="document-chat-result" aria-live="polite" aria-label="Document OCR result">
          <div className="document-chat-heading"><div><strong>{documentJob.source?.file_name ?? 'Business document'}</strong><span>{documentJob.status === 'queued' || documentJob.status === 'validating' || documentJob.status === 'processing' ? 'Reading document…' : documentJob.status === 'needs_review' && documentJob.model_processing_consented && isDocumentPoCreationRequest(documentPrompt) ? 'Preparing PO preview…' : documentJob.status === 'needs_review' ? 'OCR text ready' : documentJob.status.replaceAll('_', ' ')}</span></div><button type="button" onClick={() => void deleteDocument()} disabled={documentBusy} aria-label="Delete uploaded document and OCR data"><X size={16} /></button></div>
          {documentPrompt && <p className="document-chat-prompt">{documentPrompt}</p>}
          {(documentJob.status === 'queued' || documentJob.status === 'validating' || documentJob.status === 'processing') && <p className="document-chat-progress"><LoaderCircle size={15} className="spin" /> Extracting text locally. This does not send the file to an AI model.</p>}
          {documentJob.status === 'needs_review' && <>
            <p className="document-chat-limitation">{documentJob.model_processing_consented && isDocumentPoCreationRequest(documentPrompt)
              ? 'FaroAI is checking the recognized text against GIS and preparing a PO preview now. Correct the text below and retry if needed. Nothing is written to GIS until you confirm the verified PO preview.'
              : 'OCR and text review only. To prepare a PO, attach the document again and ask naturally, for example: “Add this document to a PO.”'}</p>
            {(documentJob.pages ?? []).map((page) => <div className="document-chat-page" key={page.page_number}><strong>Page {page.page_number}</strong><pre>{page.ocr_text || page.blocks?.map((block) => block.text).join('\n') || 'No text was recognized on this page.'}</pre></div>)}
            {documentJob.model_processing_consented && isDocumentPoCreationRequest(documentPrompt) && procurementPrompt && <DocumentPoCorrectionForm
              key={`${documentJob.id}-${documentJob.correction_version ?? 0}`}
              sourceText={documentOcrDraft || initialDocumentOcrText(documentJob)}
              busy={documentCorrectionBusy}
              onSubmit={(correction) => void retryDocumentPoWithStructuredCorrections(correction)}
            />}
            <label className="document-chat-edit-label" htmlFor="document-ocr-correction">Edit recognized document text</label>
            <textarea id="document-ocr-correction" className="document-chat-ocr-editor" value={documentOcrDraft} onChange={(event) => setDocumentOcrDraft(event.target.value)} maxLength={100000} rows={12} disabled={documentCorrectionBusy} />
            <p className="document-chat-edit-help">Edits are saved to this tenant-scoped document review and used for the PO request. The original page image and OCR evidence remain unchanged.</p>
            <div className="document-chat-actions">
              <button type="button" onClick={() => void saveDocumentCorrectionOnly()} disabled={documentCorrectionBusy || !documentOcrDraft.trim()}>
                {documentCorrectionBusy ? <LoaderCircle size={14} className="spin" /> : null} Save OCR corrections
              </button>
              {documentJob.model_processing_consented && isDocumentPoCreationRequest(documentPrompt) && procurementPrompt && documentOcrDraft.trim() !== (documentJob.corrected_ocr_text ?? initialDocumentOcrText(documentJob)) && <button className="is-primary" type="button" onClick={() => void retryDocumentPoWithCorrections()} disabled={documentCorrectionBusy || !documentOcrDraft.trim()}>
                {documentCorrectionBusy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />} Save corrections and retry PO review
              </button>}
            </div>
          </>}
          {['rejected', 'failed', 'expired', 'cancelled'].includes(documentJob.status) && <p className="shopping-error">{documentJob.error_code === 'no_document_text_detected' ? 'No document text was detected. Try a clearer scan or a PDF with selectable text.' : 'FaroAI could not process this file. No GIS record was changed.'}</p>}
        </section>}
        {referenceImage && <p className="shopping-inline-note" role="status">Image selected: {referenceImage.name}. The image is analyzed for this search and is not saved.</p>}
        {birthdayLookupDraft && !customerBirthdayPrompt && <p className="shopping-inline-note" role="status">Customer birthday lookup · results come from this tenant’s GIS customer records.</p>}
        {!birthdayLookupDraft && selectedFacetEntries.length > 0 && <div className="shopping-selected-tags" aria-label="Selected shopping preferences">
          <span className="shopping-selected-label">Selected preferences</span>
          {selectedFacetEntries.map(([facet, value]) => <button key={facet} type="button" className="shopping-selected-tag" onClick={() => applyFacet(facet, value)} aria-label={`Remove ${facet}: ${value}`}>
            {facet}: {value}<X size={12} />
          </button>)}
          <button type="button" className="shopping-clear-tags" onClick={clearFacets}>Clear all</button>
        </div>}

        {!birthdayLookupDraft && !documentFile && !documentJob && !productPrompt && !pending && guideOpen && <section className="shopping-guide" aria-label="Optional shopping preferences">
          <div className="facet-tabs" role="tablist" aria-label="Shopping preferences">
            {facets.map((facet) => <button key={facet.name} type="button" role="tab" aria-selected={activeFacet === facet.name} className={`facet-tab ${activeFacet === facet.name ? 'is-active' : ''}`} onClick={() => setActiveFacet(facet.name)}>{facet.name}</button>)}
          </div>
          <div className="facet-options" role="tabpanel" aria-label={activeFacetData.name}>
            <p>{activeFacetData.name}</p>
            <div className="facet-option-list">
              {activeFacetData.values.map((value) => <button key={value} type="button" aria-pressed={selectedFacets[activeFacetData.name] === value} className={`facet-option ${selectedFacets[activeFacetData.name] === value ? 'is-selected' : ''}`} onClick={() => applyFacet(activeFacetData.name, value)}>{value}</button>)}
            </div>
          </div>
        </section>}

        {!birthdayLookupDraft && !documentJob && !productPrompt && !answer && <>
        <div className="shopping-consent">
          <label><input type="checkbox" checked={consented} onChange={(event) => { setConsented(event.target.checked); if (event.target.checked) { setError(''); setDocumentError(''); } }} /><span>{documentFile && isDocumentPoCreationRequest(query)
            ? 'I agree to let FaroAI send this document’s extracted OCR text to my configured AI model to prepare a PO preview.'
            : 'I agree to let FaroAI process my question to provide a response.'}</span></label>
          <span>{documentFile && isDocumentPoCreationRequest(query)
            ? 'Only extracted text is sent; the source file and page images stay local. GIS is not changed until you confirm its verified PO preview. Editing this prompt requires consent again; training and shared learning stay off.'
            : 'AI improvement is optional and off unless you opt in below.'}</span>
        </div>
          {!documentFile && <div className="shopping-consent shopping-learning-consent">
          <label><input type="checkbox" checked={knowledgeImprovementConsented} onChange={(event) => setKnowledgeImprovementConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed as knowledge for this tenant's search.</span></label>
        </div>}
        {!documentFile && (trainingOptions.local || trainingOptions.shared) && <div className="shopping-consent shopping-learning-consent">
          {trainingOptions.local && <label><input type="checkbox" checked={trainingLocalConsented} onChange={(event) => setTrainingLocalConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed for improving this organization's local model. It will not be shared with other tenants.</span></label>}
          {trainingOptions.shared && <label><input type="checkbox" checked={trainingSharedConsented} onChange={(event) => setTrainingSharedConsented(event.target.checked)} /><span>Allow this scrubbed question and AI answer to be reviewed for a FaroAI shared model that may help other customers.</span></label>}
        </div>}
        </>}
        {voiceMessage && <p className="shopping-inline-note" role="status">{voiceMessage}</p>}
        {error && <p className="shopping-error" role="alert">{error}</p>}
      </section>

      {procurementPrompt && <ProcurementAssistant key={`${procurementPrompt}-${procurementDocumentJobId ?? ''}-${procurementRunId}`} initialPrompt={procurementPrompt} documentJobId={procurementDocumentJobId} onCancel={() => { setProcurementPrompt(null); setProcurementDocumentJobId(null); }} />}

      {customerBirthdayPrompt && tenantSession && <CustomerBirthdayAssistant key={customerBirthdayPrompt} tenantId={tenantSession.tenant.id} prompt={customerBirthdayPrompt} onClose={() => setCustomerBirthdayPrompt(null)} />}

      {productPrompt && <section className="catalog-results product-prompt-results" aria-live="polite" aria-label="Create GIS products">
        <ProductCreation key={productPrompt} promptText={productPrompt} onCancel={() => setProductPrompt(null)} />
      </section>}

      {pending && <p className="shopping-loading" role="status"><LoaderCircle size={16} className="spin" /> Finding the right pieces for you…</p>}
      {answer && <section className="catalog-results" aria-live="polite" aria-label="Search results">
        {answer.products.length === 0 && answer.answer && <p className="catalog-answer">{answer.answer}</p>}
        {answer.products.length > 0 && <>
        <div className="catalog-results-head">
          <div><span>Showing ({visibleProducts.length})</span></div>
          <label className="stock-toggle"><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /><span>In stock only</span></label>
        </div>
        {visibleProducts.length > 0 ? <div className="catalog-card-grid">
          {visibleProducts.map((product, index) => <article className="catalog-product-card" key={product.id ?? product.sku ?? index}>
            <div className="catalog-image-frame">
              <ProductImage src={product.image} productName={product.name ?? 'Jewelry'} className="catalog-product-image" />
            </div>
            <h2 className="catalog-product-name">{product.name ?? 'Jewelry selection'}</h2>
            <p className="catalog-product-sku">{product.sku ?? 'Curated for you'}</p>
            <div className="catalog-product-meta">
              <div>{product.price !== null && product.price !== undefined && product.currency ? <p className="catalog-product-price">{money(product.price, product.currency)}</p> : <p className="catalog-product-price catalog-price-pending">&nbsp;</p>}
                {product.availability && <p className={`catalog-product-stock ${isInStock(product.availability) ? 'is-available' : ''}`}>{product.availability.replaceAll('_', ' ')}</p>}
              </div>
              <button className="catalog-add-button" type="button" aria-label={`Choose options for ${product.name ?? 'jewelry'}`} onClick={() => openProduct(product)}><Plus size={21} strokeWidth={1.4} /></button>
            </div>
            {product.summary && <p className="catalog-product-summary">{product.summary}</p>}
          </article>)}
        </div> : <div className="catalog-empty">No in-stock pieces in these results.</div>}
        </>}
        {answer.sources.some((source) => source.kind === 'mcp') && <p className="catalog-source-note">Product details provided by {answer.sources.filter((source) => source.kind === 'mcp').map((source) => source.label).filter(Boolean).join(', ') || 'a connected MCP source'}.</p>}
        {answer.sources.length > 0 && !answer.sources.some((source) => source.kind === 'mcp') && <p className="catalog-source-note">Retrieved {answer.sources.length} approved knowledge source{answer.sources.length === 1 ? '' : 's'}; relevance may vary.</p>}
      </section>}

      <footer className="shopping-footer">Thoughtful discoveries, guided by FaroAI</footer>

      {activeProduct && <div className="product-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProduct(null); }}>
        <aside className="product-option-drawer" role="dialog" aria-modal="true" aria-label={`${activeProduct.name ?? 'Jewelry'} options`}>
          <button className="drawer-close" type="button" aria-label="Close product options" onClick={() => setActiveProduct(null)}><X size={18} /></button>
          <div className="drawer-product-image">
            <ProductImage src={activeProduct.image} productName={activeProduct.name ?? 'Jewelry'} className="drawer-product-image-content" />
          </div>
          <h2>{activeProduct.name ?? 'Jewelry selection'}</h2>
          <p className="drawer-sku">{activeProduct.sku ?? 'Curated for you'}</p>
          <label className="drawer-select"><span className="sr-only">Metal</span><select value={drawerOptions.metal} onChange={(event) => setDrawerOptions((current) => ({ ...current, metal: event.target.value }))}><option>White gold</option><option>Yellow gold</option><option>Rose gold</option><option>Platinum</option></select><ChevronDown size={15} /></label>
          <label className="drawer-select"><span className="sr-only">Gemstone</span><select value={drawerOptions.gemstone} onChange={(event) => setDrawerOptions((current) => ({ ...current, gemstone: event.target.value }))}><option>Diamond</option><option>Sapphire</option><option>Pearl</option><option>Emerald</option><option>Ruby</option></select><ChevronDown size={15} /></label>
          <label className="drawer-select"><span className="sr-only">Size</span><select value={drawerOptions.size} onChange={(event) => setDrawerOptions((current) => ({ ...current, size: event.target.value }))}>{productSizeChoices(activeProduct.productType).map((size) => <option key={size}>{size}</option>)}</select><ChevronDown size={15} /></label>
          <button className="drawer-add-button" type="button">Add to Order</button>
        </aside>
      </div>}
    </main>
  );
}
