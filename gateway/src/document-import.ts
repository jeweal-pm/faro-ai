import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, type CipherGCM } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AdminVariables } from './admin.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 32 * 1024;
const MAX_PDF_PAGES = 25;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const REGISTRY_VERSION = '1.0.0';
const CONSENT_VERSION = 2;
const SOURCE_RETENTION_HOURS = 24;
const REVIEW_RETENTION_DAYS = 7;
const MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

type AuthContext = {
  tenant: { id: string; consent_version: number };
  scopes: string[];
  apiKeyId: string;
  actorId: string;
  clientCredentialId?: string | null;
  consent: { ai_chat: boolean; ai_improve: boolean; ai_training_local: boolean; ai_training_shared: boolean };
  exportRequested: boolean;
};
type Variables = AdminVariables & { auth: AuthContext };
type DocumentType = {
  type_id: string;
  family: string;
  label: { en: string; th: string };
  aliases: { en: string[]; th: string[] };
  accepted_formats: string[];
  support_status: 'registered_only';
  capabilities: { classify: false; extract: false; review: true; gis_preview: false; gis_write: false };
};
type ImportConfig = {
  enabled: boolean;
  sourceRoot: string;
  previewRoot: string;
  encryptionKey: string;
  apiKeyPepper: string;
};

type ProcurementDispatch = (request: Request, tenantId: string, correlationId: string, payload: {
  message: string;
  document_context: string;
  document_analysis_consented: true;
}) => Promise<Response>;
type ProcurementConfirmDispatch = (request: Request, tenantId: string, correlationId: string, draftId: string) => Promise<Response>;

