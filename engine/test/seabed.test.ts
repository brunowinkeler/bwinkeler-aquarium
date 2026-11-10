import { describe, expect, it } from 'vitest';
import { drawPlant, swayOffset, type Plant } from '../src/plants.js';
import { SAND_LINE } from '../src/scene.js';
import { sandLine } from '../src/seabed.js';

type Call = [number, number, number, number, number, number, number, number];

function recorder(): { calls: Call[]; context: CanvasRenderingContext2D } {
  const calls: Call[] = [];
  const context = {
    drawImage: (_source: unknown, ...numbers: number[]) => calls.push(numbers as Call),
  } as unknown as CanvasRenderingContext2D;
  return { calls, context };
}

/** A 40×100 CSS-pixel plant held at `scale` device pixels per CSS pixel, as `paintSurface` makes it. */
function plantAt(scale: number): Plant {
  const canvas = { width: Math.ceil(40 * scale), height: Math.ceil(100 * scale) };
  return {
    sprite: {
      canvas: canvas as HTMLCanvasElement,
      width: canvas.width / scale,
      height: canvas.height / scale,
      rootX: 20,
      scale,
    },
    x: 300,
    baseY: 500,
    sway: 12,
    speed: 1,
    phase: 0.5,
    slices: 10,
  };
}

describe('swaying plants', () => {
  it('keeps the root still and the tip within its sway', () => {
    const plant = plantAt(1);
    for (let time = 0; time < 10; time += 0.37) {
      expect(swayOffset(plant, 0, time)).toBeCloseTo(0, 9);
      expect(Math.abs(swayOffset(plant, 1, time))).toBeLessThanOrEqual(plant.sway);
    }
  });

  it('draws each row once, in slices placed in CSS pixels, at any pixel ratio', () => {
    for (const scale of [1, 2, 2 / 3]) {
      const plant = plantAt(scale);
      const { calls, context } = recorder();
      drawPlant(context, plant, 3);
      const rows = plant.sprite.canvas.height;
      const step = Math.ceil(rows / plant.slices);
      const top = plant.baseY - plant.sprite.height;
      expect(calls.length).toBeLessThanOrEqual(plant.slices);
      calls.forEach(([sx, sy, sw, sh, , dy, dw, dh], index) => {
        expect(sx).toBe(0);
        expect(sw).toBe(plant.sprite.canvas.width);
        expect(sy).toBe(index * step);
        expect(dy).toBeCloseTo(top + sy / scale);
        expect(dw).toBeCloseTo(plant.sprite.width);
        expect(dh).toBeCloseTo(sh / scale);
      });
      const tip = calls[0];
      const root = calls[calls.length - 1];
      if (!tip || !root) throw new Error('no slices');
      expect(root[1] + root[3]).toBe(rows);
      const rest = plant.x - plant.sprite.rootX;
      expect(Math.abs(root[4] - rest)).toBeLessThan(Math.abs(tip[4] - rest));
    }
  });
});

describe('seabed', () => {
  it('keeps the dunes close to the sand line the crabs walk on', () => {
    const y = sandLine(1920, 1080);
    for (let x = 0; x <= 1920; x += 40) {
      expect(Math.abs(y(x) / 1080 - SAND_LINE)).toBeLessThan(0.03);
    }
  });
});
