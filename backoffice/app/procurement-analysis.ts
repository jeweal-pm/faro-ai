import {
  matchDictionary,
  PROCUREMENT_ANALYSIS_FIELDS,
  PROCUREMENT_ANALYSIS_OPERATIONS,
  type ProcurementAnalysisField,
  type ProcurementAnalysisOperation,
} from './procurement-language-dictionary';

export type AnalysisField = ProcurementAnalysisField;
export type AnalysisOperation = ProcurementAnalysisOperation;
export type ParsedProcurementAnalysis = { operation: AnalysisOperation; field: AnalysisField };

function fieldForPrompt(prompt: string): AnalysisField {
  return matchDictionary(prompt, PROCUREMENT_ANALYSIS_FIELDS) ?? 'line_total';
}

export function parseProcurementAnalysisPrompt(prompt: string): ParsedProcurementAnalysis | null {
  // List/search requests are not calculations. Keep them on the normal assistant
  // path unless the prompt also contains a recognized operation from the lexicon.
  const operation = matchDictionary(prompt, PROCUREMENT_ANALYSIS_OPERATIONS);
  if (!operation) return null;
  return {
    operation,
    field: operation === 'count_lines' || operation === 'count_orders' ? 'line_total' : fieldForPrompt(prompt),
  };
}
