export type DocumentTypeOption = {
  type_id: string;
  version?: string;
  label?: string | { en?: string; th?: string };
  localized_label?: string;
  names_and_aliases_by_language?: Record<string, string[]>;
  aliases?: string[] | Record<string, string[]>;
  family?: string;
  accepted_formats?: string[];
  support_status?: string;
};

export type DocumentTypeCatalog = {
  registry_version?: string;
  types: DocumentTypeOption[];
  retention: { source_hours: number; review_days: number };
};

export type DocumentPage = {
  page_number: number;
  preview_url?: string;
  width?: number;
  height?: number;
  ocr_text?: string;
  ocr_text_truncated?: boolean;
  blocks?: Array<{ text: string; bbox?: { x: number; y: number; width: number; height: number } }>;
};

export type DocumentImportJob = {
  id: string;
  status: string;
  error_code?: string | null;
  registry_version?: string;
  selected_type_id?: string | null;
  detected_type_id?: string | null;
  type_candidates?: Array<{ type_id: string; label?: string; confidence?: number }>;
  source?: { file_name?: string; media_type?: string; size_bytes?: number };
  model_processing_consented?: boolean;
  pages?: DocumentPage[];
  corrected_ocr_text?: string | null;
  fields?: Array<{
    field_id: string;
    label: string;
    raw_text?: string | null;
    value?: unknown;
    normalized_value?: unknown;
    confidence?: number | null;
    evidence?: Array<{ page_number: number; bbox?: { x: number; y: number; width: number; height: number }; text?: string }>;
  }>;
  line_items?: Array<{ line_id: string; fields: Record<string, unknown>; evidence?: Array<{ page_number: number; text?: string }> }>;
  validation_issues?: Array<{ code: string; severity: string; field_ids?: string[]; message: string }>;
  correction_version?: number;
  source_expires_at?: string;
  expires_at?: string;
};

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error_code?: string;
  error?: string | { code?: string; message?: string };
  message?: string;
};

export function unwrapApi<T>(value: unknown): { data: T | null; message: string | null; errorCode: string | null } {
  if (!value || typeof value !== 'object') return { data: null, message: null, errorCode: null };
  const envelope = value as ApiEnvelope<T>;
  const error = envelope.error_code ?? (typeof envelope.error === 'string' ? envelope.error
    : envelope.error && typeof envelope.error === 'object' ? envelope.error.code ?? null : null);
  const message = envelope.message
    ?? (envelope.error && typeof envelope.error === 'object' ? envelope.error.message ?? null : null);
  if (envelope.success === false) return { data: null, message: message ?? 'The document request could not be completed.', errorCode: error };
  return { data: (envelope.data ?? value) as T, message, errorCode: error };
}

export function documentTypeLabel(type: DocumentTypeOption) {
  return type.localized_label
    ?? (typeof type.label === 'string' ? type.label : type.label?.en ?? type.label?.th)
    ?? type.type_id;
}
