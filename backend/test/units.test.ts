import { describe, expect, it } from 'vitest';
import { hashIp, newAquariumId, newSecret, parseCredential } from '../src/credentials.js';
import { readCookie } from '../src/http.js';
import { readPngHeader } from '../src/png.js';
import { png } from './helpers.js';

describe('readPngHeader', () => {
  it('reads the IHDR dimensions', () => {
    expect(readPngHeader(png(512, 384))).toEqual({ width: 512, height: 384 });
  });

  it('rejects other formats and truncated or malformed headers', () => {
    expect(readPngHeader(new Uint8Array(64))).toBeNull();
    expect(readPngHeader(png(10, 10).slice(0, 20))).toBeNull();
    const wrongChunk = png(10, 10);
    wrongChunk[12] = 0x58;
    expect(readPngHeader(wrongChunk)).toBeNull();
    expect(readPngHeader(png(0, 10))).toBeNull();
  });
});

describe('credentials', () => {
  it('round-trips an aquarium credential', () => {
    const aquariumId = newAquariumId();
    const secret = newSecret();
    expect(parseCredential(`${aquariumId}.${secret}`)).toEqual({ aquariumId, secret });
  });

  it('rejects malformed credentials', () => {
    const secret = newSecret();
    expect(parseCredential(null)).toBeNull();
    expect(parseCredential('no-dot')).toBeNull();
    expect(parseCredential(`short.${secret}`)).toBeNull();
    expect(parseCredential(`${newAquariumId()}.short`)).toBeNull();
  });

  it('hashes IPs with a key and without exposing them', async () => {
    const first = await hashIp('203.0.113.7', 'key-a');
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toContain('203');
    expect(await hashIp('203.0.113.7', 'key-a')).toBe(first);
    expect(await hashIp('203.0.113.7', 'key-b')).not.toBe(first);
  });

  it('reads one cookie among several', () => {
    const request = new Request('https://example.test', {
      headers: { Cookie: 'theme=dark; aquarium_sid=abc.def ; other=1' },
    });
    expect(readCookie(request, 'aquarium_sid')).toBe('abc.def');
    expect(readCookie(request, 'missing')).toBeNull();
  });
});
