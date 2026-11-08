import { CROCKFORD_ALPHABET, randomCrockford } from './crockford.js';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

export function createUlid(now: number = Date.now()): string {
  let time = '';
  let remaining = Math.floor(now);
  for (let i = 0; i < 10; i++) {
    const digit = remaining % 32;
    time = CROCKFORD_ALPHABET.charAt(digit) + time;
    remaining = (remaining - digit) / 32;
  }
  return time + randomCrockford(16);
}

export function ulidTime(id: string): number {
  let time = 0;
  for (let i = 0; i < 10; i++) {
    time = time * 32 + CROCKFORD_ALPHABET.indexOf(id.charAt(i));
  }
  return time;
}
