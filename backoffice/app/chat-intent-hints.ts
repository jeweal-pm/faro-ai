export type ChatDocumentFormat = 'pdf' | 'xlsx' | 'docx';
export type PdfOrientation = 'portrait' | 'landscape';

// These are routing and format hints, not a phrase grammar. The full user
// message still goes to the Jev-selected task model for semantic interpretation.
const DOCUMENT_FORMAT_HINTS: { format: ChatDocumentFormat; pattern: RegExp }[] = [
  { format: 'xlsx', pattern: /\b(?:xlsx|excel|spreadsheet)\b|(?:เอ็กเซล|เอกเซล|ไฟล์ตาราง)/i },
  { format: 'pdf', pattern: /\b(?:pdf|portable document format)\b|(?:ไฟล์\s*pdf|พีดีเอฟ)/i },
  { format: 'docx', pattern: /\b(?:docx|word|word document|word file)\b|(?:ไฟล์\s*word|เวิร์ด)/i },
];

const EXPORT_ACTION_HINT = /\b(?:export|download|generate|create|save|provide|prepare|make|give|get|need|want|send|turn|put|convert|attach|print|share)\b|\bplease\b|(?:ส่งออก|ดาวน์โหลด|สร้าง(?:ไฟล์)?|ทำ(?:เป็น|ไฟล์)?|ขอ(?:เป็น|ไฟล์)?|แปลง|แนบ|พิมพ์|จัดทำ)/i;

export function requestedDocument(prompt: string): ChatDocumentFormat | null {
  return DOCUMENT_FORMAT_HINTS.find(({ pattern }) => pattern.test(prompt))?.format ?? null;
}

export function requestedPdfOrientation(prompt: string): PdfOrientation | undefined {
  if (/\b(?:portrait|portarit|portait|portriat|vertical|upright)\b|แนวตั้ง|กระดาษ\s*ตั้ง|หน้ากระดาษ\s*ตั้ง/i.test(prompt)) return 'portrait';
  if (/\b(?:landscape|horizontal)\b|แนวนอน|กระดาษ\s*นอน|หน้ากระดาษ\s*นอน/i.test(prompt)) return 'landscape';
  return undefined;
}

export function hasExplicitDocumentExport(prompt: string): boolean {
  return requestedDocument(prompt) !== null && EXPORT_ACTION_HINT.test(prompt);
}

export function isDocumentRequestHint(prompt: string): boolean {
  return hasExplicitDocumentExport(prompt);
}

export function hasExportScope(prompt: string): boolean {
  const words = prompt.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const requestWords = new Set([
    'pdf', 'portable', 'document', 'format', 'page', 'xlsx', 'excel', 'spreadsheet', 'docx', 'word',
    'portrait', 'portarit', 'portait', 'portriat', 'landscape', 'vertical', 'upright', 'horizontal',
    'orientation', 'layout', 'design', 'redesign', 'style', 'styled', 'po', 'purchase', 'order', 'orders',
    'export', 'download', 'generate', 'create', 'save', 'provide', 'prepare', 'make', 'give', 'get',
    'need', 'want', 'send', 'turn', 'put', 'convert', 'attach', 'print', 'share', 'please', 'could',
    'would', 'can', 'you', 'me', 'my', 'i', 'd', 'like', 'just', 'a', 'an', 'the', 'it', 'this', 'that', 'these', 'those',
    'as', 'into', 'in', 'to', 'for', 'of', 'ขอ', 'ช่วย', 'ทำ', 'สร้าง', 'เป็น', 'ไฟล์', 'ให้', 'หน่อย',
  ]);
  return words.some((word) => !requestWords.has(word));
}
