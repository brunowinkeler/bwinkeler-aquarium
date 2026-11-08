export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomCrockford(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    // 256 is a multiple of 32, so masking keeps the distribution uniform.
    result += CROCKFORD_ALPHABET.charAt((bytes[i] ?? 0) & 31);
  }
  return result;
}
