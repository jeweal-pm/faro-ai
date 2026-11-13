import { describe, expect, it } from 'vitest';
import { parseProcurementAnalysisPrompt } from './procurement-analysis';

describe('procurement Base Skill data analysis', () => {
  it('parses requested deterministic calculation and field in English', () => {
    expect(parseProcurementAnalysisPrompt('Calculate total amount')).toEqual({ operation: 'sum', field: 'line_total' });
    expect(parseProcurementAnalysisPrompt('Calculate the total line amount')).toEqual({ operation: 'sum', field: 'line_total' });
    expect(parseProcurementAnalysisPrompt('What is the average unit price?')).toEqual({ operation: 'average', field: 'unit_price' });
  });

  it('parses line and order counts separately', () => {
    expect(parseProcurementAnalysisPrompt('How many line items?')?.operation).toBe('count_lines');
    expect(parseProcurementAnalysisPrompt('How many POs?')?.operation).toBe('count_orders');
  });

  it('parses Thai aggregations and numeric filters are left to the filter executor', () => {
    expect(parseProcurementAnalysisPrompt('คำนวณยอดรวมราคาต่อหน่วย')).toEqual({ operation: 'sum', field: 'unit_price' });
    expect(parseProcurementAnalysisPrompt('Unit price lower than 100')).toBeNull();
  });

  it('does not treat a simple display request as an analysis task', () => {
    expect(parseProcurementAnalysisPrompt('Show the PO total amount and status')).toBeNull();
  });
});
