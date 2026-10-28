import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { clientMessageSchema, roomCodeSchema } from './schema';

describe('toCsv', () => {
  it('quotes separators and blanks missing values', () => {
    expect(
      toCsv(
        ['a', 'b', 'c'],
        [
          ['x,y', null, 1.5],
          ['say "hi"', NaN, 0],
        ],
      ),
    ).toBe('a,b,c\n"x,y",,1.5\n"say ""hi""",,0\n');
  });
});

describe('schema', () => {
  it('normalises room codes and rejects look-alike characters', () => {
    expect(roomCodeSchema.parse(' a7k2 ')).toBe('A7K2');
    expect(roomCodeSchema.safeParse('A0K2').success).toBe(false);
    expect(roomCodeSchema.safeParse('AIK2').success).toBe(false);
  });

  it('rejects static sessions outside 1–5 minutes', () => {
    expect(clientMessageSchema.safeParse({ type: 'session.start', durationS: 30 }).success).toBe(
      false,
    );
    expect(clientMessageSchema.safeParse({ type: 'session.start', durationS: 300 }).success).toBe(
      true,
    );
  });
});
