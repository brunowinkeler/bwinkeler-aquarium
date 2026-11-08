import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { CLIENT_HEADER, formatJoinCode, type SessionResponse } from '@bwinkeler-aquarium/shared';
import { describe, expect, it } from 'vitest';
import {
  ORIGIN,
  call,
  cookieFrom,
  createAquarium,
  issueJoinCode,
  joinPhone,
  phoneHeaders,
  postJson,
} from './helpers.js';

async function session(cookie: string): Promise<Response> {
  return call('/api/session', { headers: phoneHeaders(cookie) });
}

describe('joining an aquarium', () => {
  it('accepts the code as people type it and sets a hardened cookie', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const typed = ` ${formatJoinCode(code).toLowerCase()} `;
    const response = await postJson('/api/join', { code: typed }, phoneHeaders());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ aquariumId: tv.aquariumId });
    const cookie = response.headers.get('Set-Cookie') ?? '';
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
      expect(cookie).toContain(attribute);
    }
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('lets several phones use the same code', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const first = await joinPhone(code);
    await joinPhone(code);
    const body = await (await session(first)).json<SessionResponse>();
    expect(body.phoneCount).toBe(2);
  });

  it('rejects unknown and expired codes', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const unknown = code === '000000' ? '000001' : '000000';
    expect((await postJson('/api/join', { code: unknown }, phoneHeaders())).status).toBe(404);
    expect((await postJson('/api/join', { code: 'nope' }, phoneHeaders())).status).toBe(404);

    await runInDurableObject(env.JOIN_CODES.getByName(code), (_instance, state) => {
      state.storage.kv.put('entry', { aquariumId: tv.aquariumId, expiresAt: Date.now() - 1 });
    });
    expect((await postJson('/api/join', { code }, phoneHeaders())).status).toBe(404);
  });

  it('rejects cross-site and header-less requests', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const noOrigin = await postJson('/api/join', { code }, { [CLIENT_HEADER]: 'pwa' });
    expect(noOrigin.status).toBe(403);
    const otherOrigin = await postJson(
      '/api/join',
      { code },
      { Origin: 'https://evil.example', [CLIENT_HEADER]: 'pwa' },
    );
    expect(otherOrigin.status).toBe(403);
    const noHeader = await postJson('/api/join', { code }, { Origin: ORIGIN });
    expect(noHeader.status).toBe(403);
  });

  it('limits the number of phones per aquarium', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    for (let i = 0; i < 10; i++) await joinPhone(code);
    const response = await postJson('/api/join', { code }, phoneHeaders());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'phone_limit' });
  });

  it('keeps the session when a phone joins the same aquarium again', async () => {
    const tv = await createAquarium();
    const code = await issueJoinCode(tv.token);
    const cookie = await joinPhone(code);
    expect(await joinPhone(code, cookie)).toBe(cookie);
    expect((await (await session(cookie)).json<SessionResponse>()).phoneCount).toBe(1);
  });

  it('moves a phone to another aquarium', async () => {
    const first = await createAquarium();
    const second = await createAquarium();
    const cookie = await joinPhone(await issueJoinCode(first.token));
    const moved = await joinPhone(await issueJoinCode(second.token), cookie);
    expect(moved).not.toBe(cookie);
    expect((await session(cookie)).status).toBe(401);
    expect((await (await session(moved)).json<SessionResponse>()).aquariumId).toBe(
      second.aquariumId,
    );
  });

  it('leaves the aquarium and clears the cookie', async () => {
    const tv = await createAquarium();
    const cookie = await joinPhone(await issueJoinCode(tv.token));
    const response = await call('/api/leave', { method: 'POST', headers: phoneHeaders(cookie) });
    expect(response.status).toBe(204);
    expect(cookieFrom(response)).toBe('aquarium_sid=');
    expect((await session(cookie)).status).toBe(401);
  });

  it('requires a session for phone routes', async () => {
    expect((await call('/api/session')).status).toBe(401);
    expect((await call('/api/creatures')).status).toBe(401);
    expect((await call('/api/unknown')).status).toBe(404);
  });
});
