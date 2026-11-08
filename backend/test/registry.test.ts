import { runDurableObjectAlarm } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { REGISTRY_NAME } from '../src/registry-do.js';
import { aquariumWithPhone, call, sendCreature, storedKeys } from './helpers.js';

const registry = () => env.REGISTRY.getByName(REGISTRY_NAME);

describe('registry', () => {
  it('caps live aquariums and daily creations per IP', async () => {
    const limits = { maxLive: (await registry().liveCount()) + 2, perIpPerDay: 1 };
    expect(await registry().register('AAAAAAAAAAAAAAAAAAA1', 'ip-1', limits)).toEqual({ ok: true });
    expect(await registry().register('AAAAAAAAAAAAAAAAAAA2', 'ip-1', limits)).toEqual({
      ok: false,
      reason: 'quota',
    });
    expect(await registry().register('AAAAAAAAAAAAAAAAAAA2', 'ip-2', limits)).toEqual({ ok: true });
    expect(await registry().register('AAAAAAAAAAAAAAAAAAA3', 'ip-3', limits)).toEqual({
      ok: false,
      reason: 'capacity',
    });
  });

  it('daily alarm forgets dead aquariums and sweeps orphaned images', async () => {
    const { tv, cookie } = await aquariumWithPhone();
    await sendCreature(cookie);
    await registry().register('DEADDEADDEADDEADDEAD', 'ip-dead', {
      maxLive: 1000,
      perIpPerDay: 10,
    });
    await env.IMAGES.put('aquariums/ORPHANORPHANORPHAN00/creatures/x.png', new Uint8Array(8));
    const liveBefore = await registry().liveCount();

    expect(await runDurableObjectAlarm(registry())).toBe(true);

    expect(await registry().liveCount()).toBeLessThan(liveBefore);
    expect(await storedKeys('ORPHANORPHANORPHAN00')).toEqual([]);
    expect(await storedKeys(tv.aquariumId)).toHaveLength(1);
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await call('/health/live')).status).toBe(200);
    const ready = await call('/health/ready');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      status: 'ok',
      checks: { r2: true, durableObjects: true, secrets: true },
    });
  });
});
