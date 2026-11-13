import { describe, expect, it } from 'vitest';
import { hasExportScope, requestedPdfOrientation } from './chat-intent-hints';

describe('requested PDF orientation', () => {
  it('recognizes the portrait typo from the reported prompt', () => {
    expect(requestedPdfOrientation('I need portarit pdf design')).toBe('portrait');
  });

  it('recognizes English and Thai orientation requests', () => {
    expect(requestedPdfOrientation('make this PDF vertical')).toBe('portrait');
    expect(requestedPdfOrientation('ขอ PDF แนวตั้ง')).toBe('portrait');
    expect(requestedPdfOrientation('change the PDF to landscape')).toBe('landscape');
    expect(requestedPdfOrientation('ทำ PDF แนวนอน')).toBe('landscape');
  });

  it('keeps automatic orientation when the prompt does not specify one', () => {
    expect(requestedPdfOrientation('Export the PO results as PDF')).toBeUndefined();
  });

  it('does not mistake document layout words for a PO search scope', () => {
    expect(hasExportScope('I need portarit pdf design')).toBe(false);
    expect(hasExportScope('I need a portrait PDF layout')).toBe(false);
    expect(hasExportScope('Make a portrait PDF for Ham pending POs')).toBe(true);
  });
});
