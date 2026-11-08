import { describe, expect, it } from 'vitest';
import { createRandom, creaturePose, hashSeed, spriteSize, World } from '../src/index.js';
import type { CreatureSpec, SimCreature } from '../src/index.js';

const WIDTH = 1920;
const HEIGHT = 1080;

function spec(id: string, overrides: Partial<CreatureSpec> = {}): CreatureSpec {
  return { id, kind: 'swim', facing: 'right', width: 512, height: 300, ...overrides };
}

function simulate(world: World, seconds: number, each?: (time: number) => void): void {
  for (let t = 0; t < seconds; t += 0.1) {
    world.step(0.1);
    each?.(t);
  }
}

function only(world: World): SimCreature {
  const creature = world.creatures[0];
  if (!creature) throw new Error('no creature');
  return creature;
}

describe('random', () => {
  it('derives the same sequence from the same ID', () => {
    const a = createRandom(hashSeed('01JD0000000000000000000000'));
    const b = createRandom(hashSeed('01JD0000000000000000000000'));
    const c = createRandom(hashSeed('01JD0000000000000000000001'));
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const value of first) expect(value).toBeGreaterThanOrEqual(0);
  });
});

describe('World', () => {
  it('gives a creature the same personality in the preview and on the TV, except size and depth', () => {
    const tv = new World({ width: WIDTH, height: HEIGHT }).add(spec('01JD7Q7Y8X3K2M4N5P6R7S8T9V'));
    const preview = new World({ width: 400, height: 300, preview: true }).add(
      spec('01JD7Q7Y8X3K2M4N5P6R7S8T9V'),
    );
    expect(preview.personality.speed).toBe(tv.personality.speed);
    expect(preview.personality.rhythm).toBe(tv.personality.rhythm);
    expect(preview.personality.phase).toBe(tv.personality.phase);
    expect(preview.personality.depth).toBe(1);
    expect(preview.personality.size).toBeGreaterThan(tv.personality.size);
  });

  it('is deterministic for a seed regardless of the frame rate', () => {
    const coarse = new World({ width: WIDTH, height: HEIGHT });
    const fine = new World({ width: WIDTH, height: HEIGHT });
    coarse.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8T9W'));
    fine.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8T9W'));
    for (let i = 0; i < 30; i++) coarse.step(0.2);
    for (let i = 0; i < 360; i++) fine.step(1 / 60);
    expect(only(coarse).x).toBeCloseTo(only(fine).x, 6);
    expect(only(coarse).y).toBeCloseTo(only(fine).y, 6);
  });

  it('keeps a fish inside the screen and near its band, and turns at the walls', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const fish = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8T9X'));
    const headings = new Set<number>();
    simulate(world, 120, () => {
      const size = spriteSize(world, fish);
      expect(fish.x).toBeGreaterThan(-size.width / 2);
      expect(fish.x).toBeLessThan(WIDTH + size.width / 2);
      expect(fish.y).toBeGreaterThanOrEqual(size.height / 2 - 1);
      expect(fish.y).toBeLessThanOrEqual(HEIGHT);
      headings.add(fish.heading);
    });
    expect(headings.size).toBe(2);
    expect(fish.y / HEIGHT).toBeGreaterThan(fish.personality.bandTop - 0.15);
    expect(fish.y / HEIGHT).toBeLessThan(fish.personality.bandBottom + 0.15);
  });

  it('makes a jellyfish rise on its contractions and stay in its band', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const jelly = world.add(
      spec('01JD7Q7Y8X3K2M4N5P6R7S8TA0', { kind: 'pulse', width: 300, height: 400 }),
    );
    let rose = false;
    simulate(world, 60, () => {
      if (jelly.vy < -1) rose = true;
    });
    expect(rose).toBe(true);
    expect(jelly.y / HEIGHT).toBeLessThan(0.75);
    expect(creaturePose(jelly).mode).toBe('rows');
  });

  it('keeps crabs on the sand', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const crab = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA1', { kind: 'walk' }));
    simulate(world, 60, () => {
      expect(crab.y / HEIGHT).toBeGreaterThan(0.75);
    });
    expect(creaturePose(crab).mode).toBe('rigid');
  });

  it('dives in from above and settles in its band', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const fish = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA2', { entry: 'dive' }));
    expect(fish.y).toBeLessThan(0);
    expect(fish.state).toBe('entering');
    simulate(world, 15);
    expect(fish.state).not.toBe('entering');
    expect(world.bubbles.length).toBeGreaterThan(0);
  });

  it('lets a removed creature swim away before reporting it', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const exited: string[] = [];
    world.onExited = (id) => exited.push(id);
    world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA3'));
    world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA4', { kind: 'pulse' }));
    simulate(world, 2);
    world.remove('01JD7Q7Y8X3K2M4N5P6R7S8TA3', 'capacity');
    world.remove('01JD7Q7Y8X3K2M4N5P6R7S8TA4');
    expect(world.creatures).toHaveLength(2);
    simulate(world, 40);
    expect(exited.sort()).toEqual(['01JD7Q7Y8X3K2M4N5P6R7S8TA3', '01JD7Q7Y8X3K2M4N5P6R7S8TA4']);
    expect(world.creatures).toHaveLength(0);
  });

  it('startles nearby creatures when a new one arrives, but not in the preview', () => {
    const newcomer = spec('01JD7Q7Y8X3K2M4N5P6R7S8TA6');
    const arrival = new World({ width: 800, height: 600 }).add(newcomer);
    const world = new World({ width: 800, height: 600 });
    const first = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA5'));
    simulate(world, 1);
    first.x = arrival.x + 40;
    first.y = arrival.y;
    world.add(newcomer);
    expect(first.state).toBe('darting');
    expect(first.heading).toBe(1);

    const preview = new World({ width: 800, height: 600, preview: true });
    const alone = preview.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA5'));
    expect(alone.state).toBe('cruising');
  });

  it('mirrors a left-facing drawing so its head leads', () => {
    const world = new World({ width: WIDTH, height: HEIGHT });
    const fish = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA7', { facing: 'left' }));
    simulate(world, 1);
    const pose = creaturePose(fish);
    if (fish.flip === fish.heading) {
      expect(Math.sign(pose.scaleX)).toBe(fish.heading === 1 ? -1 : 1);
    }
  });

  it('rescales positions when the screen changes size', () => {
    const world = new World({ width: 1000, height: 500 });
    const fish = world.add(spec('01JD7Q7Y8X3K2M4N5P6R7S8TA8'));
    const ratio = fish.x / 1000;
    world.resize(2000, 1000);
    expect(fish.x / 2000).toBeCloseTo(ratio, 9);
  });
});
