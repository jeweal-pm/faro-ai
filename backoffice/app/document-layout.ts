import { requestedPdfOrientation, type PdfOrientation } from './chat-intent-hints';

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx';
export type DocumentLayout = {
  paper_size?: 'a4' | 'a3' | 'letter';
  font_size?: number;
  title_size?: number;
  alignment?: 'left' | 'center' | 'right';
  accent_color?: string;
  text_color?: string;
  title_color?: string;
  header_text_color?: string;
  header_background_color?: string;
  margin_mm?: number;
  subtitle?: string;
  footer?: string;
  page_numbers?: boolean;
  hidden_columns?: string[];
  column_order?: string[];
  image_position?: 'left' | 'center' | 'right';
  image_width_mm?: number;
};
export type DocumentImage = { mime_type: 'image/png' | 'image/jpeg'; base64: string; name: string };
export type DocumentPlan = {
  edit: boolean; orientation?: PdfOrientation; title?: string; layout: DocumentLayout;
  requires_image: boolean; remove_image: boolean; unsupported?: string;
};

export const PO_DOCUMENT_COLUMNS = ['PO number', 'Supplier', 'Date', 'Status', 'Product', 'SKU', 'Quantity', 'Unit price', 'Amount'];

export function directDocumentOrientation(prompt: string): PdfOrientation | undefined {
  return requestedPdfOrientation(prompt);
}

export function needsDocumentModel(prompt: string): boolean {
  return /\b(?:font|typeface|text|title|subtitle|heading|footer|header|margin|spacing|colour|color|image|picture|photo|logo|column|table|page\s*(?:size|number)|a[34]|letter\s*size|redesign|style|resize|move|remove|delete|bigger|smaller|bold|center|centre|align)\b|(?:ตัวอักษร|ขนาดฟอนต์|หัวข้อ|หัวกระดาษ|ท้ายกระดาษ|ขอบกระดาษ|ระยะห่าง|สี|รูป|ภาพ|โลโก้|คอลัมน์|ตาราง|เลขหน้า|จัดวาง|จัดหน้า|ย้าย|ลบ|เพิ่ม)/i.test(prompt);
}

export function isDocumentRevisionHint(prompt: string): boolean {
  if (/\b(?:create|approve|receive|search|find|list)\s+(?:a\s+)?(?:po|purchase\s+order|inventory)\b|(?:สร้าง|อนุมัติ|รับสินค้า|ค้นหา)\s*(?:po|ใบสั่งซื้อ|สินค้า)/i.test(prompt)) return false;
  return directDocumentOrientation(prompt) !== undefined || needsDocumentModel(prompt)
    || /\b(?:pdf|docx|xlsx|document|report|file)\b|(?:เอกสาร|ไฟล์|รายงาน)/i.test(prompt);
}

export function documentLinkLabel(format: DocumentFormat, orientation: PdfOrientation | undefined, version: number): string {
  const layout = format === 'pdf' && orientation ? `${orientation[0].toUpperCase()}${orientation.slice(1)} ` : '';
  return `Download ${layout}${format.toUpperCase()} · version ${version}`;
}
