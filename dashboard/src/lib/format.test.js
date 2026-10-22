import { describe, it, expect } from 'vitest';
import { humanize, formatNumber, truncate, dateInputToIso, isoToDateInput } from './format';

describe('format helpers', () => {
  it('humanizes snake and camel case', () => {
    expect(humanize('partially_refunded')).toBe('Partially Refunded');
  });
  it('formats numbers and tolerates missing values', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(typeof formatNumber(undefined)).toBe('string');
  });
  it('truncates', () => {
    expect(truncate('abcdefghij', 5).length).toBeLessThanOrEqual(6);
  });
  it('round-trips a date input', () => {
    expect(isoToDateInput(dateInputToIso('2026-03-05'))).toBe('2026-03-05');
  });
});
