import { createHmac } from 'node:crypto';
import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const artifactLayoutSchema = z.object({
  paper_size: z.enum(['a4', 'a3', 'letter']).optional(),
  font_size: z.number().min(6).max(18).optional(),
  title_size: z.number().min(10).max(36).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  accent_color: color.optional(),
  text_color: color.optional(),
  title_color: color.optional(),
  header_text_color: color.optional(),
  header_background_color: color.optional(),
  margin_mm: z.number().min(8).max(35).optional(),
  subtitle: z.string().max(500).optional(),
  footer: z.string().max(200).optional(),
  page_numbers: z.boolean().optional(),
  hidden_columns: z.array(z.string().min(1).max(120)).max(19).optional(),
  column_order: z.array(z.string().min(1).max(120)).max(20).optional(),
  image_position: z.enum(['left', 'center', 'right']).optional(),
  image_width_mm: z.number().min(15).max(100).optional(),
}).strict();

const artifactImageSchema = z.object({
  mime_type: z.enum(['image/png', 'image/jpeg']),
  base64: z.string().min(1).max(350_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict().refine((value) => {
  const bytes = Buffer.from(value.base64, 'base64');
  return bytes.length <= 256 * 1024 && bytes.toString('base64') === value.base64;
}, { message: 'invalid_or_oversized_image' });

export const artifactSchema = z.object({
  format: z.enum(['pdf', 'xlsx', 'docx']),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  title: z.string().trim().min(1).max(120),
  columns: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  rows: z.array(z.array(z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))).min(1).max(500),
  layout: artifactLayoutSchema.optional(),
  image: artifactImageSchema.optional(),
}).strict()
  .refine((value) => new Set(value.columns).size === value.columns.length, {
    path: ['columns'], message: 'duplicate_column_header',
  })
  .refine((value) => value.rows.every((row) => row.length === value.columns.length), {
    path: ['rows'], message: 'row_width_mismatch',
  })
  .refine((value) => {
    const hidden = value.layout?.hidden_columns ?? [];
    if (new Set(hidden).size !== hidden.length || hidden.some((column) => !value.columns.includes(column))) return false;
    const visible = value.columns.filter((column) => !hidden.includes(column));
    const ordered = value.layout?.column_order;
    return visible.length > 0 && (!ordered || (ordered.length === visible.length
      && new Set(ordered).size === ordered.length && ordered.every((column) => visible.includes(column))));
  }, { path: ['layout'], message: 'invalid_column_selection' });

export function artifactValidationMessage(issues: readonly { code: string; path: PropertyKey[]; message: string; type?: string }[]): string {
  if (issues.some((issue) => issue.path[0] === 'rows' && issue.message === 'row_width_mismatch'))
    return 'Each document row must have the same number of cells as the column headers.';
  if (issues.some((issue) => issue.path.length === 1 && issue.path[0] === 'rows' && issue.code === 'too_big'))
    return 'The document exceeds the 500-row limit. Narrow the results and export again.';
  if (issues.some((issue) => issue.path[0] === 'rows' && issue.code === 'too_big' && issue.type === 'string'))
    return 'A document cell exceeds the 500-character limit. Shorten the content and export again.';
  if (issues.some((issue) => issue.path[0] === 'columns'))
    return 'The document must contain between 1 and 20 columns, with each heading no longer than 120 characters.';
  if (issues.some((issue) => issue.path[0] === 'image'))
    return 'Attach a PNG or JPEG image no larger than 256 KiB.';
  if (issues.some((issue) => issue.path[0] === 'layout' && issue.message === 'invalid_column_selection'))
    return 'The requested columns must match the available document headers, with at least one visible column.';
  if (issues.some((issue) => issue.path[0] === 'layout'))
    return 'The requested document layout contains an unsupported value.';
  return 'The document data does not match the supported format or field limits.';
}

export function artifactActorHash(pepper: string, tenantId: string, apiKeyId: string, actor: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(actor)) return null;
  return createHmac('sha256', pepper).update(`artifact:${tenantId}:${apiKeyId}:${actor}`).digest('hex');
}
