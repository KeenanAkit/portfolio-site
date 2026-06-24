import { describe, it, expect } from 'vitest';
import { makeKonamiMatcher } from './useKonami';

describe('makeKonamiMatcher', () => {
  const SEQ = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ];

  it('matches the exact Konami sequence', () => {
    const matcher = makeKonamiMatcher();
    for (let i = 0; i < SEQ.length - 1; i++) {
      expect(matcher(SEQ[i])).toBe(false);
    }
    expect(matcher(SEQ[SEQ.length - 1])).toBe(true);
  });

  it('is case-insensitive on letters (capslock-friendly)', () => {
    const matcher = makeKonamiMatcher();
    for (let i = 0; i < SEQ.length - 2; i++) matcher(SEQ[i]);
    matcher('B');
    expect(matcher('A')).toBe(true);
  });

  it('survives leading noise — partial sequences slide off the buffer', () => {
    const matcher = makeKonamiMatcher();
    // Type a bunch of random keys first.
    'jklasdfqwertyABC '.split('').forEach((k) => matcher(k));
    // Then the real sequence.
    for (let i = 0; i < SEQ.length - 1; i++) matcher(SEQ[i]);
    expect(matcher(SEQ[SEQ.length - 1])).toBe(true);
  });

  it('does not re-fire on the next key after a match', () => {
    const matcher = makeKonamiMatcher();
    for (let i = 0; i < SEQ.length - 1; i++) matcher(SEQ[i]);
    expect(matcher(SEQ[SEQ.length - 1])).toBe(true);
    expect(matcher('a')).toBe(false);
  });

  it('rejects when the last key is wrong', () => {
    const matcher = makeKonamiMatcher();
    for (let i = 0; i < SEQ.length - 1; i++) matcher(SEQ[i]);
    expect(matcher('z')).toBe(false);
  });

  it('rejects when the order is wrong', () => {
    const matcher = makeKonamiMatcher();
    // Swap ArrowLeft and ArrowRight at positions 4 and 5 — actually different keys.
    const wrong = [...SEQ];
    [wrong[4], wrong[5]] = [wrong[5], wrong[4]];
    for (let i = 0; i < wrong.length - 1; i++) matcher(wrong[i]);
    expect(matcher(wrong[wrong.length - 1])).toBe(false);
  });
});
