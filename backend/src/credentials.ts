import { randomCrockford } from '@bwinkeler-aquarium/shared';

const AQUARIUM_ID_LENGTH = 20;
const AQUARIUM_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{20}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface Credential {
  aquariumId: string;
  secret: string;
}

export function newAquariumId(): string {
  return randomCrockford(AQUARIUM_ID_LENGTH);
}

export function isAquariumId(value: string): boolean {
  return AQUARIUM_ID_PATTERN.test(value);
}

function toHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

export function formatCredential(credential: Credential): string {
  return `${credential.aquariumId}.${credential.secret}`;
}

export function parseCredential(value: string | null | undefined): Credential | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot === -1) return null;
  const aquariumId = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  return isAquariumId(aquariumId) && SECRET_PATTERN.test(secret) ? { aquariumId, secret } : null;
}

/** Keyed hash so quota counters never store raw IP addresses. */
export async function hashIp(ip: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(ip));
  return toHex(new Uint8Array(signature)).slice(0, 32);
}
