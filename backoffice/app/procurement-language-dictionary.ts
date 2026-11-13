/**
 * Small, hand-maintained bilingual aliases for deterministic analysis of PO
 * rows that are already loaded in the current chat.
 *
 * This is a hint lexicon, not a prompt grammar: do not rewrite the user's text,
 * infer GIS records, or use a match to grant permissions. Unknown wording goes
 * through the normal Jev-selected model path.
 */
export type ProcurementAnalysisOperation = 'count_lines' | 'count_orders' | 'sum' | 'average' | 'minimum' | 'maximum';
export type ProcurementAnalysisField = 'quantity' | 'unit_price' | 'line_total';

type DictionaryEntry<T extends string> = { value: T; aliases: readonly RegExp[] };

export const PROCUREMENT_ANALYSIS_OPERATIONS: readonly DictionaryEntry<ProcurementAnalysisOperation>[] = [
  { value: 'count_orders', aliases: [
    /\b(?:how many|count|number of|total number of)\b.{0,48}\b(?:purchase orders?|pos?)\b/i,
    /\b(?:purchase orders?|pos?)\b.{0,32}\b(?:count|how many|number)\b/i,
    /(?:มีกี่|นับจำนวน|จำนวนทั้งหมด|รวมทั้งหมดกี่).{0,32}(?:ใบสั่งซื้อ|ใบ\s*po|\bpo\b)/i,
    /(?:ใบสั่งซื้อ|ใบ\s*po|\bpo\b).{0,32}(?:มีกี่|นับจำนวน|จำนวนทั้งหมด)/i,
  ] },
  { value: 'count_lines', aliases: [
    /\b(?:how many|count|number of|total number of)\b.{0,48}\b(?:line items?|lines?|items?|products?|rows?)\b/i,
    /\b(?:line items?|lines?|items?|products?|rows?)\b.{0,32}\b(?:count|how many|number)\b/i,
    /(?:มีกี่|นับจำนวน|จำนวนทั้งหมด|รวมทั้งหมดกี่).{0,32}(?:รายการสินค้า|บรรทัดสินค้า|รายการ|สินค้า|ชิ้น)/i,
    /(?:รายการสินค้า|บรรทัดสินค้า|รายการ|สินค้า|ชิ้น).{0,32}(?:มีกี่|นับจำนวน|จำนวนทั้งหมด)/i,
  ] },
  { value: 'average', aliases: [
    /\b(?:average|avg|mean)\b/i, /ค่าเฉลี่ย|เฉลี่ย/i,
  ] },
  { value: 'minimum', aliases: [
    /\b(?:minimum|min|lowest|least|cheapest|smallest)\b/i, /ค่าต่ำสุด|ต่ำสุด|น้อยที่สุด|ถูกที่สุด/i,
  ] },
  { value: 'maximum', aliases: [
    /\b(?:maximum|max|highest|most expensive|largest)\b/i, /ค่าสูงสุด|สูงสุด|มากที่สุด|แพงที่สุด/i,
  ] },
  { value: 'sum', aliases: [
    /\b(?:sum(?: up)?|add up|total up|calculate(?: the)?(?: total)?(?: line)?(?: amount)?|what is the total(?: line)? amount)\b/i,
    /รวมยอด|รวมทั้งหมด|คำนวณยอดรวม|ยอดรวมทั้งหมด/i,
  ] },
];

export const PROCUREMENT_ANALYSIS_FIELDS: readonly DictionaryEntry<ProcurementAnalysisField>[] = [
  { value: 'quantity', aliases: [
    /\b(?:qty|quantities|quantity|units|pieces?)\b|\bnumber\s+of\s+units\b/i,
    /จำนวน|ปริมาณ|กี่ชิ้น/i,
  ] },
  { value: 'unit_price', aliases: [
    /\b(?:unit\s+price|price\s+per\s+unit|cost\s+per\s+unit)\b/i,
    /ราคาต่อหน่วย|ราคาชิ้นละ|ต้นทุนต่อหน่วย/i,
  ] },
  { value: 'line_total', aliases: [
    /\b(?:line\s+(?:total|amount)|total\s+per\s+line|amounts?|spend|cost|price|value)\b/i,
    /ยอดต่อรายการ|ยอดรวมต่อรายการ|ยอดรวม|มูลค่า|ราคา/i,
  ] },
];

export function matchDictionary<T extends string>(prompt: string, entries: readonly DictionaryEntry<T>[]): T | null {
  return entries.find((entry) => entry.aliases.some((pattern) => pattern.test(prompt)))?.value ?? null;
}
