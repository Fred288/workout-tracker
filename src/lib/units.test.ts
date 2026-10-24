import { describe, expect, it } from 'vitest';
import { formatNumber, kgToUnit, parseNumber, unitToKg } from './units';

describe('units', () => {
  it('converts kg and lb both ways', () => {
    expect(kgToUnit(100, 'kg')).toBe(100);
    expect(kgToUnit(100, 'lb')).toBe(220.5);
    expect(unitToKg(220.462, 'lb')).toBeCloseTo(100, 2);
  });

  it('parses German and English decimals', () => {
    expect(parseNumber('62,5')).toBe(62.5);
    expect(parseNumber('62.5')).toBe(62.5);
    expect(parseNumber(' ')).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('-5')).toBeUndefined();
  });

  it('formats with comma', () => {
    expect(formatNumber(62.5)).toBe('62,5');
    expect(formatNumber(60)).toBe('60');
  });
});
