import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { WS_PING, type SessionResponse } from '@bwinkeler-aquarium/shared';
import { describe, expect, it } from 'vitest';
import { REGISTRY_NAME } from '../src/registry-do.js';
import {
  aquariumStub,
  aquariumWithPhone,
  call,
  connectTv,
  createAquarium,
  eventually,
  openSocket,
  phoneHeaders,
  sendCreature,
  setExpiry,
  storedKeys,
} from './helpers.js';

async function readSession(cookie: string): Promise<Response> {
  return call('/api/session', { headers: phoneHeaders(cookie) });
}

describe('TV WebSocket', () => {
  it('sends a snapshot with creatures and phones after authentication', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const id = await sendCreature(cookie);
    const { snapshot } = await connectTv(tv);
    expect(snapshot.phoneCount).toBe(1);
    expect(snapshot.creatures.map((creature) => creature.id)).toEqual([id]);
    expect(snapshot.revision).toBeGreaterThan(0);
  });

  it('requires authentication as the first message', async () => {
    const tv = await createAquarium();
    const socket = await openSocket(tv.aquariumId);
    socket.send({ type: 'sync' });
    expect((await socket.closed()).code).toBe(4003);
  });

  it('rejects a token from another aquarium', async () => {
    const tv = await createAquarium();
    const other = await createAquarium();
    const socket = await openSocket(tv.aquariumId);
    socket.send({ type: 'auth', token: other.token });
    expect((await socket.closed()).code).toBe(4003);
  });

  it('closes sockets that do not authenticate in time', async () => {
    const tv = await createAquarium();
    const socket = await openSocket(tv.aquariumId);
    await runInDurableObject(aquariumStub(tv.aquariumId), (_instance, state) => {
      for (const ws of state.getWebSockets()) {
        ws.serializeAttachment({ deviceId: null, connectedAt: Date.now() - 60_000 });
      }
    });
    expect(await runDurableObjectAlarm(aquariumStub(tv.aquariumId))).toBe(true);
    expect((await socket.closed()).code).toBe(4000);
  });

  it('keeps one TV socket per aquarium', async () => {
    const tv = await createAquarium();
    const first = await connectTv(tv);
    const second = await connectTv(tv);
    expect((await first.socket.closed()).code).toBe(4001);
    second.socket.send({ type: 'sync' });
    expect((await second.socket.next('snapshot')).type).toBe('snapshot');
  });

  it('answers the app-level ping', async () => {
    const tv = await createAquarium();
    const { socket } = await connectTv(tv);
    socket.send(WS_PING);
    expect(await socket.next('pong')).toEqual({ type: 'pong' });
  });

  it('closes the socket on oversized or invalid messages', async () => {
    const tv = await createAquarium();
    const big = await connectTv(tv);
    big.socket.send(JSON.stringify({ type: 'sync', padding: 'x'.repeat(2048) }));
    expect((await big.socket.closed()).code).toBe(1009);

    const invalid = await connectTv(tv);
    invalid.socket.send('{"type":"teleport"}');
    expect((await invalid.socket.closed()).code).toBe(1008);
  });

  it('waits for the TV and expires the aquarium after the reconnection window', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    await sendCreature(cookie);
    const { socket } = await connectTv(tv);
    const registry = env.REGISTRY.getByName(REGISTRY_NAME);
    const liveBefore = await registry.liveCount();

    socket.ws.close(1000, 'TV turned off');
    const waiting = await eventually(
      async () => (await readSession(cookie)).json<SessionResponse>(),
      (body) => body.expiresAt !== null,
    );
    expect(waiting.tvConnected).toBe(false);
    expect(waiting.expiresAt).toBeGreaterThan(Date.now() + 3 * 60 * 60 * 1000);

    await setExpiry(tv.aquariumId, Date.now() - 1);
    expect(await runDurableObjectAlarm(aquariumStub(tv.aquariumId))).toBe(true);

    expect((await readSession(cookie)).status).toBe(410);
    expect(await storedKeys(tv.aquariumId)).toEqual([]);
    expect(await registry.liveCount()).toBe(liveBefore - 1);
    const reconnect = await call(`/ws/tv/${tv.aquariumId}`, { headers: { Upgrade: 'websocket' } });
    expect(reconnect.status).toBe(410);
  });

  it('keeps the aquarium alive while the TV is connected', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    await connectTv(tv);
    await runDurableObjectAlarm(aquariumStub(tv.aquariumId));
    expect((await readSession(cookie)).status).toBe(200);
  });

  it('expires an aquarium whose TV never connected', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    await setExpiry(tv.aquariumId, Date.now() - 1);
    expect(await runDurableObjectAlarm(aquariumStub(tv.aquariumId))).toBe(true);
    expect((await readSession(cookie)).status).toBe(410);
  });
});
