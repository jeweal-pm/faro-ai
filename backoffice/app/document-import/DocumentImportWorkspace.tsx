'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, FileText, LoaderCircle, Paperclip, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import styles from './DocumentImport.module.css';
import { documentTypeLabel, unwrapApi, type DocumentImportJob, type DocumentTypeCatalog, type DocumentTypeOption } from './model';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'], png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'],
};
const ACTIVE_STATUSES = new Set(['queued', 'processing', 'validating']);
const STATUS_COPY: Record<string, string> = {
  queued: 'Queued for processing', validating: 'Checking the uploaded file', processing: 'Extracting text and preparing safe page previews',
  needs_review: 'Ready for review', completed: 'Review saved', rejected: 'File rejected', failed: 'Processing failed',
  expired: 'This document has expired', cancelled: 'Processing cancelled',
};
const ERROR_COPY: Record<string, string> = {
  no_document_text_detected: 'No readable text was detected. Check that the page is clear and well lit, or upload a PDF with selectable text, then try again.',
};

function csrfToken() {
  if (typeof document === 'undefined') return '';
  const names = ['__Host-faroai_tenant_csrf=', 'faroai_tenant_csrf='];
  const entry = document.cookie.split('; ').find((part) => names.some((name) => part.startsWith(name)));
  if (!entry) return '';
  try { return decodeURIComponent(entry.split('=').slice(1).join('=')); } catch { return ''; }
}

async function readResponse<T>(response: Response): Promise<{ data: T | null; message: string | null; code: string | null }> {
  let body: unknown;
  try { body = await response.json(); } catch { return { data: null, message: 'The document service returned an unreadable response.', code: null }; }
  const result = unwrapApi<T>(body);
  const message = (result.errorCode && ERROR_COPY[result.errorCode]) || result.message;
  if (!response.ok && result.data) return { data: null, message: message ?? 'The document request failed.', code: result.errorCode };
  return { data: response.ok ? result.data : null, message, code: result.errorCode };
}

function statusCopy(status: string) {
  return STATUS_COPY[status] ?? `Document status: ${status.replaceAll('_', ' ')}`;
}

function displayBytes(size?: number) {
  if (!Number.isFinite(size) || !size) return '—';
  return `${(size / (1024 * 1024)).toFixed(size < 1024 * 1024 ? 2 : 1)} MiB`;
}

function formatExpiry(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date);
}

function typeName(typeId: string | null | undefined, types: DocumentTypeOption[]) {
  if (!typeId) return 'Unclassified';
  const match = types.find((type) => type.type_id === typeId);
  return match ? documentTypeLabel(match) : typeId;
}

