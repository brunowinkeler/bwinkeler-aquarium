import { env } from 'cloudflare:workers';
import {
  MAX_ACTIVE_CREATURES,
  MAX_IMAGE_BYTES,
  createUlid,
  type CreatureListResponse,
  type CreatureResponse,
} from '@bwinkeler-aquarium/shared';
import { describe, expect, it } from 'vitest';
import {
  aquariumWithPhone,
  call,
  connectTv,
  eventually,
  phoneHeaders,
  png,
  reserve,
  sendCreature,
  storedKeys,
  tvHeaders,
  upload,
} from './helpers.js';

async function creature(cookie: string, id: string) {
  return call(`/api/creatures/${id}`, { headers: phoneHeaders(cookie) });
}

describe('creatures', () => {
  it('uploads a drawing, shows it on the TV and confirms the display', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const { socket } = await connectTv(tv);
    const id = await sendCreature(cookie);

    const added = await socket.next('creature_added');
    expect(added.creature).toMatchObject({ id, kind: 'swim', facing: 'right', author: 'Olivia' });
    expect(added.creature).toMatchObject({ width: 64, height: 48, displayedAt: null });

    socket.send({ type: 'displayed', id });
    const shown = await eventually(
      async () => (await (await creature(cookie, id)).json<CreatureResponse>()).creature,
      (value) => value.displayedAt !== null,
    );
    expect(shown).toMatchObject({ id, status: 'active', mine: true });
  });

  it('treats the phone ULID as an idempotency key', async () => {
    const { cookie } = await aquariumWithPhone();
    const id = createUlid();
    expect((await reserve(cookie, { id })).status).toBe(201);
    expect((await reserve(cookie, { id })).status).toBe(200);
    expect((await reserve(cookie, { id, width: 65 })).status).toBe(409);

    expect((await upload(cookie, id, png(64, 48))).status).toBe(200);
    expect((await upload(cookie, id, png(64, 48))).status).toBe(200);
    const list = await (
      await call('/api/creatures', { headers: phoneHeaders(cookie) })
    ).json<CreatureListResponse>();
    expect(list.creatures.map((item) => item.id)).toEqual([id]);
  });

  it('validates metadata and images', async () => {
    const { cookie } = await aquariumWithPhone();
    expect((await reserve(cookie, { id: 'not-a-ulid' })).status).toBe(400);
    expect((await reserve(cookie, { width: 2048 })).status).toBe(400);
    expect((await reserve(cookie, { author: 'x'.repeat(25) })).status).toBe(400);

    const id = createUlid();
    expect((await reserve(cookie, { id })).status).toBe(201);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
    expect((await upload(cookie, id, jpeg)).status).toBe(415);
    expect((await upload(cookie, id, png(64, 48, MAX_IMAGE_BYTES + 1))).status).toBe(413);
    expect((await upload(cookie, id, png(2048, 48))).status).toBe(422);
    expect((await upload(cookie, id, png(48, 64))).status).toBe(422);
    expect((await upload(cookie, createUlid(), png(64, 48))).status).toBe(404);
  });

  it('keeps the newest 20 creatures and deletes the oldest image', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_CREATURES; i++) ids.push(await sendCreature(cookie));
    const { socket } = await connectTv(tv);

    ids.push(await sendCreature(cookie));
    const removed = await socket.next('creature_removed');
    expect(removed).toMatchObject({ id: ids[0], reason: 'capacity' });

    expect((await creature(cookie, ids[0] ?? '')).status).toBe(404);
    const list = await (
      await call('/api/creatures', { headers: phoneHeaders(cookie) })
    ).json<CreatureListResponse>();
    expect(list.creatures).toHaveLength(MAX_ACTIVE_CREATURES);
    expect(list.creatures.map((item) => item.id)).toEqual(ids.slice(1));
    expect(await storedKeys(tv.aquariumId)).toHaveLength(MAX_ACTIVE_CREATURES);
  });

  it('deletes a creature and tells the TV', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const id = await sendCreature(cookie);
    const { socket } = await connectTv(tv);

    const response = await call(`/api/creatures/${id}`, {
      method: 'DELETE',
      headers: phoneHeaders(cookie),
    });
    expect(response.status).toBe(204);
    expect(await socket.next('creature_removed')).toMatchObject({ id, reason: 'deleted' });
    expect(
      (await call(`/api/creatures/${id}/image`, { headers: phoneHeaders(cookie) })).status,
    ).toBe(404);
    expect(await storedKeys(tv.aquariumId)).toEqual([]);
  });

  it('serves images only to devices of the same aquarium', async () => {
    const owner = await aquariumWithPhone();
    const stranger = await aquariumWithPhone();
    const id = await sendCreature(owner.cookie);

    const own = await call(`/api/creatures/${id}/image`, { headers: phoneHeaders(owner.cookie) });
    expect(own.status).toBe(200);
    expect(own.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const phone = await call(`/api/creatures/${id}/image`, {
      headers: phoneHeaders(stranger.cookie),
    });
    expect(phone.status).toBe(404);
    const tv = await call(`/api/tv/creatures/${id}/image`, {
      headers: tvHeaders(stranger.tv.token),
    });
    expect(tv.status).toBe(404);
  });

  it('limits uploads per aquarium and hour', async () => {
    const { cookie } = await aquariumWithPhone();
    for (let i = 0; i < 60; i++) expect((await reserve(cookie)).status).toBe(201);
    const response = await reserve(cookie);
    expect(response.status).toBe(429);
  });

  it('stores images under the aquarium prefix', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    const id = await sendCreature(cookie);
    const object = await env.IMAGES.head(`aquariums/${tv.aquariumId}/creatures/${id}.png`);
    expect(object?.httpMetadata?.contentType).toBe('image/png');
  });
});
