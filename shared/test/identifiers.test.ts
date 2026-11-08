import { describe, expect, it } from 'vitest';
import {
  CROCKFORD_ALPHABET,
  JOIN_CODE_LENGTH,
  createUlid,
  formatJoinCode,
  generateJoinCode,
  isUlid,
  normalizeJoinCode,
  ulidTime,
} from '../src/index.js';

describe('join codes', () => {
  it('generates codes from the Crockford alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      for (const char of code) expect(CROCKFORD_ALPHABET).toContain(char);
      expect(normalizeJoinCode(code)).toBe(code);
    }
  });

  it('normalizes what people type', () => {
    expect(normalizeJoinCode('k7p-3qx')).toBe('K7P3QX');
    expect(normalizeJoinCode(' K7P 3QX ')).toBe('K7P3QX');
    expect(normalizeJoinCode('O1L-I0o')).toBe('011100');
  });

  it('rejects codes with the wrong length or excluded letters', () => {
    expect(normalizeJoinCode('K7P3Q')).toBeNull();
    expect(normalizeJoinCode('K7P3QXZ')).toBeNull();
    expect(normalizeJoinCode('K7P3QU')).toBeNull();
    expect(normalizeJoinCode('K7P3Q!')).toBeNull();
  });

  it('formats codes in two groups', () => {
    expect(formatJoinCode('K7P3QX')).toBe('K7P-3QX');
  });
});

describe('ULIDs', () => {
  it('creates valid, time-ordered identifiers', () => {
    const earlier = createUlid(1_700_000_000_000);
    const later = createUlid(1_700_000_000_001);
    expect(isUlid(earlier)).toBe(true);
    expect(isUlid(later)).toBe(true);
    expect(earlier.slice(0, 10) < later.slice(0, 10)).toBe(true);
    expect(ulidTime(earlier)).toBe(1_700_000_000_000);
  });

  it('rejects malformed identifiers', () => {
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(isUlid('01arz3ndektsv4rrffq69g5fav')).toBe(false);
    expect(isUlid('81ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAU')).toBe(false);
    expect(isUlid(42)).toBe(false);
  });
});