const documentTypes: DocumentType[] = [
  { type_id: 'purchase_requisition', family: 'purchase', label: { en: 'Purchase requisition', th: 'ใบขอซื้อ' }, aliases: { en: ['purchase request', 'requisition'], th: ['คำขอซื้อ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'supplier_quotation', family: 'purchase', label: { en: 'Supplier quotation', th: 'ใบเสนอราคาจากผู้ขาย' }, aliases: { en: ['vendor quote', 'quotation'], th: ['ใบเสนอราคา supplier', 'ใบเสนอราคาผู้ขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'purchase_order', family: 'purchase', label: { en: 'Purchase order', th: 'ใบสั่งซื้อ' }, aliases: { en: ['PO'], th: ['PO', 'ใบ PO'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'purchase_invoice', family: 'purchase', label: { en: 'Purchase invoice / tax invoice', th: 'ใบแจ้งหนี้/ใบกำกับภาษีซื้อ' }, aliases: { en: ['supplier invoice', 'vendor invoice'], th: ['ใบแจ้งหนี้ผู้ขาย', 'ใบกำกับภาษีซื้อ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'supplier_credit_note', family: 'purchase', label: { en: 'Supplier credit note', th: 'ใบลดหนี้จากผู้ขาย' }, aliases: { en: ['vendor credit note'], th: ['ใบลดหนี้ผู้ขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'supplier_debit_note', family: 'purchase', label: { en: 'Supplier debit note', th: 'ใบเพิ่มหนี้จากผู้ขาย' }, aliases: { en: ['vendor debit note'], th: ['ใบเพิ่มหนี้ผู้ขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'delivery_note', family: 'inventory_movement', label: { en: 'Delivery note', th: 'ใบส่งสินค้า' }, aliases: { en: ['delivery slip'], th: ['ใบส่งของ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'packing_list', family: 'inventory_movement', label: { en: 'Packing list', th: 'รายการบรรจุสินค้า' }, aliases: { en: ['packing slip'], th: ['ใบรายการบรรจุ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'goods_received_note', family: 'inventory_movement', label: { en: 'Goods received note', th: 'ใบรับสินค้า' }, aliases: { en: ['GRN'], th: ['ใบรับของ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'inventory_receipt', family: 'inventory_movement', label: { en: 'Inventory receipt', th: 'เอกสารรับสินค้าเข้าคลัง' }, aliases: { en: ['goods receipt'], th: ['รับสินค้าเข้าคลัง'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'stock_transfer', family: 'inventory_movement', label: { en: 'Stock transfer', th: 'ใบโอนย้ายสินค้า' }, aliases: { en: ['inventory transfer'], th: ['ใบโอนสินค้า'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'stock_count', family: 'inventory_movement', label: { en: 'Stock count', th: 'ใบนับสต็อก' }, aliases: { en: ['inventory count', 'stocktake'], th: ['ใบนับสินค้า'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'stock_adjustment', family: 'inventory_movement', label: { en: 'Stock adjustment', th: 'ใบปรับปรุงสต็อก' }, aliases: { en: ['inventory adjustment'], th: ['เอกสารปรับสต็อก'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'goods_return', family: 'inventory_movement', label: { en: 'Goods return', th: 'เอกสารคืนสินค้า' }, aliases: { en: ['return note'], th: ['ใบคืนของ'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_quotation', family: 'sales', label: { en: 'Sales quotation', th: 'ใบเสนอราคา' }, aliases: { en: ['customer quotation', 'sales quote'], th: ['ใบเสนอราคาขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_order', family: 'sales', label: { en: 'Sales order', th: 'ใบสั่งขาย' }, aliases: { en: ['SO'], th: ['SO', 'คำสั่งขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_invoice', family: 'sales', label: { en: 'Sales invoice / tax invoice', th: 'ใบแจ้งหนี้/ใบกำกับภาษีขาย' }, aliases: { en: ['customer invoice'], th: ['ใบกำกับภาษีขาย'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_receipt', family: 'sales', label: { en: 'Payment receipt', th: 'ใบเสร็จรับเงิน' }, aliases: { en: ['receipt'], th: ['ใบรับเงิน'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_credit_note', family: 'sales', label: { en: 'Sales credit note', th: 'ใบลดหนี้ขาย' }, aliases: { en: ['customer credit note'], th: ['ใบลดหนี้'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'sales_debit_note', family: 'sales', label: { en: 'Sales debit note', th: 'ใบเพิ่มหนี้ขาย' }, aliases: { en: ['customer debit note'], th: ['ใบเพิ่มหนี้'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'delivery_order', family: 'sales', label: { en: 'Delivery order', th: 'ใบส่งสินค้าให้ลูกค้า' }, aliases: { en: ['DO'], th: ['ใบส่งของลูกค้า'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'payment_request', family: 'finance', label: { en: 'Payment request', th: 'ใบขอจ่ายเงิน' }, aliases: { en: ['payment requisition'], th: ['คำขอชำระเงิน'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'payment_advice', family: 'finance', label: { en: 'Payment advice', th: 'ใบแจ้งการชำระเงิน' }, aliases: { en: ['payment notification'], th: ['แจ้งการชำระเงิน'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'remittance_advice', family: 'finance', label: { en: 'Remittance advice', th: 'ใบแจ้งรายละเอียดการโอนเงิน' }, aliases: { en: ['remittance notification'], th: ['แจ้งรายการโอนเงิน'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'bank_statement', family: 'finance', label: { en: 'Bank statement', th: 'รายการเดินบัญชีธนาคาร' }, aliases: { en: ['bank transaction statement'], th: ['statement ธนาคาร'] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
  { type_id: 'unknown', family: 'unknown', label: { en: 'Unknown document', th: 'เอกสารที่ยังไม่ทราบประเภท' }, aliases: { en: [], th: [] }, accepted_formats: [...MIME_TYPES], support_status: 'registered_only', capabilities: { classify: false, extract: false, review: true, gis_preview: false, gis_write: false } },
];
const documentTypeById = new Map(documentTypes.map((item) => [item.type_id, item]));

class IntakeError extends Error {
  constructor(readonly code: 'invalid_request' | 'invalid_file' | 'unsupported_file' | 'file_too_large' | 'forbidden' | 'consent_required' | 'not_found' | 'conflict' | 'storage_unavailable' | 'service_unavailable', message: string) {
    super(message);
  }
}

const fail = (c: Context<{ Variables: Variables }>, status: 400 | 403 | 404 | 409 | 413 | 500 | 502 | 503, code: string, message: string) =>
  c.json({ success: false, error: code, message, correlation_id: c.get('correlationId') }, status);

const enforceDocumentScope: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  if (!c.get('auth').scopes.includes('document:import')) return fail(c, 403, 'forbidden', 'This credential does not have the required permission.');
  await next();
};

const enforceDocumentProcurementScope: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const scopes = c.get('auth').scopes;
  if (!scopes.includes('document:import') || !scopes.includes('document:procurement'))
    return fail(c, 403, 'forbidden', 'This credential does not have the required permission.');
  await next();
};
const enforceDocumentProcurementWriteScope: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const scopes = c.get('auth').scopes;
  if (!scopes.includes('document:import') || !scopes.includes('document:procurement') || !scopes.includes('gis:procurement:write'))
    return fail(c, 403, 'forbidden', 'This credential does not have the required permission.');
  await next();
};

function actorHash(config: ImportConfig, tenantId: string, actorId: string): string {
  if (actorId.length < 8 || actorId.length > 300 || /[\u0000-\u001f\u007f]/.test(actorId)) throw new IntakeError('forbidden', 'A trusted document-import actor is required.');
  return createHmac('sha256', config.apiKeyPepper).update(`document-import:${tenantId}:${actorId}`).digest('hex');
}

function cryptoKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new IntakeError('service_unavailable', 'Document intake is not configured.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new IntakeError('service_unavailable', 'Document intake is not configured.');
  return key;
}

async function safeRoot(rootValue: string): Promise<string> {
  if (!isAbsolute(rootValue)) throw new IntakeError('service_unavailable', 'Document storage is unavailable.');
  try {
    const info = await lstat(rootValue);
    const canonical = await realpath(rootValue);
    if (!info.isDirectory() || info.isSymbolicLink() || canonical !== resolve(rootValue)) throw new Error('unsafe_root');
    return canonical;
  } catch { throw new IntakeError('service_unavailable', 'Document storage is unavailable.'); }
}

async function safeChildDirectory(root: string, ...segments: string[]): Promise<string> {
  let current = root;
  for (const segment of segments) {
    if (!/^[0-9a-f-]{36}$/i.test(segment)) throw new IntakeError('invalid_request', 'The document reference is invalid.');
    current = resolve(current, segment);
    if (!current.startsWith(`${root}/`)) throw new IntakeError('invalid_request', 'The document reference is invalid.');
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(current) !== current) throw new Error('unsafe_directory');
  }
  return current;
}

async function safeExistingDirectory(root: string, ...segments: string[]): Promise<string> {
  let current = root;
  for (const segment of segments) {
    if (!/^[0-9a-f-]{36}$/i.test(segment)) throw new IntakeError('invalid_request', 'The document reference is invalid.');
    current = resolve(current, segment);
    if (!current.startsWith(`${root}/`)) throw new IntakeError('invalid_request', 'The document reference is invalid.');
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(current) !== current) throw new IntakeError('not_found', 'The document was not found.');
  }
  return current;
}

async function documentImportReady(pool: Pool, config: ImportConfig): Promise<{ sourceRoot: string; previewRoot: string; key: Buffer }> {
  if (!config.enabled) throw new IntakeError('service_unavailable', 'Document import is not enabled for this deployment.');
  const key = cryptoKey(config.encryptionKey);
  const [sourceRoot, previewRoot] = await Promise.all([safeRoot(config.sourceRoot), safeRoot(config.previewRoot)]);
  const heartbeat = await pool.query(`SELECT 1 FROM document_import_worker_heartbeat
    WHERE singleton=1 AND status='ready' AND last_seen_at > now()-interval '60 seconds'`);
  if (!heartbeat.rowCount) throw new IntakeError('service_unavailable', 'Document processing is not ready for this deployment.');
  return { sourceRoot, previewRoot, key };
}

class BodyCursor {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = Buffer.alloc(0);
  private done = false;
  private total = 0;
  constructor(stream: ReadableStream<Uint8Array>) { this.reader = stream.getReader(); }
  async fill(): Promise<void> {
    if (this.done) return;
    const next = await this.reader.read();
    if (next.done) { this.done = true; return; }
    this.total += next.value.byteLength;
    if (this.total > MAX_MULTIPART_BYTES) throw new IntakeError('file_too_large', 'The document exceeds the upload limit.');
    this.buffer = Buffer.concat([this.buffer, Buffer.from(next.value)]);
  }
  async readExact(size: number): Promise<Buffer> {
    while (this.buffer.length < size && !this.done) await this.fill();
    if (this.buffer.length < size) throw new IntakeError('invalid_file', 'The multipart upload is incomplete.');
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }
  async readUntil(delimiter: Buffer, maximum: number): Promise<Buffer> {
    while (true) {
      const index = this.buffer.indexOf(delimiter);
      if (index >= 0) {
        if (index > maximum) throw new IntakeError('invalid_request', 'The multipart headers are too large.');
        const result = this.buffer.subarray(0, index);
        this.buffer = this.buffer.subarray(index + delimiter.length);
        return result;
      }
      if (this.buffer.length > maximum + delimiter.length) throw new IntakeError('invalid_request', 'The multipart headers are too large.');
      if (this.done) throw new IntakeError('invalid_file', 'The multipart upload is incomplete.');
      await this.fill();
    }
  }
  async streamPart(delimiter: Buffer, maxPartBytes: number, writeChunk: (chunk: Buffer) => Promise<void>): Promise<number> {
    let written = 0;
    while (true) {
      const index = this.buffer.indexOf(delimiter);
      if (index >= 0) {
        if (written + index > maxPartBytes) throw new IntakeError('file_too_large', 'The document exceeds the upload limit.');
        if (index) await writeChunk(this.buffer.subarray(0, index));
        written += index;
        this.buffer = this.buffer.subarray(index + delimiter.length);
        return written;
      }
      const flushSize = this.buffer.length - delimiter.length + 1;
      if (flushSize > 0) {
        if (written + flushSize > maxPartBytes) throw new IntakeError('file_too_large', 'The document exceeds the upload limit.');
        await writeChunk(this.buffer.subarray(0, flushSize));
        written += flushSize;
        this.buffer = this.buffer.subarray(flushSize);
      }
      if (this.done) throw new IntakeError('invalid_file', 'The multipart upload is incomplete.');
      await this.fill();
    }
  }
  async finish(): Promise<void> {
    if (this.buffer.length === 2 && this.buffer.equals(Buffer.from('\r\n'))) this.buffer = Buffer.alloc(0);
    while (!this.done) {
      await this.fill();
      if (this.buffer.length > 0) throw new IntakeError('invalid_file', 'The multipart upload contains unexpected trailing data.');
    }
    if (this.buffer.length > 0) throw new IntakeError('invalid_file', 'The multipart upload contains unexpected trailing data.');
  }
  async cancel(): Promise<void> { await this.reader.cancel().catch(() => undefined); }
}

function parseBoundary(contentType: string): string {
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2] ?? '';
  if (!boundary || boundary.length > 70 || !/^[0-9A-Za-z'()+_,./:=?-]+$/.test(boundary)) throw new IntakeError('invalid_request', 'Submit one valid multipart document.');
  return boundary;
}

function parsePartHeaders(raw: Buffer): { name: string; fileName?: string; mediaType?: string } {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new IntakeError('invalid_request', 'The multipart headers are invalid.'); }
  if (text.length > 8192 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new IntakeError('invalid_request', 'The multipart headers are invalid.');
  const lines = text.split('\r\n');
  if (lines.length > 16) throw new IntakeError('invalid_request', 'The multipart headers are invalid.');
  const headers = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) throw new IntakeError('invalid_request', 'The multipart headers are invalid.');
    const name = line.slice(0, colon).trim().toLowerCase();
    if (headers.has(name)) throw new IntakeError('invalid_request', 'The multipart headers are invalid.');
    headers.set(name, line.slice(colon + 1).trim());
  }
  const disposition = headers.get('content-disposition') ?? '';
  if (!/^form-data(?:\s*;)/i.test(disposition)) throw new IntakeError('invalid_request', 'The multipart upload is invalid.');
  const field = /(?:^|;)\s*name="([^"\r\n]{1,80})"/i.exec(disposition)?.[1];
  if (!field) throw new IntakeError('invalid_request', 'The multipart upload is invalid.');
  const fileName = /(?:^|;)\s*filename="([^"\r\n]{0,500})"/i.exec(disposition)?.[1];
  const mediaType = headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  return { name: field, ...(fileName !== undefined ? { fileName } : {}), ...(mediaType ? { mediaType } : {}) };
}

function safeSourceName(name: string): string {
  const leaf = basename(name.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!leaf || leaf === '.' || leaf === '..') throw new IntakeError('invalid_file', 'The source file name is invalid.');
  return leaf.slice(-180);
}

async function readBoundedText(request: Request, maximumBytes: number): Promise<string> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) throw new IntakeError('file_too_large', 'The correction is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new IntakeError('file_too_large', 'The correction is too large.');
      }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new IntakeError('invalid_request', 'The correction request is invalid.'); }
}

function typeMimeFromBytes(prefix: Buffer): typeof MIME_TYPES[number] | null {
  if (prefix.length >= 5 && prefix.subarray(0, 5).equals(Buffer.from('%PDF-'))) return 'application/pdf';
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg';
  return null;
}

function validateFileIdentity(name: string, declaredMime: string, prefix: Buffer): typeof MIME_TYPES[number] {
  const actual = typeMimeFromBytes(prefix);
  const extension = name.toLowerCase().split('.').at(-1);
  const extensionMime = extension === 'pdf' ? 'application/pdf'
    : extension === 'png' ? 'image/png'
      : ['jpg','jpeg'].includes(extension ?? '') ? 'image/jpeg' : null;
  if (!actual || actual !== declaredMime || actual !== extensionMime) throw new IntakeError('unsupported_file', 'Use a valid PDF, PNG, or JPEG file whose extension and file type match.');
  return actual;
}

type UploadMeta = { sourceName: string; mediaType: typeof MIME_TYPES[number]; sourceBytes: number; sourceSha256: string; selectedTypeId: string | null; languageHint: 'auto' | 'en' | 'th'; poPrompt: string | null };

async function parseAndStoreMultipart(request: Request, sourceRoot: string, tenantId: string, jobId: string, key: Buffer): Promise<UploadMeta> {
  const boundary = parseBoundary(request.headers.get('content-type') ?? '');
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_MULTIPART_BYTES)) throw new IntakeError('file_too_large', 'The document exceeds the upload limit.');
  if (!request.body) throw new IntakeError('invalid_file', 'The multipart upload is empty.');
  const cursor = new BodyCursor(request.body);
  const boundaryBytes = Buffer.from(`--${boundary}`);
  const partEnd = Buffer.from(`\r\n--${boundary}`);
  const directory = await safeChildDirectory(sourceRoot, tenantId);
  const tempPath = resolve(directory, `.${jobId}.${randomUUID()}.uploading`);
  const finalPath = resolve(directory, `${jobId}.fai`);
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  let cipher: CipherGCM | null = null;
  let fileName = '';
  let mediaType: typeof MIME_TYPES[number] | null = null;
  let fileBytes = 0;
  let fileHash = createHash('sha256');
  let prefix = Buffer.alloc(0);
  let prefixChecked = false;
  let fileSeen = false;
  let selectedTypeId: string | null = null;
  let languageHint: UploadMeta['languageHint'] = 'auto';
  let poPrompt: string | null = null;
  const seenFields = new Set<string>();
  const nonce = randomBytes(12);
  try {
    const first = await cursor.readExact(boundaryBytes.length + 2);
    if (!first.subarray(0, boundaryBytes.length).equals(boundaryBytes) || first.subarray(boundaryBytes.length).toString() !== '\r\n') throw new IntakeError('invalid_file', 'The multipart upload is malformed.');
    while (true) {
      const headers = parsePartHeaders(await cursor.readUntil(Buffer.from('\r\n\r\n'), 8192));
      let fieldData = Buffer.alloc(0);
      if (headers.name === 'file' && headers.fileName !== undefined) {
        if (fileSeen) throw new IntakeError('invalid_request', 'Upload one file per document job.');
        fileSeen = true;
        fileName = safeSourceName(headers.fileName);
        const declaredMime = headers.mediaType ?? '';
        if (!MIME_TYPES.includes(declaredMime as typeof MIME_TYPES[number])) throw new IntakeError('unsupported_file', 'Use PDF, PNG, or JPEG documents.');
        fileHandle = await open(tempPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
        await fileHandle.writeFile(Buffer.concat([Buffer.from('FAI1'), nonce]));
        cipher = createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(Buffer.from(`${tenantId}:${jobId}:source`, 'utf8'));
        const writeEncrypted = async (chunk: Buffer) => {
          if (!chunk.length) return;
          fileBytes += chunk.length;
          if (fileBytes > MAX_FILE_BYTES) throw new IntakeError('file_too_large', 'The document exceeds the 20 MiB upload limit.');
          fileHash.update(chunk);
          let data = chunk;
          if (!prefixChecked) {
            const need = Math.max(0, 8 - prefix.length);
            const take = Math.min(need, data.length);
            prefix = Buffer.concat([prefix, data.subarray(0, take)]);
            data = data.subarray(take);
            if (prefix.length >= 8) {
              mediaType = validateFileIdentity(fileName, declaredMime, prefix);
              prefixChecked = true;
              await writeAll(fileHandle!, cipher!.update(prefix));
              prefix = Buffer.alloc(0);
            }
          }
          if (prefixChecked) await writeAll(fileHandle!, cipher!.update(data));
        };
        const written = await cursor.streamPart(partEnd, MAX_FILE_BYTES, writeEncrypted);
        if (!written || fileBytes !== written) throw new IntakeError('invalid_file', 'The uploaded file is empty or malformed.');
        if (!prefixChecked) {
          mediaType = validateFileIdentity(fileName, declaredMime, prefix);
          prefixChecked = true;
          await writeAll(fileHandle, cipher.update(prefix));
        }
        await writeAll(fileHandle, cipher.final());
        await writeAll(fileHandle, cipher.getAuthTag());
        await fileHandle.sync();
        await fileHandle.close();
        fileHandle = null;
      } else {
        if (headers.fileName !== undefined || !['selected_type_id','language_hint','po_prompt'].includes(headers.name) || seenFields.has(headers.name)) throw new IntakeError('invalid_request', 'The multipart upload fields are invalid.');
        seenFields.add(headers.name);
        const length = await cursor.streamPart(partEnd, headers.name === 'po_prompt' ? 1500 : 256, async (chunk) => { fieldData = Buffer.concat([fieldData, chunk]); });
        if (fieldData.length !== length) throw new IntakeError('invalid_request', 'A multipart field is invalid.');
        let value: string;
        try { value = new TextDecoder('utf-8', { fatal: true }).decode(fieldData).trim(); } catch { throw new IntakeError('invalid_request', 'A multipart field is invalid.'); }
        if (headers.name === 'selected_type_id') {
          if (value && !documentTypeById.has(value)) throw new IntakeError('invalid_request', 'Choose a registered document type.');
          selectedTypeId = value || null;
        } else if (headers.name === 'language_hint') {
          if (value && !['auto','en','th'].includes(value)) throw new IntakeError('invalid_request', 'Choose a supported language hint.');
          languageHint = (value || 'auto') as UploadMeta['languageHint'];
        } else {
          if (value.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new IntakeError('invalid_request', 'The PO request is invalid.');
          poPrompt = value || null;
        }
      }
      const suffix = await cursor.readExact(2);
      if (suffix.toString() === '--') {
        const ending = await cursor.readExact(2);
        if (ending.toString() !== '\r\n') throw new IntakeError('invalid_file', 'The multipart upload is malformed.');
        await cursor.finish();
        break;
      }
      if (suffix.toString() !== '\r\n') throw new IntakeError('invalid_file', 'The multipart upload is malformed.');
    }
    if (!fileSeen || !mediaType || !fileHandle && fileBytes <= 0) throw new IntakeError('invalid_file', 'Attach one PDF, PNG, or JPEG document.');
    await rename(tempPath, finalPath);
    return { sourceName: fileName, mediaType, sourceBytes: fileBytes, sourceSha256: fileHash.digest('hex'), selectedTypeId, languageHint, poPrompt };
  } catch (error) {
    await cursor.cancel();
    if (fileHandle) await fileHandle.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, value: Buffer): Promise<void> {
  let offset = 0;
  while (offset < value.length) {
    const result = await handle.write(value, offset, value.length - offset);
    if (!result.bytesWritten) throw new Error('document_storage_write_failed');
    offset += result.bytesWritten;
  }
}

function boundedPagePayload(input: unknown): { pages: (Record<string, unknown> & { page_number: number })[]; fields: Record<string, unknown>[]; line_items: Record<string, unknown>[]; corrected_ocr_text?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { pages: [], fields: [], line_items: [] };
  const source = input as Record<string, unknown>;
  if (!Array.isArray(source.pages) || source.pages.length > MAX_PDF_PAGES) return { pages: [], fields: [], line_items: [] };
  const pages: (Record<string, unknown> & { page_number: number })[] = [];
  for (const raw of source.pages) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const page = raw as Record<string, unknown>;
    const pageNumber = Number(page.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_PDF_PAGES) continue;
    const width = Number(page.width), height = Number(page.height);
    const sourceText = typeof page.ocr_text === 'string' ? page.ocr_text : '';
    const ocrText = sourceText.slice(0, 30_000);
    const blocks = Array.isArray(page.blocks) ? page.blocks.slice(0, 2_000).flatMap((block) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) return [];
      const item = block as Record<string, unknown>;
      const bbox = item.bbox && typeof item.bbox === 'object' && !Array.isArray(item.bbox) ? item.bbox as Record<string, unknown> : {};
      const x = Number(bbox.x), y = Number(bbox.y), w = Number(bbox.width), h = Number(bbox.height);
      if (typeof item.text !== 'string' || !Number.isFinite(x+y+w+h) || x < 0 || y < 0 || w < 0 || h < 0 || x+w > 1.001 || y+h > 1.001) return [];
      return [{ text: item.text.slice(0, 2000), bbox: { x, y, width: w, height: h } }];
    }) : [];
    pages.push({ page_number: pageNumber, width: Number.isInteger(width) && width > 0 && width <= 20_000 ? width : 0,
      height: Number.isInteger(height) && height > 0 && height <= 20_000 ? height : 0, ocr_text: ocrText,
      ocr_text_truncated: page.ocr_text_truncated === true || sourceText.length > 30_000, blocks });
  }
  const correctedText = typeof source.corrected_ocr_text === 'string' && source.corrected_ocr_text.length <= 100_000
    ? source.corrected_ocr_text : undefined;
  return { pages, fields: [], line_items: [], ...(correctedText === undefined ? {} : { corrected_ocr_text: correctedText }) };
}

function serializeJob(row: Record<string, unknown>, id: string) {
  const extraction = boundedPagePayload(row.extraction_payload);
  const pageCount = Number(row.page_count) || 0;
  const pages = extraction.pages.map((page) => ({ ...page, preview_url: `/v1/document-imports/${id}/preview/${page.page_number}` }));
  const candidates = Array.isArray(row.type_candidates) ? row.type_candidates.slice(0, 20) : [];
  const issues = Array.isArray(row.validation_issues) ? row.validation_issues.slice(0, 100) : [];
  return {
    id, status: row.status, registry_version: row.registry_version,
    selected_type_id: row.selected_type_id ?? null, detected_type_id: row.detected_type_id ?? 'unknown',
    type_candidates: candidates,
    error_code: typeof row.error_code === 'string' && /^[a-z0-9_]{1,64}$/.test(row.error_code) ? row.error_code : null,
    source: { file_name: row.source_name, media_type: row.media_type, size_bytes: Number(row.source_bytes), expires_at: row.source_expires_at },
    pages: pages.filter((page) => Number(page.page_number) <= pageCount),
    fields: extraction.fields, line_items: extraction.line_items, corrected_ocr_text: extraction.corrected_ocr_text ?? null, validation_issues: issues,
    correction_version: row.correction_version, source_expires_at: row.source_expires_at, expires_at: row.expires_at,
    model_processing_consented: row.model_processing_consented === true,
    po_preparation_status: row.po_preparation_status ?? 'not_started',
    po_preparation_result: row.po_preparation_result ?? null,
    po_confirmation_result: row.po_confirmation_result ?? null,
  };
}

async function ownedJob(pool: Pool, tenantId: string, apiKeyId: string, actor: string, id: string, clientCredentialId: string | null = null, lock = false) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const result = await pool.query(`SELECT tenant_id,id,api_key_id,actor_hash,source_name,media_type,source_sha256,source_bytes,status,
    registry_version,selected_type_id,detected_type_id,type_candidates,extraction_payload,validation_issues,page_count,
    correction_version,correction_audit,consent_version,consented_at,model_processing_consented,model_consented_at,model_consent_prompt_hash,attempts,claim_id,source_expires_at,source_deleted_at,
    deletion_requested_at,expires_at,preview_deleted_at,error_code,po_preparation_status,po_pending_confirmation_id,po_preparation_result,po_confirmation_result,created_at,updated_at
    FROM business_document_import_jobs WHERE tenant_id=$1 AND id=$2 AND actor_hash=$4
      AND (api_key_id=$3 OR ($5::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM api_keys job_key WHERE job_key.id=business_document_import_jobs.api_key_id
          AND job_key.client_credential_id=$5
      )))
    ${lock ? 'FOR UPDATE OF business_document_import_jobs' : ''}`, [tenantId, id, apiKeyId, actor, clientCredentialId]);
  return result.rows[0] as Record<string, unknown> | undefined ?? null;
}

async function readEncryptedPreview(path: string, key: Buffer, tenantId: string, jobId: string, page: number): Promise<Buffer> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 32 || stat.size > MAX_PREVIEW_BYTES) throw new Error('invalid_preview');
    const bytes = await handle.readFile();
    if (bytes.subarray(0, 4).toString() !== 'FAI1') throw new Error('invalid_preview');
    const nonce = bytes.subarray(4, 16);
    const tag = bytes.subarray(bytes.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(`${tenantId}:${jobId}:preview:${page}`, 'utf8'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(16, bytes.length - 16)), decipher.final()]);
    if (plaintext.length < 3 || plaintext.length > MAX_PREVIEW_BYTES || plaintext[0] !== 0xff || plaintext[1] !== 0xd8 || plaintext[2] !== 0xff) throw new Error('invalid_preview');
    return plaintext;
  } finally { await handle.close(); }
}

async function unlinkObject(path: string): Promise<void> {
  try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

async function removeSourceObject(sourceRoot: string, tenantId: string, jobId: string): Promise<void> {
  const sourceTenant = await safeChildDirectory(sourceRoot, tenantId).catch((error) => error instanceof IntakeError ? null : Promise.reject(error));
  if (sourceTenant) await unlinkObject(resolve(sourceTenant, `${jobId}.fai`));
}

const importDraftSchema = z.object({
  expected_correction_version: z.number().int().min(0),
  selected_type_id: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/).nullable().optional(),
  ocr_text_correction: z.string().max(100_000).optional(),
  field_corrections: z.array(z.object({
    field_id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/),
    value: z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
  }).strict()).max(50).default([]),
  remember_mapping_for_this_tenant: z.boolean().default(false),
}).strict();

const documentProcurementRequestSchema = z.object({ prompt: z.string().trim().min(1).max(1500) }).strict();
const documentProcurementConfirmSchema = z.object({ prompt: z.string().trim().min(1).max(1500), draft_id: z.string().regex(/^[a-f0-9]{32}$/) }).strict();

function normalizeDocumentPrompt(prompt: string) { return prompt.trim().replace(/\s+/g, ' '); }

function isDocumentPoIntent(prompt: string) {
  return /\b(?:add|attach|import|put|use|convert|turn|make|create|prepare|raise|draft)\b.{0,80}\b(?:this|the|attached)?\s*(?:document|file|pdf|quote|quotation|invoice)\b.{0,50}\b(?:to|into|for|as)\s+(?:a\s+)?(?:po|purchase\s+orders?)\b/i.test(prompt)
    || /\b(?:po|purchase\s+orders?)\b.{0,60}\b(?:from|using|based\s+on)\s+(?:this|the|attached)\s+(?:document|file|pdf|quote|quotation|invoice)\b/i.test(prompt)
    || /(?:เพิ่ม|แนบ|นำ|เอา|แปลง|ใช้|สร้าง|ทำ|เปิด|เตรียม).{0,60}(?:เอกสาร|ไฟล์|ใบเสนอราคา|ใบแจ้งหนี้).{0,50}(?:เข้า|เป็น|ทำ|สร้าง|สำหรับ).{0,30}(?:\bpo\b|purchase\s*order|ใบสั่งซื้อ)|(?:\bpo\b|purchase\s*order|ใบสั่งซื้อ).{0,60}(?:จาก|ตาม|โดยใช้).{0,50}(?:เอกสาร|ไฟล์|ใบเสนอราคา|ใบแจ้งหนี้)/i.test(prompt);
}

export function createDocumentImportRoutes(pool: Pool, config: ImportConfig, dispatchProcurement?: ProcurementDispatch, dispatchProcurementConfirm?: ProcurementConfirmDispatch): Hono<{ Variables: Variables }> {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/document-types', enforceDocumentScope, async (c) => {
    if (!config.enabled) return fail(c, 503, 'document_import_disabled', 'Document import is not enabled for this deployment.');
    return c.json({ success: true, data: { registry_version: REGISTRY_VERSION, retention: { source_hours: SOURCE_RETENTION_HOURS, review_days: REVIEW_RETENTION_DAYS }, types: documentTypes }, correlation_id: c.get('correlationId') });
  });

  routes.post('/document-imports', enforceDocumentScope, async (c) => {
    const auth = c.get('auth');
    if (c.req.header('x-faroai-document-import-consent') !== 'true') return fail(c, 403, 'consent_required', 'Confirm document processing for this upload.');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch (error) { return fail(c, 403, 'forbidden', error instanceof IntakeError ? error.message : 'A trusted document-import actor is required.'); }
    const id = randomUUID();
    let sourceRoot = '';
    let saved = false;
    let sourceStored = false;
    try {
      const ready = await documentImportReady(pool, config);
      sourceRoot = ready.sourceRoot;
      const upload = await parseAndStoreMultipart(c.req.raw, sourceRoot, auth.tenant.id, id, ready.key);
      sourceStored = true;
      if (upload.selectedTypeId && !documentTypeById.has(upload.selectedTypeId)) throw new IntakeError('invalid_request', 'Choose a registered document type.');
      const modelProcessingConsented = c.req.header('x-faroai-document-model-consent') === 'true';
      if (modelProcessingConsented && (!upload.poPrompt || !isDocumentPoIntent(upload.poPrompt)))
        throw new IntakeError('consent_required', 'AI processing consent is available only for an explicit PO request attached to this upload.');
      const modelConsentPromptHash = modelProcessingConsented
        ? createHmac('sha256', config.apiKeyPepper).update(`document-po-consent:${auth.tenant.id}:${normalizeDocumentPrompt(upload.poPrompt!)}`).digest('hex') : null;
      await pool.query(`INSERT INTO business_document_import_jobs(tenant_id,id,api_key_id,actor_hash,source_name,media_type,source_sha256,
        source_bytes,registry_version,selected_type_id,language_hint,consent_version,consented_at,model_processing_consented,model_consented_at,model_consent_prompt_hash,source_expires_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,CASE WHEN $13 THEN now() ELSE NULL END,$14,now()+interval '${SOURCE_RETENTION_HOURS} hours',now()+interval '${REVIEW_RETENTION_DAYS} days')`,
      [auth.tenant.id,id,auth.apiKeyId,actor,upload.sourceName,upload.mediaType,upload.sourceSha256,upload.sourceBytes,REGISTRY_VERSION,
        upload.selectedTypeId,upload.languageHint,CONSENT_VERSION,modelProcessingConsented,modelConsentPromptHash]);
      saved = true;
      return c.json({ success: true, data: { id, status: 'queued', registry_version: REGISTRY_VERSION,
        source_expires_at: new Date(Date.now() + SOURCE_RETENTION_HOURS * 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + REVIEW_RETENTION_DAYS * 86_400_000).toISOString() }, correlation_id: c.get('correlationId') }, 202);
    } catch (error) {
      if (error instanceof IntakeError) {
        const status = error.code === 'consent_required' || error.code === 'forbidden' ? 403
          : error.code === 'file_too_large' ? 413
            : error.code === 'invalid_request' || error.code === 'invalid_file' || error.code === 'unsupported_file' ? 400 : 503;
        return fail(c, status, error.code, error.message);
      }
      return fail(c, 503, 'storage_unavailable', 'The document upload could not be stored securely.');
    } finally {
      if (!saved && sourceStored) await removeSourceObject(sourceRoot, auth.tenant.id, id).catch(() => undefined);
    }
  });

  routes.get('/document-imports/:id', enforceDocumentScope, async (c) => {
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document job was not found.'); }
    try {
      const row = await ownedJob(pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null);
      if (!row || row.deletion_requested_at || row.status === 'cancelled') return fail(c, 404, 'not_found', 'The document job was not found.');
      if (new Date(String(row.expires_at)).getTime() <= Date.now()) return fail(c, 404, 'not_found', 'The document job was not found.');
      return c.json({ success: true, data: serializeJob(row, String(row.id)), correlation_id: c.get('correlationId') });
    } catch { return fail(c, 503, 'document_import_unavailable', 'The document job could not be loaded.'); }
  });

  routes.post('/document-imports/:id/procurement', enforceDocumentProcurementScope, async (c) => {
    if (!config.enabled || !dispatchProcurement) return fail(c, 503, 'document_procurement_unavailable', 'Document-to-PO processing is not available for this deployment.');
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document job was not found.'); }
    let raw: string;
    try { raw = await readBoundedText(c.req.raw, 8192); }
    catch (error) {
      if (error instanceof IntakeError) return fail(c, error.code === 'file_too_large' ? 413 : 400, error.code, error.message);
      return fail(c, 400, 'invalid_request', 'The PO request is invalid.');
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return fail(c, 400, 'invalid_request', 'The PO request is invalid.'); }
    const parsed = documentProcurementRequestSchema.safeParse(input);
    if (!parsed.success || !isDocumentPoIntent(parsed.data?.prompt ?? '')) return fail(c, 400, 'invalid_request', 'Describe how this document should be used to prepare a PO.');
    const client = await pool.connect();
    let started = false;
    try {
      await client.query('BEGIN');
      const row = await ownedJob(client as unknown as Pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null, true);
      if (!row || row.deletion_requested_at || row.status === 'cancelled' || new Date(String(row.expires_at)).getTime() <= Date.now()) {
        await client.query('ROLLBACK'); return fail(c, 404, 'not_found', 'The document job was not found.');
      }
      if (row.model_processing_consented !== true || !row.model_consent_prompt_hash) {
        await client.query('ROLLBACK'); return fail(c, 403, 'consent_required', 'This file was not authorized for AI-assisted PO preparation. Attach it again and authorize that use.');
      }
      const promptHash = createHmac('sha256', config.apiKeyPepper).update(`document-po-consent:${auth.tenant.id}:${normalizeDocumentPrompt(parsed.data.prompt)}`).digest('hex');
      if (promptHash !== row.model_consent_prompt_hash) {
        await client.query('ROLLBACK'); return fail(c, 409, 'consent_prompt_changed', 'The PO request changed after consent. Attach the file again with the updated request and authorize AI processing.');
      }
      if (row.po_preparation_status === 'prepared' || row.po_preparation_status === 'completed') {
        await client.query('COMMIT');
        return c.json({ success: true, data: row.po_preparation_result, correlation_id: c.get('correlationId') });
      }
      if (row.po_preparation_status === 'processing' || row.po_preparation_status === 'confirming') {
        await client.query('ROLLBACK'); return fail(c, 409, 'document_procurement_in_progress', 'FaroAI is already preparing this document. Wait for the current request to finish.');
      }
      if (row.status !== 'needs_review') {
        await client.query('ROLLBACK'); return fail(c, 409, 'document_not_ready', 'Wait for local OCR to finish before preparing the PO preview.');
      }
      const extraction = boundedPagePayload(row.extraction_payload);
      const documentContext = extraction.corrected_ocr_text?.trim()
        || extraction.pages.map((page) => `Page ${page.page_number}\n${String(page.ocr_text ?? '').trim()}`).filter((page) => !/^Page \d+\s*$/.test(page)).join('\n\n').trim();
      if (!documentContext) { await client.query('ROLLBACK'); return fail(c, 409, 'ocr_text_unavailable', 'No readable OCR text is available for PO preparation.'); }
      if (Buffer.byteLength(documentContext, 'utf8') > 32_000 || (extraction.pages.some((page) => page.ocr_text_truncated) && !extraction.corrected_ocr_text)) {
        await client.query('ROLLBACK'); return fail(c, 413, 'ocr_text_limit_exceeded', 'The OCR text is too long or incomplete to send safely. Correct or shorten the recognized text first.');
      }
      await client.query(`UPDATE business_document_import_jobs SET po_preparation_status='processing',po_preparation_result=NULL,
        po_pending_confirmation_id=NULL,po_confirmation_result=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2`, [auth.tenant.id,row.id]);
      await client.query('COMMIT');
      started = true;

      const response = await dispatchProcurement(c.req.raw, auth.tenant.id, c.get('correlationId'), {
        message: parsed.data.prompt,
        document_context: documentContext,
        document_analysis_consented: true,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.success !== true || !body.data || typeof body.data !== 'object' || typeof body.data.answer !== 'string') {
        await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='failed',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='processing'`, [auth.tenant.id,row.id]);
        started = false;
        return c.json(body ?? { success: false, error: 'document_procurement_unavailable', message: 'The PO preview could not be prepared.' }, response.status as 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503);
      }
      const pending = body.data.pending_confirmation ?? null;
      if (pending && (pending.kind !== 'create_purchase_order' || typeof pending.draft_id !== 'string' || !/^[a-f0-9]{32}$/.test(pending.draft_id))) {
        await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='failed',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='processing'`, [auth.tenant.id,row.id]);
        started = false;
        return fail(c, 409, 'document_po_preview_unsupported', 'This request needs additional review before a PO can be created. No GIS write was sent.');
      }
      const result = {
        answer: body.data.answer.slice(0, 20_000),
        pending_confirmation: pending,
        purchase_orders: Array.isArray(body.data.purchase_orders) ? body.data.purchase_orders.slice(0, 100) : [],
        decision_used: body.data.decision_used === true,
      };
      const resultJson = JSON.stringify(result);
      if (Buffer.byteLength(resultJson, 'utf8') > 512_000) {
        await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='failed',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='processing'`, [auth.tenant.id,row.id]);
        started = false;
        return fail(c, 413, 'document_po_preview_too_large', 'The PO preview is too large to store safely.');
      }
      await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='prepared',po_pending_confirmation_id=$1,
        po_preparation_result=$2::jsonb,updated_at=now() WHERE tenant_id=$3 AND id=$4 AND po_preparation_status='processing'`,
      [pending?.draft_id ?? null,resultJson,auth.tenant.id,row.id]);
      started = false;
      return c.json({ success: true, data: result, correlation_id: c.get('correlationId') });
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      if (started) await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='failed',updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='processing'`, [auth.tenant.id,c.req.param('id')]).catch(() => undefined);
      return fail(c, 503, 'document_procurement_unavailable', 'The PO preview could not be prepared from this document.');
    } finally { client.release(); }
  });

  routes.post('/document-imports/:id/procurement/confirm', enforceDocumentProcurementWriteScope, async (c) => {
    if (!config.enabled || !dispatchProcurementConfirm) return fail(c, 503, 'document_procurement_unavailable', 'Document-to-PO confirmation is not available for this deployment.');
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document job was not found.'); }
    let raw: string;
    try { raw = await readBoundedText(c.req.raw, 8192); }
    catch { return fail(c, 400, 'invalid_request', 'The PO confirmation is invalid.'); }
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return fail(c, 400, 'invalid_request', 'The PO confirmation is invalid.'); }
    const parsed = documentProcurementConfirmSchema.safeParse(input);
    if (!parsed.success || !isDocumentPoIntent(parsed.data?.prompt ?? '')) return fail(c, 400, 'invalid_request', 'The PO confirmation is invalid.');
    const client = await pool.connect();
    let row: Record<string, unknown> | null = null;
    try {
      await client.query('BEGIN');
      row = await ownedJob(client as unknown as Pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null, true);
      if (!row || row.deletion_requested_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
        await client.query('ROLLBACK'); return fail(c, 404, 'not_found', 'The document job was not found.');
      }
      const promptHash = createHmac('sha256', config.apiKeyPepper).update(`document-po-consent:${auth.tenant.id}:${normalizeDocumentPrompt(parsed.data.prompt)}`).digest('hex');
      if (row.model_processing_consented !== true || promptHash !== row.model_consent_prompt_hash) {
        await client.query('ROLLBACK'); return fail(c, 403, 'consent_required', 'The document consent does not match this PO request.');
      }
      if (row.po_preparation_status === 'completed') {
        await client.query('COMMIT'); return c.json({ success: true, data: row.po_confirmation_result, correlation_id: c.get('correlationId') });
      }
      if (row.po_preparation_status !== 'prepared' || row.po_pending_confirmation_id !== parsed.data.draft_id) {
        await client.query('ROLLBACK'); return fail(c, 409, 'procurement_preview_expired', 'Review a current PO preview before confirming it.');
      }
      await client.query(`UPDATE business_document_import_jobs SET po_preparation_status='confirming',updated_at=now()
        WHERE tenant_id=$1 AND id=$2`, [auth.tenant.id,row.id]);
      await client.query('COMMIT');
      const response = await dispatchProcurementConfirm(c.req.raw, auth.tenant.id, c.get('correlationId'), parsed.data.draft_id);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.success !== true || !body.data || body.data.kind !== 'create_purchase_order' || body.data.outcome?.created !== true) {
        const terminal = body?.error === 'procurement_write_unknown' || response.status >= 500 ? 'unknown' : 'failed';
        await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status=$1,updated_at=now()
          WHERE tenant_id=$2 AND id=$3 AND po_preparation_status='confirming'`, [terminal,auth.tenant.id,row.id]);
        return c.json(body ?? { success: false, error: 'procurement_write_unknown', message: 'GIS did not return a confirmed PO result. Check GIS before trying again.' }, response.status as 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503);
      }
      const result = { answer: String(body.data.answer ?? '').slice(0, 20_000), kind: 'create_purchase_order', outcome: body.data.outcome };
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 512_000) {
        await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='unknown',updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='confirming'`, [auth.tenant.id,row.id]);
        return fail(c, 502, 'procurement_write_unknown', 'GIS created the PO but FaroAI could not store its result. Check GIS before retrying.');
      }
      await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='completed',po_confirmation_result=$1::jsonb,updated_at=now()
        WHERE tenant_id=$2 AND id=$3 AND po_preparation_status='confirming'`, [JSON.stringify(result),auth.tenant.id,row.id]);
      return c.json({ success: true, data: result, correlation_id: c.get('correlationId') });
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      if (row) await pool.query(`UPDATE business_document_import_jobs SET po_preparation_status='unknown',updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND po_preparation_status='confirming'`, [auth.tenant.id,row.id]).catch(() => undefined);
      return fail(c, 503, 'procurement_write_unknown', 'GIS may have processed the PO confirmation. Check GIS before retrying.');
    } finally { client.release(); }
  });

  routes.get('/document-imports/:id/preview/:page', enforceDocumentScope, async (c) => {
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document preview was not found.'); }
    const page = Number(c.req.param('page'));
    if (!Number.isInteger(page) || page < 1 || page > MAX_PDF_PAGES) return fail(c, 404, 'not_found', 'The document preview was not found.');
    try {
      const row = await ownedJob(pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null);
      if (!row || row.deletion_requested_at || row.status === 'cancelled' || !['needs_review','completed'].includes(String(row.status)) || page > Number(row.page_count) || new Date(String(row.expires_at)).getTime() <= Date.now()) return fail(c, 404, 'not_found', 'The document preview was not found.');
      const key = cryptoKey(config.encryptionKey);
      const previewRoot = await safeRoot(config.previewRoot);
      const directory = await safeExistingDirectory(previewRoot, auth.tenant.id, String(row.id));
      const bytes = await readEncryptedPreview(resolve(directory, `${page}.fai`), key, auth.tenant.id, String(row.id), page);
      return new Response(Uint8Array.from(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="document-page.jpg"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    } catch { return fail(c, 404, 'not_found', 'The document preview was not found.'); }
  });

  routes.patch('/document-imports/:id/draft', enforceDocumentScope, async (c) => {
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document job was not found.'); }
    let raw: string;
    try { raw = await readBoundedText(c.req.raw, 768 * 1024); }
    catch (error) {
      if (error instanceof IntakeError) return fail(c, error.code === 'file_too_large' ? 413 : 400, error.code, error.message);
      return fail(c, 400, 'invalid_request', 'The correction request is invalid.');
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return fail(c, 400, 'invalid_request', 'The correction request is invalid.'); }
    const parsed = importDraftSchema.safeParse(input);
    if (!parsed.success) return fail(c, 400, 'invalid_request', 'The correction request is invalid.');
    if (parsed.data.remember_mapping_for_this_tenant) return fail(c, 409, 'tenant_learning_unavailable', 'Remembering document mappings is not available yet.');
    if (parsed.data.selected_type_id && !documentTypeById.has(parsed.data.selected_type_id)) return fail(c, 400, 'invalid_request', 'Choose a registered document type.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await ownedJob(client as unknown as Pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null, true);
      if (!row) { await client.query('ROLLBACK'); return fail(c, 404, 'not_found', 'The document job was not found.'); }
      if (row.status !== 'needs_review' || new Date(String(row.expires_at)).getTime() <= Date.now()) { await client.query('ROLLBACK'); return fail(c, 409, 'conflict', 'This document is no longer available for correction.'); }
      if (Number(row.correction_version) !== parsed.data.expected_correction_version) { await client.query('ROLLBACK'); return fail(c, 409, 'conflict', 'The document changed. Reload it before saving corrections.'); }
      const payload = boundedPagePayload(row.extraction_payload);
      const corrections = parsed.data.field_corrections;
      const now = new Date().toISOString();
      if (parsed.data.ocr_text_correction !== undefined) {
        const correctedText = parsed.data.ocr_text_correction.trim();
        if (!correctedText || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(correctedText)) {
          await client.query('ROLLBACK');
          return fail(c, 400, 'invalid_request', 'The corrected OCR text is empty or contains unsupported control characters.');
        }
        payload.corrected_ocr_text = correctedText;
      }
      for (const correction of corrections) {
        const matches: Record<string, unknown>[] = [];
        for (const field of payload.fields) if (field.field_id === correction.field_id) matches.push(field);
        for (const item of payload.line_items) if (Array.isArray(item.fields)) for (const field of item.fields) {
          if (field && typeof field === 'object' && (field as Record<string, unknown>).field_id === correction.field_id) matches.push(field as Record<string, unknown>);
        }
        if (matches.length !== 1) { await client.query('ROLLBACK'); return fail(c, 400, 'invalid_request', 'A corrected field is not part of this document.'); }
        matches[0]!.user_value = correction.value;
      }
      const audit = Array.isArray(row.correction_audit) ? [...row.correction_audit] : [];
      if (audit.length + corrections.length + (parsed.data.selected_type_id ? 1 : 0) + (parsed.data.ocr_text_correction !== undefined ? 1 : 0) > 200) { await client.query('ROLLBACK'); return fail(c, 409, 'conflict', 'This document has reached its correction limit.'); }
      for (const correction of corrections) audit.push({ field_id: correction.field_id, value: correction.value, actor_hash: actor, corrected_at: now });
      if (parsed.data.ocr_text_correction !== undefined) audit.push({ field_id: 'document.ocr_text', sha256: createHash('sha256').update(payload.corrected_ocr_text ?? '').digest('hex'), character_count: payload.corrected_ocr_text?.length ?? 0, actor_hash: actor, corrected_at: now });
      const selectedTypeId = Object.hasOwn(parsed.data, 'selected_type_id') ? parsed.data.selected_type_id ?? null : row.selected_type_id ?? null;
      if (Object.hasOwn(parsed.data, 'selected_type_id') && selectedTypeId !== row.selected_type_id) audit.push({ field_id: 'document.type', value: selectedTypeId, actor_hash: actor, corrected_at: now });
      const nextVersion = Number(row.correction_version) + 1;
      await client.query(`UPDATE business_document_import_jobs SET selected_type_id=$1,extraction_payload=$2::jsonb,correction_audit=$3::jsonb,
        correction_version=$4,updated_at=now() WHERE tenant_id=$5 AND id=$6`,
      [selectedTypeId,JSON.stringify(payload),JSON.stringify(audit),nextVersion,auth.tenant.id,row.id]);
      await client.query('COMMIT');
      return c.json({ success: true, data: { id: row.id, status: row.status, selected_type_id: selectedTypeId, corrected_ocr_text: payload.corrected_ocr_text ?? null, correction_version: nextVersion }, correlation_id: c.get('correlationId') });
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return fail(c, 503, 'document_import_unavailable', 'The document correction could not be saved.');
    } finally { client.release(); }
  });

  routes.delete('/document-imports/:id', enforceDocumentScope, async (c) => {
    const auth = c.get('auth');
    let actor: string;
    try { actor = actorHash(config, auth.tenant.id, auth.actorId); }
    catch { return fail(c, 404, 'not_found', 'The document job was not found.'); }
    const client = await pool.connect();
    let row: Record<string, unknown> | null = null;
    try {
      await client.query('BEGIN');
      row = await ownedJob(client as unknown as Pool, auth.tenant.id, auth.apiKeyId, actor, c.req.param('id'), auth.clientCredentialId ?? null, true);
      if (!row) { await client.query('ROLLBACK'); return fail(c, 404, 'not_found', 'The document job was not found.'); }
      if (row.deletion_requested_at || row.status === 'cancelled') {
        await client.query('COMMIT');
        return c.json({ success: true, data: { id: row.id, status: 'deletion_pending' }, correlation_id: c.get('correlationId') }, 202);
      }
      await client.query(`UPDATE business_document_import_jobs SET status='cancelled',claim_id=NULL,
        deletion_requested_at=now(),source_name='',media_type='application/octet-stream',source_sha256=NULL,source_bytes=0,
        selected_type_id=NULL,detected_type_id='unknown',type_candidates='[]'::jsonb,
        extraction_payload='{}'::jsonb,validation_issues='[]'::jsonb,correction_audit='[]'::jsonb,page_count=0,error_code=NULL,
        model_processing_consented=false,model_consented_at=NULL,model_consent_prompt_hash=NULL,
        po_preparation_status='not_started',po_pending_confirmation_id=NULL,po_preparation_result=NULL,po_confirmation_result=NULL,updated_at=now()
        WHERE tenant_id=$1 AND id=$2 AND actor_hash=$3`, [auth.tenant.id,row.id,actor]);
      await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_key_id,action,resource_type,resource_id,metadata)
        VALUES($1,$2,$3,'document_import.deleted','business_document_import',$4,'{}'::jsonb)`,
      [auth.tenant.id,c.get('correlationId'),auth.apiKeyId,row.id]);
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return fail(c, 503, 'document_import_unavailable', 'The document deletion could not be requested.');
    } finally { client.release(); }

    if (row) {
      try {
        const sourceRoot = await safeRoot(config.sourceRoot);
        const directory = await safeChildDirectory(sourceRoot, auth.tenant.id);
        await unlinkObject(resolve(directory, `${String(row.id)}.fai`));
        await pool.query(`UPDATE business_document_import_jobs SET source_deleted_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND deletion_requested_at IS NOT NULL AND source_deleted_at IS NULL`, [auth.tenant.id,row.id]);
      } catch { /* the bounded source cleanup retries deletion-requested sources */ }
    }
    return c.json({ success: true, data: { id: row?.id, status: 'deletion_pending' }, correlation_id: c.get('correlationId') }, 202);
  });

  return routes;
}

export async function cleanupExpiredDocumentSources(pool: Pool, config: ImportConfig): Promise<void> {
  let root: string;
  try { root = await safeRoot(config.sourceRoot); } catch { return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT tenant_id,id FROM business_document_import_jobs
      WHERE (source_expires_at<=now() OR deletion_requested_at IS NOT NULL) AND source_deleted_at IS NULL
      ORDER BY COALESCE(deletion_requested_at,source_expires_at)
      LIMIT 25 FOR UPDATE SKIP LOCKED`);
    for (const row of result.rows) {
      try {
        const directory = await safeChildDirectory(root, row.tenant_id);
        await unlinkObject(resolve(directory, `${row.id}.fai`));
        await client.query(`UPDATE business_document_import_jobs SET source_deleted_at=now(),
          status=CASE WHEN status IN ('queued','processing') THEN 'expired' ELSE status END,
          claim_id=CASE WHEN status IN ('queued','processing') THEN NULL ELSE claim_id END,updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND source_deleted_at IS NULL`, [row.tenant_id,row.id]);
      } catch { /* retry the bounded cleanup on the next pass */ }
    }
    // OCR, prompt-bound consent, and PO results have a shorter review lifetime
    // than the job metadata. Expire them even when the source file was already
    // removed by an earlier cleanup pass.
    await client.query(`UPDATE business_document_import_jobs SET
      extraction_payload='{}'::jsonb,validation_issues='[]'::jsonb,correction_audit='[]'::jsonb,page_count=0,
      model_processing_consented=false,model_consented_at=NULL,model_consent_prompt_hash=NULL,
      po_preparation_status='not_started',po_pending_confirmation_id=NULL,po_preparation_result=NULL,po_confirmation_result=NULL,
      status=CASE WHEN status NOT IN ('cancelled','expired') THEN 'expired' ELSE status END,
      claim_id=NULL,updated_at=now()
      WHERE expires_at<=now() AND (extraction_payload<>'{}'::jsonb OR model_processing_consented
        OR po_preparation_result IS NOT NULL OR po_confirmation_result IS NOT NULL)`);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
  } finally { client.release(); }
}
