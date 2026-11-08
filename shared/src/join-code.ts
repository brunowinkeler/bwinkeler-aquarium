import { CROCKFORD_ALPHABET, randomCrockford } from './crockford.js';
import { JOIN_CODE_LENGTH } from './limits.js';

export function generateJoinCode(): string {
  return randomCrockford(JOIN_CODE_LENGTH);
}

/** Accepts what people type: lower case, spaces, hyphens, and O/I/L read as 0/1. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (let i = 0; i < code.length; i++) {
    if (CROCKFORD_ALPHABET.indexOf(code.charAt(i)) === -1) return null;
  }
  return code;
}

export function formatJoinCode(code: string): string {
  return code.slice(0, 3) + '-' + code.slice(3);
}
