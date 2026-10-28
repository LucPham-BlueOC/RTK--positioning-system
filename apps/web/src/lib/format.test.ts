import { describe, expect, it } from 'vitest';
import { fmtDuration, parseMetres } from './format';

describe('parseMetres', () => {
  it('accepts comma and dot decimals', () => {
    expect(parseMetres('20,00')).toBe(20);
    expect(parseMetres(' 20.5 ')).toBe(20.5);
    expect(parseMetres('7')).toBe(7);
  });

  it('rejects empty, zero, negative and junk', () => {
    for (const bad of ['', '0', '-3', 'abc', '1,2,3', '20m']) expect(parseMetres(bad)).toBeNull();
  });
});

describe('fmtDuration', () => {
  it('formats remaining time as m:ss', () => {
    expect(fmtDuration(299_001)).toBe('5:00');
    expect(fmtDuration(61_000)).toBe('1:01');
    expect(fmtDuration(-5)).toBe('0:00');
  });
});