export default function DocumentImportWorkspace({ tenantName }: { tenantName: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [types, setTypes] = useState<DocumentTypeOption[]>([]);
  const [retentionPolicy, setRetentionPolicy] = useState<{ source_hours: number; review_days: number } | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [languageHint, setLanguageHint] = useState('');
  const [consented, setConsented] = useState(false);
  const [job, setJob] = useState<DocumentImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [manualType, setManualType] = useState('');
  const [savedType, setSavedType] = useState('');
  const [activePage, setActivePage] = useState(1);

  const typesByFamily = useMemo(() => {
    const groups = new Map<string, DocumentTypeOption[]>();
    for (const type of types) {
      const family = type.family || 'Other';
      groups.set(family, [...(groups.get(family) ?? []), type]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [types]);
  const page = job?.pages?.find((item) => item.page_number === activePage) ?? job?.pages?.[0] ?? null;
  const isActive = Boolean(job && ACTIVE_STATUSES.has(job.status));
  const canLabelType = Boolean(job && ['needs_review', 'completed'].includes(job.status));

  async function loadTypes() {
    setCatalogBusy(true); setCatalogError('');
    try {
      const response = await fetch('/api/document-imports/types', { credentials: 'same-origin', cache: 'no-store' });
      const result = await readResponse<DocumentTypeCatalog>(response);
      const policy = result.data?.retention;
      if (!result.data || !Array.isArray(result.data.types) || !policy
        || !Number.isFinite(policy.source_hours) || policy.source_hours < 0
        || !Number.isFinite(policy.review_days) || policy.review_days < 0) {
        throw new Error(result.message ?? 'Document retention policy is unavailable. Upload is disabled until FaroAI can confirm it.');
      }
      setTypes(result.data.types.filter((type) => typeof type.type_id === 'string' && type.type_id.length > 0));
      setRetentionPolicy(policy);
    } catch (cause) {
      setRetentionPolicy(null);
      setCatalogError(cause instanceof Error ? cause.message : 'Document type catalog is unavailable.');
    } finally { setCatalogBusy(false); }
  }

  useEffect(() => { void loadTypes(); }, []);

  async function refreshJob(id: string, signal?: AbortSignal) {
    const response = await fetch(`/api/document-imports/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', signal });
    const result = await readResponse<DocumentImportJob>(response);
    if (!response.ok || !result.data || typeof result.data.status !== 'string') throw new Error(result.message ?? 'The document status could not be loaded.');
    setJob(result.data);
    const selected = result.data.selected_type_id ?? '';
    setManualType(selected);
    setSavedType(selected);
    if (result.data.pages?.length && !result.data.pages.some((item) => item.page_number === activePage)) setActivePage(result.data.pages[0].page_number);
    return result.data;
  }

  useEffect(() => {
    if (!job?.id || !ACTIVE_STATUSES.has(job.status)) return;
    const controller = new AbortController();
    let timeout = 0;
    const schedule = () => {
      timeout = window.setTimeout(async () => {
        try {
          const current = await refreshJob(job.id, controller.signal);
          setRefreshError('');
          if (ACTIVE_STATUSES.has(current.status) && !controller.signal.aborted) schedule();
        } catch (cause) {
          if (!controller.signal.aborted) {
            setRefreshError(cause instanceof Error ? cause.message : 'Status refresh failed.');
            schedule();
          }
        }
      }, 2500);
    };
    schedule();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [job?.id, job?.status]);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    setError(''); setNotice(''); setJob(null); setRefreshError(''); setConsented(false); setSelectedTypeId('');
    const extension = nextFile.name.split('.').pop()?.toLowerCase() ?? '';
    const allowedMimes = MIME_BY_EXTENSION[extension];
    if (!allowedMimes || (nextFile.type && !allowedMimes.includes(nextFile.type))) {
      setFile(null); setError('Choose a PDF, PNG, or JPEG file. Other file formats are not accepted.'); return;
    }
    if (nextFile.size <= 0 || nextFile.size > MAX_FILE_BYTES) {
      setFile(null); setError('The selected file must be smaller than 20 MiB.'); return;
    }
    setFile(nextFile);
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !consented || busy) return;
    setBusy(true); setError(''); setNotice(''); setRefreshError(''); setJob(null);
    const form = new FormData();
    form.set('file', file, file.name);
    if (selectedTypeId) form.set('selected_type_id', selectedTypeId);
    if (languageHint) form.set('language_hint', languageHint);
    try {
      const response = await fetch('/api/document-imports', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: form,
        headers: { 'x-csrf-token': csrfToken(), 'x-faroai-document-import-consent': 'true' },
      });
      const result = await readResponse<DocumentImportJob>(response);
      if (!response.ok || !result.data?.id || !result.data.status) {
        const message = result.message ?? (result.code === 'forbidden'
          ? 'Your tenant account does not have document-import permission.' : 'The upload could not be accepted.');
        throw new Error(message);
      }
      setJob(result.data); setManualType(result.data.selected_type_id ?? selectedTypeId); setSavedType(result.data.selected_type_id ?? selectedTypeId);
      setFile(null); setConsented(false); setNotice('Upload accepted. FaroAI will show the processing status returned by the document service.');
      if (fileInput.current) fileInput.current.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document upload failed.');
    } finally { setBusy(false); }
  }

  async function saveManualType() {
    if (!job || !manualType || manualType === savedType || savingType) return;
    setSavingType(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/document-imports/${encodeURIComponent(job.id)}/draft`, {
        method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({ expected_correction_version: job.correction_version ?? 0, selected_type_id: manualType }),
      });
      const result = await readResponse<DocumentImportJob>(response);
      if (!response.ok) throw new Error(result.message ?? 'The document label could not be saved.');
      if (result.data?.status) setJob(result.data);
      setSavedType(manualType); setNotice('Manual document label saved. Automatic classification is not available yet.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The document label could not be saved.'); }
    finally { setSavingType(false); }
  }

  async function deleteJob() {
    if (!job || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/document-imports/${encodeURIComponent(job.id)}`, {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { 'x-csrf-token': csrfToken() },
      });
      const result = await readResponse<{ deleted?: boolean }>(response);
      if (!response.ok) throw new Error(result.message ?? 'The document could not be deleted.');
      setJob(null); setManualType(''); setSavedType(''); setNotice('Deletion requested. OCR text is cleared and the source file is removed; encrypted previews are being removed by the worker. This document is no longer accessible here.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The document could not be deleted.'); }
    finally { setBusy(false); }
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <a className={styles.brand} href="/" aria-label="FaroAI home">faro<span>✦</span></a>
      <span className={styles.tenant}>{tenantName}</span>
      <a className={styles.back} href="/">Back to discovery</a>
    </header>
    <div className={styles.content}>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>DOCUMENT WORKSPACE</p><h1>Document intake</h1>
          <p>Upload a business document to extract its text and review safe page previews.</p></div>
        <span className={styles.reviewOnly}>Review only · No GIS changes</span>
      </div>

      <section className={styles.notice} aria-label="Current document-processing capabilities">
        <FileText size={20} aria-hidden="true" />
        <div><strong>This first release provides OCR and text review only.</strong>
          <p>Automatic document classification and structured field extraction are not available yet. Uploading a file will not create or change GIS records.</p></div>
      </section>

      {!job && <section className={styles.panel}>
        <div className={styles.panelHeading}><div><h2>Attach one document</h2><p>PDF, PNG, or JPEG · Up to 20 MiB</p></div></div>
        {catalogError && <div className={styles.inlineError} role="alert"><AlertCircle size={16} />{catalogError} <button type="button" onClick={() => void loadTypes()}>Retry</button></div>}
        <form onSubmit={submitUpload}>
          <input ref={fileInput} className={styles.fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            aria-label="Choose a PDF, PNG, or JPEG business document" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
          {!file ? <button className={styles.pickFile} type="button" onClick={() => fileInput.current?.click()} disabled={busy || catalogBusy || !retentionPolicy}>
            <Paperclip size={18} /> Choose a document
          </button> : <div className={styles.fileRow}><FileText size={18} /><div><strong>{file.name}</strong><small>{displayBytes(file.size)}</small></div>
            <button className={styles.iconButton} type="button" aria-label="Remove selected document" onClick={() => { setFile(null); setConsented(false); if (fileInput.current) fileInput.current.value = ''; }}><X size={16} /></button></div>}
          <div className={styles.options}>
            <label>Document type label <select value={selectedTypeId} onChange={(event) => setSelectedTypeId(event.target.value)} disabled={catalogBusy || types.length === 0}>
              <option value="">I’m not sure / leave unclassified</option>
              {typesByFamily.map(([family, options]) => <optgroup key={family} label={family}>{options.map((type) => <option key={type.type_id} value={type.type_id}>{documentTypeLabel(type)}</option>)}</optgroup>)}
            </select><small>Optional manual label. FaroAI does not classify the document automatically in this release.</small></label>
            <label>Text language <select value={languageHint} onChange={(event) => setLanguageHint(event.target.value)}>
              <option value="">Detect automatically</option><option value="th">Thai</option><option value="en">English</option>
            </select><small>Choose a hint only if you know the document language.</small></label>
          </div>
          <label className={styles.consent}>
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} disabled={!file || busy} />
            <span>I agree to process this file for FaroAI OCR and text review. This consent applies to this upload only. It does not authorize external AI-provider sharing, Qdrant/RAG ingestion, model training, or central sharing.</span>
          </label>
          {retentionPolicy ? <p className={styles.retention}>Source file: retained up to {retentionPolicy.source_hours} {retentionPolicy.source_hours === 1 ? 'hour' : 'hours'}. OCR and review data: retained up to {retentionPolicy.review_days} {retentionPolicy.review_days === 1 ? 'day' : 'days'}. You can delete both earlier.</p>
            : <p className={styles.retention} role="status">Retention policy is unavailable. Upload is disabled until FaroAI can confirm how long source and OCR/review data will be retained.</p>}
          <div className={styles.actions}><button className={styles.primary} type="submit" disabled={!file || !consented || busy || catalogBusy || !retentionPolicy}>
            {busy ? <><LoaderCircle className={styles.spin} size={16} /> Uploading…</> : <><Upload size={16} /> Upload for review</>}
          </button></div>
        </form>
      </section>}

      {job && <section className={styles.panel} aria-labelledby="job-heading">
        <div className={styles.jobHeading}>
          <div><p className={styles.eyebrow}>DOCUMENT JOB</p><h2 id="job-heading">{job.source?.file_name || 'Uploaded document'}</h2>
            <p>{displayBytes(job.source?.size_bytes)}{job.source?.media_type ? ` · ${job.source.media_type}` : ''}</p></div>
          <span className={`${styles.status} ${isActive ? styles.statusActive : job.status === 'failed' || job.status === 'rejected' ? styles.statusError : ''}`}>
            {isActive && <LoaderCircle className={styles.spin} size={14} />}{statusCopy(job.status)}
          </span>
        </div>
        {isActive && <p className={styles.serverStatus} role="status">This status is reported by the document service. FaroAI does not estimate a completion percentage.</p>}
        {refreshError && <div className={styles.inlineError} role="alert"><AlertCircle size={16} />{refreshError}<button type="button" onClick={() => void refreshJob(job.id).then(() => setRefreshError('')).catch((cause) => setRefreshError(cause instanceof Error ? cause.message : 'Status refresh failed.'))}><RefreshCw size={13} /> Retry</button></div>}
        {job.status === 'needs_review' || job.status === 'completed' ? <>
          <div className={styles.reviewSummary}>
            <div><span>Type label</span><strong>{typeName(job.selected_type_id ?? job.detected_type_id, types)}</strong></div>
            <div><span>Pages with previews</span><strong>{job.pages?.length ?? 0}</strong></div>
            <div><span>Structured extraction</span><strong>Not available yet</strong></div>
          </div>
          <div className={styles.manualLabel}>
            <label>Set a manual document type label <select value={manualType} onChange={(event) => setManualType(event.target.value)} disabled={!canLabelType || savingType}>
              <option value="">Leave unclassified</option>
              {typesByFamily.map(([family, options]) => <optgroup key={family} label={family}>{options.map((type) => <option key={type.type_id} value={type.type_id}>{documentTypeLabel(type)}</option>)}</optgroup>)}
            </select></label>
            <button className={styles.secondary} type="button" onClick={() => void saveManualType()} disabled={!manualType || manualType === savedType || savingType || !canLabelType}>
              {savingType ? <LoaderCircle className={styles.spin} size={14} /> : <Check size={14} />} Save label
            </button>
          </div>
          <p className={styles.help}>This is a user-provided label for this document, not an AI classification. It does not enable GIS actions or change the registry.</p>
          {job.validation_issues?.length ? <div className={styles.issues} role="status"><strong>Review notes</strong>{job.validation_issues.map((issue, index) => <p key={`${issue.code}-${index}`}>{issue.message}</p>)}</div> : null}
          <div className={styles.previewGrid}>
            <section className={styles.previewPane} aria-label="Safe page preview">
              <div className={styles.subheading}><h3>Safe page preview</h3><span>{job.pages?.length ?? 0} pages</span></div>
              {page ? <>
                <div className={styles.pageNav}>
                  <button type="button" onClick={() => setActivePage((n) => Math.max(1, n - 1))} disabled={activePage <= 1}>Previous</button>
                  <span>Page {page.page_number} of {job.pages?.length ?? 1}</span>
                  <button type="button" onClick={() => setActivePage((n) => Math.min(job.pages?.length ?? 1, n + 1))} disabled={activePage >= (job.pages?.length ?? 1)}>Next</button>
                </div>
                <img className={styles.previewImage} src={`/api/document-imports/${encodeURIComponent(job.id)}/pages/${page.page_number}`} alt={`Safe preview of page ${page.page_number}`} />
                <div className={styles.ocrText}><h4>Text recognized on this page</h4>
                  {page.ocr_text_truncated && <p className={styles.retention} role="status">The document service capped the OCR text shown here. The extracted evidence may be incomplete; check the page preview for additional content.</p>}
                  <pre>{page.ocr_text || page.blocks?.map((block) => block.text).join('\n') || 'No text was recognized on this page.'}</pre></div>
              </> : <p className={styles.empty}>No safe page preview is available for this document.</p>}
            </section>
            <section className={styles.extractedPane} aria-label="Extracted document data">
              <div className={styles.subheading}><h3>Structured fields</h3><span>OCR foundation</span></div>
              <p className={styles.empty}>Structured field extraction and automatic document classification are not available in this release. Review the OCR text beside the safe page image. No GIS record will be created or changed.</p>
            </section>
          </div>
        </> : job.status === 'rejected' || job.status === 'failed' || job.status === 'expired' || job.status === 'cancelled' ? <div className={styles.terminal}>
          <AlertCircle size={18} /><div><strong>{statusCopy(job.status)}</strong><p>{job.error_code && ERROR_COPY[job.error_code] ? ERROR_COPY[job.error_code] : 'The service did not complete this document. No GIS record was created or changed.'}</p></div>
        </div> : null}
        {formatExpiry(job.source_expires_at) && <p className={styles.retention}>Source file expires by {formatExpiry(job.source_expires_at)}. Review data expires by {formatExpiry(job.expires_at) ?? 'the configured retention date'}.</p>}
        <div className={styles.actions}><button className={styles.danger} type="button" onClick={() => void deleteJob()} disabled={busy}>
          {busy ? <LoaderCircle className={styles.spin} size={15} /> : <Trash2 size={15} />} {isActive ? 'Cancel and delete document' : 'Delete document and review data'}
        </button></div>
      </section>}

      {error && <p className={styles.alert} role="alert"><AlertCircle size={16} />{error}</p>}
      {notice && <p className={styles.noticeSuccess} role="status"><Check size={16} />{notice}</p>}
      <footer className={styles.footer}>Private tenant workspace · Source files are not added to RAG, Qdrant, or model training.</footer>
    </div>
  </main>;
}
