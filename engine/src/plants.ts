import { BLACK, mix, rgb, WHITE, type RGB } from './color.js';
import type { Random } from './random.js';
import { paintSurface } from './surface.js';

type Context = CanvasRenderingContext2D;
type Point = [number, number];

const TAU = Math.PI * 2;

export interface Palette {
  dark: RGB;
  light: RGB;
}

export const GREEN: Palette = { dark: [26, 94, 60], light: [112, 196, 108] };
export const OLIVE: Palette = { dark: [70, 86, 30], light: [182, 186, 78] };
export const TEAL: Palette = { dark: [18, 86, 84], light: [92, 190, 160] };
export const LIME: Palette = { dark: [58, 132, 48], light: [178, 228, 112] };
export const HAZE: Palette = { dark: [26, 90, 122], light: [46, 118, 150] };
export const DEEP: Palette = { dark: [12, 42, 36], light: [44, 92, 60] };

/** A plant painted once; its root is centered on the bottom edge. */
export interface PlantSprite {
  canvas: HTMLCanvasElement;
  /** CSS pixels; the canvas holds `scale` device pixels per CSS pixel. */
  width: number;
  height: number;
  rootX: number;
  scale: number;
}

export interface Plant {
  sprite: PlantSprite;
  x: number;
  baseY: number;
  /** Horizontal travel of the tip, in CSS pixels. */
  sway: number;
  /** Radians per second. */
  speed: number;
  phase: number;
  slices: number;
}

export function plant(
  sprite: PlantSprite,
  x: number,
  baseY: number,
  random: Random,
  sway: number,
  slices: number,
): Plant {
  return { sprite, x, baseY, sway, speed: 0.7 + random() * 0.5, phase: random() * TAU, slices };
}

/** `lift` runs from 0 at the root to 1 at the tip; the tip lags, like a wave going up. */
export function swayOffset(item: Plant, lift: number, time: number): number {
  return item.sway * Math.pow(lift, 1.5) * Math.sin(time * item.speed + item.phase - lift * 2);
}

/** Horizontal slices of the sprite, each shifted by the sway at its height. */
export function drawPlant(context: Context, item: Plant, time: number): void {
  const sprite = item.sprite;
  const rows = sprite.canvas.height;
  const step = Math.ceil(rows / item.slices);
  const left = item.x - sprite.rootX;
  const top = item.baseY - sprite.height;
  for (let y = 0; y < rows; y += step) {
    // One extra row hides the seam between neighboring slices.
    const h = Math.min(step + 1, rows - y);
    const lift = 1 - (y + h / 2) / rows;
    context.drawImage(
      sprite.canvas,
      0,
      y,
      sprite.canvas.width,
      h,
      left + swayOffset(item, lift, time),
      top + y / sprite.scale,
      sprite.width,
      h / sprite.scale,
    );
  }
}

function sprite(
  width: number,
  height: number,
  scale: number,
  paint: (context: Context) => void,
): PlantSprite {
  const canvas = paintSurface(width, height, scale, paint);
  return {
    canvas,
    width: canvas.width / scale,
    height: canvas.height / scale,
    rootX: width / 2,
    scale,
  };
}

/** Path of a strip around `center`, `width(s)` wide at each point. */
function ribbon(
  context: Context,
  center: (s: number) => Point,
  width: (s: number) => number,
  steps: number,
): void {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const a = center(Math.max(0, s - 0.01));
    const b = center(Math.min(1, s + 0.01));
    const p = center(s);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / length;
    const ny = (b[0] - a[0]) / length;
    const half = width(s) / 2;
    left.push([p[0] + nx * half, p[1] + ny * half]);
    right.push([p[0] - nx * half, p[1] - ny * half]);
  }
  context.beginPath();
  left.forEach((p, i) => (i === 0 ? context.moveTo(p[0], p[1]) : context.lineTo(p[0], p[1])));
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i];
    if (p) context.lineTo(p[0], p[1]);
  }
  context.closePath();
}

