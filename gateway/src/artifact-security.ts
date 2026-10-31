import { createHmac } from 'node:crypto';
import { z } from 'zod';

export const artifactSchema = z.object({
  format: z.enum(['pdf', 'xlsx', 'docx', 'pptx']),
  title: z.string().trim().min(1).max(120),
  columns: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  rows: z.array(z.array(z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))).max(500),
}).strict().refine((value) => value.rows.every((row) => row.length === value.columns.length));

export function artifactActorHash(pepper: string, tenantId: string, apiKeyId: string, actor: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(actor)) return null;
  return createHmac('sha256', pepper).update(`artifact:${tenantId}:${apiKeyId}:${actor}`).digest('hex');
}
