import { env } from 'cloudflare:workers';
import type { ErrorResponse, SessionResponse } from '@bwinkeler-aquarium/shared';
import { describe, expect, it } from 'vitest';
import { REGISTRY_NAME } from '../src/registry-do.js';
import {
  aquariumWithPhone,
  call,
  connectTv,
  createAquarium,
  issueJoinCode,
  joinPhone,
  phoneHeaders,
  sendCreature,
  storedKeys,
  tvHeaders,
  uniqueIp,
} from './helpers.js';

describe('TV routes', () => {
  it('creates an aquarium and answers with CORS for the file:// app', async () => {
    const response = await call('/api/tv/aquariums', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': uniqueIp() },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json<{
      aquariumId: string;
      token: string;
      reconnectWindowMs: number;
    }>();
    expect(body.aquariumId).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(body.token.startsWith(`${body.aquariumId}.`)).toBe(true);
    expect(body.reconnectWindowMs).toBe(4 * 60 * 60 * 1000);
  });

  it('answers preflight requests on TV routes only', async () => {
    const tv = await call('/api/tv/join-code', {
      method: 'OPTIONS',
      headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' },
    });
    expect(tv.status).toBe(204);
    expect(tv.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(tv.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');

    const phone = await call('/api/join', { method: 'OPTIONS', headers: { Origin: 'null' } });
    expect(phone.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects missing and forged TV tokens', async () => {
    const tv = await createAquarium();
    const missing = await call('/api/tv/join-code', { method: 'POST' });
    expect(missing.status).toBe(401);
    expect(missing.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const forged = `${tv.aquariumId}.${'A'.repeat(43)}`;
    const wrong = await call('/api/tv/join-code', { method: 'POST', headers: tvHeaders(forged) });
    expect(wrong.status).toBe(401);
  });

  it('rate limits aquarium creation per IP', async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await call('/api/tv/aquariums', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': ip },
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it('ends the previous aquarium when the TV starts over', async () => {
    const previous = await createAquarium();
    await createAquarium(tvHeaders(previous.token));
    const response = await call('/api/tv/join-code', {
      method: 'POST',
      headers: tvHeaders(previous.token),
    });
    expect(response.status).toBe(410);
  });

  it('ends an aquarium on request and deletes everything', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    await sendCreature(cookie);
    expect(await storedKeys(tv.aquariumId)).toHaveLength(1);
    const { socket } = await connectTv(tv);
    const registry = env.REGISTRY.getByName(REGISTRY_NAME);
    const liveBefore = await registry.liveCount();

    const response = await call('/api/tv/aquarium', {
      method: 'DELETE',
      headers: tvHeaders(tv.token),
    });
    expect(response.status).toBe(204);
    expect(await socket.next('aquarium_ended')).toEqual({
      type: 'aquarium_ended',
      reason: 'ended',
    });
    expect((await socket.closed()).code).toBe(4010);
    expect(await storedKeys(tv.aquariumId)).toEqual([]);
    expect(await registry.liveCount()).toBe(liveBefore - 1);

    const session = await call('/api/session', { headers: phoneHeaders(cookie) });
    expect(session.status).toBe(410);
    expect(session.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await session.json<ErrorResponse>()).error).toBe('gone');
  });

  it('disconnects every phone', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const first = await joinPhone(code);
    await joinPhone(code);
    const { socket, snapshot } = await connectTv(tv);
    expect(snapshot.phoneCount).toBe(2);

    const response = await call('/api/tv/phones', {
      method: 'DELETE',
      headers: tvHeaders(tv.token),
    });
    expect(response.status).toBe(204);
    expect((await socket.next('phones_changed')).phoneCount).toBe(0);

    const session = await call('/api/session', { headers: phoneHeaders(first) });
    expect(session.status).toBe(401);
  });

  it('serves creature images to the TV with CORS and immutable caching', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const id = await sendCreature(cookie);
    const response = await call(`/api/tv/creatures/${id}/image`, { headers: tvHeaders(tv.token) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await response.arrayBuffer()).byteLength).toBe(64);
  });

  it('reports the phone count and TV presence in the phone session', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const before = await (
      await call('/api/session', { headers: phoneHeaders(cookie) })
    ).json<SessionResponse>();
    expect(before).toMatchObject({ aquariumId: tv.aquariumId, tvConnected: false, phoneCount: 1 });
    expect(before.expiresAt).toBeGreaterThan(Date.now());

    await connectTv(tv);
    const after = await (
      await call('/api/session', { headers: phoneHeaders(cookie) })
    ).json<SessionResponse>();
    expect(after).toMatchObject({
      tvConnected: true,
      expiresAt: null,
      creatureCount: 0,
      capacity: 20,
    });
  });
});