function quadratic(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): (s: number) => Point {
  return (s) => {
    const u = 1 - s;
    return [u * u * x0 + 2 * u * s * cx + s * s * x1, u * u * y0 + 2 * u * s * cy + s * s * y1];
  };
}

function trace(
  context: Context,
  center: (s: number) => Point,
  from: number,
  to: number,
  steps: number,
): void {
  context.beginPath();
  for (let i = 0; i <= steps; i++) {
    const p = center(from + ((to - from) * i) / steps);
    if (i === 0) context.moveTo(p[0], p[1]);
    else context.lineTo(p[0], p[1]);
  }
}

/** Ribbon blades from one root, like eelgrass. */
export function seaGrass(
  height: number,
  random: Random,
  palette: Palette,
  scale: number,
): PlantSprite {
  const width = height * 0.75;
  const rootX = width / 2;
  const blades = 6 + Math.floor(random() * 4);
  const tones: number[] = [];
  for (let j = 0; j < blades; j++) tones.push(random());
  // Darker blades first, so the lighter ones read as nearer.
  const order = tones.map((_, j) => j).sort((a, b) => (tones[a] ?? 0) - (tones[b] ?? 0));
  return sprite(width, height, scale, (context) => {
    for (const j of order) {
      const tone = tones[j] ?? 0;
      const spread = j / (blades - 1) - 0.5;
      const bx = rootX + spread * width * 0.2;
      const tall = height * (0.5 + random() * 0.47);
      const lean = spread * width * 0.45 + (random() - 0.5) * width * 0.16;
      const bend = (random() - 0.5) * width * 0.3;
      const center = quadratic(
        bx,
        height,
        bx + lean * 0.2 + bend,
        height - tall * 0.55,
        bx + lean,
        height - tall,
      );
      const base = height * (0.04 + random() * 0.025);
      ribbon(context, center, (s) => base * Math.pow(1 - s, 0.7) + 0.8, 20);
      const gradient = context.createLinearGradient(0, height, 0, height - tall);
      gradient.addColorStop(0, rgb(mix(palette.dark, BLACK, 0.2)));
      gradient.addColorStop(1, rgb(mix(palette.dark, palette.light, 0.45 + tone * 0.55)));
      context.fillStyle = gradient;
      context.fill();
      context.strokeStyle = rgb(palette.light, 0.2 + tone * 0.2);
      context.lineWidth = Math.max(1, base * 0.14);
      trace(context, center, 0.04, 0.85, 14);
      context.stroke();
    }
  });
}

interface Blade {
  length: number;
  width: number;
  angle: number;
  bend: number;
  phase: number;
}

function kelpBlade(
  context: Context,
  x: number,
  y: number,
  blade: Blade,
  palette: Palette,
  shade: number,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(blade.angle);
  const w = blade.width;
  const center = (s: number): Point => [blade.bend * w * s * s, -blade.length * s];
  ribbon(
    context,
    center,
    (s) =>
      w * Math.sin(Math.PI * Math.pow(s, 0.65)) * (1 + 0.12 * Math.sin(s * 26 + blade.phase)) + 0.5,
    28,
  );
  const gradient = context.createLinearGradient(0, 0, 0, -blade.length);
  gradient.addColorStop(0, rgb(mix(palette.dark, BLACK, shade)));
  gradient.addColorStop(1, rgb(mix(palette.light, BLACK, shade)));
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = rgb(mix(palette.dark, BLACK, 0.35 + shade), 0.55);
  context.lineWidth = Math.max(1, w * 0.045);
  context.stroke();
  context.strokeStyle = rgb(mix(palette.light, WHITE, 0.2), Math.max(0.05, 0.4 - shade));
  context.lineWidth = Math.max(1, w * 0.06);
  trace(context, center, 0.06, 0.9, 16);
  context.stroke();
  // The float at the base of each blade.
  context.fillStyle = rgb(mix(mix(palette.light, [255, 214, 110], 0.35), BLACK, shade));
  context.beginPath();
  context.ellipse(0, -w * 0.2, w * 0.2, w * 0.28, 0, 0, TAU);
  context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.beginPath();
  context.ellipse(-w * 0.06, -w * 0.28, w * 0.06, w * 0.08, 0, 0, TAU);
  context.fill();
  context.restore();
}

/** A tall stalk with alternating blades, like giant kelp. */
export function kelp(height: number, random: Random, palette: Palette, scale: number): PlantSprite {
  const width = height * 0.6;
  const rootX = width / 2;
  const reach = height * 0.86;
  const curve = (random() - 0.5) * width * 0.18;
  const stem = (s: number): Point => [
    rootX + curve * Math.sin(s * Math.PI * 1.2),
    height - s * reach,
  ];
  const count = 10 + Math.floor(random() * 4);
  const blades: (Blade & { s: number; side: number })[] = [];
  for (let k = 0; k < count; k++) {
    const s = 0.12 + (0.86 * k) / (count - 1);
    const side = k % 2 === 0 ? 1 : -1;
    const length = height * (0.21 - 0.1 * s) * (0.85 + random() * 0.3);
    blades.push({
      s,
      side,
      length,
      width: length * (0.28 + random() * 0.1),
      angle: side * (0.45 + random() * 0.4),
      bend: side * (random() * 0.6 - 0.1),
      phase: random() * TAU,
    });
  }
  return sprite(width, height, scale, (context) => {
    const paintSide = (side: number, shade: number): void => {
      for (const blade of blades) {
        if (blade.side !== side) continue;
        const p = stem(blade.s);
        kelpBlade(context, p[0], p[1], blade, palette, shade);
      }
    };
    // The far side is darker, so the stalk reads as round.
    paintSide(-1, 0.22);
    ribbon(context, stem, (s) => height * 0.016 * (1 - 0.55 * s) + 1, 30);
    context.fillStyle = rgb(mix(palette.dark, BLACK, 0.1));
    context.fill();
    paintSide(1, 0);
    const tip = stem(1);
    kelpBlade(
      context,
      tip[0],
      tip[1],
      { length: height * 0.09, width: height * 0.03, angle: 0.1, bend: 0.2, phase: 1 },
      palette,
      0,
    );
  });
}

/** Broad, ruffled leaves, like sea lettuce. */
export function seaLettuce(
  size: number,
  random: Random,
  palette: Palette,
  scale: number,
): PlantSprite {
  const width = size * 1.5;
  const rootX = width / 2;
  const leaves = 4 + Math.floor(random() * 3);
  return sprite(width, size, scale, (context) => {
    for (let k = 0; k < leaves; k++) {
      const t = k / (leaves - 1) - 0.5;
      const angle = t * 1.7 + (random() - 0.5) * 0.25;
      const length = size * (0.6 + random() * 0.35) * (1 - Math.abs(t) * 0.35);
      const w = length * (0.55 + random() * 0.2);
      const phase = random() * TAU;
      const bend = (random() - 0.5) * 0.5;
      context.save();
      context.translate(rootX, size);
      context.rotate(angle);
      const center = (s: number): Point => [bend * w * s * s, -length * s];
      ribbon(
        context,
        center,
        (s) =>
          w * Math.sin(Math.PI * Math.pow(s, 0.55)) * (1 + 0.09 * Math.sin(s * 34 + phase)) + 0.5,
        40,
      );
      const gradient = context.createLinearGradient(0, 0, 0, -length);
      gradient.addColorStop(0, rgb(palette.dark, 0.95));
      gradient.addColorStop(1, rgb(palette.light, 0.88));
      context.fillStyle = gradient;
      context.fill();
      context.strokeStyle = rgb(mix(palette.light, WHITE, 0.35), 0.45);
      context.lineWidth = Math.max(1, size * 0.012);
      context.stroke();
      context.strokeStyle = rgb(mix(palette.light, WHITE, 0.3), 0.25);
      trace(context, center, 0.08, 0.8, 12);
      context.stroke();
      context.restore();
    }
  });
}
