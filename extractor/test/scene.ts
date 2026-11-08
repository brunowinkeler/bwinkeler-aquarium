import { createRgba, solveHomography, type Quad, type RgbaImage } from '../src/index.js';

type Rgb = readonly [number, number, number];

function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A shape on the sheet in paper coordinates: u across, v down, both in [0, 1]. */
export interface Shape {
  /** Signed distance in units of the sheet width; negative inside. */
  distance(u: number, v: number): number;
  fill: Rgb | null;
  stroke: Rgb | null;
  /** Stroke width in units of the sheet width. */
  strokeWidth: number;
}

const ASPECT = 210 / 297;

export function ellipse(
  cu: number,
  cv: number,
  ru: number,
  rv: number,
  fill: Rgb | null,
  stroke: Rgb | null,
): Shape {
  return {
    distance(u, v) {
      const dv = (v - cv) * ASPECT;
      const rvw = rv * ASPECT;
      const k = Math.hypot((u - cu) / ru, dv / rvw);
      return (k - 1) * Math.min(ru, rvw);
    },
    fill,
    stroke,
    strokeWidth: 0.008,
  };
}

export function triangle(
  points: readonly [number, number][],
  fill: Rgb | null,
  stroke: Rgb | null,
): Shape {
  const scaled = points.map(([u, v]) => [u, v * ASPECT] as const);
  return {
    distance(u, v) {
      const p = [u, v * ASPECT] as const;
      let positive = 0;
      let negative = 0;
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const a = scaled[i]!;
        const b = scaled[(i + 1) % 3]!;
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey)),
        );
        best = Math.min(best, Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey));
        const cross = ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
        if (cross > 0) positive++;
        if (cross < 0) negative++;
      }
      return positive === 0 || negative === 0 ? -best : best;
    },
    fill,
    stroke,
    strokeWidth: 0.008,
  };
}

const INK: Rgb = [40, 40, 52];
export const ORANGE: Rgb = [255, 138, 61];
const YELLOW: Rgb = [255, 210, 63];

/** An orange fish with a yellow tail and an eye, plus a loose outline-only bubble. */
export const FISH: Shape[] = [
  triangle(
    [
      [0.28, 0.5],
      [0.14, 0.36],
      [0.14, 0.64],
    ],
    YELLOW,
    INK,
  ),
  ellipse(0.45, 0.5, 0.2, 0.14, ORANGE, INK),
  ellipse(0.57, 0.46, 0.015, 0.015, INK, null),
];
export const BUBBLE: Shape = ellipse(0.82, 0.25, 0.06, 0.06, null, INK);

/** Pencil-like outline only: the interior must stay opaque white. */
export const PENCIL_FISH: Shape[] = [
  { ...ellipse(0.5, 0.5, 0.22, 0.16, null, [150, 150, 150]), strokeWidth: 0.005 },
];

export function paperColor(shapes: readonly Shape[], u: number, v: number): Rgb | null {
  let color: Rgb | null = null;
  for (const shape of shapes) {
    const d = shape.distance(u, v);
    if (shape.stroke && Math.abs(d) <= shape.strokeWidth / 2) color = shape.stroke;
    else if (shape.fill && d < 0) color = shape.fill;
  }
  return color;
}

/** Ground truth: inside any shape, or on its stroke. */
export function inDrawing(shapes: readonly Shape[], u: number, v: number): boolean {
  return shapes.some((shape) => shape.distance(u, v) <= (shape.stroke ? shape.strokeWidth / 2 : 0));
}

export const SHEET: Quad = [
  { x: 190, y: 130 },
  { x: 1090, y: 160 },
  { x: 1150, y: 800 },
  { x: 150, y: 850 },
];

/** A photo of the sheet on a table, with perspective, uneven light, a shadow and noise. */
export function photograph(
  shapes: readonly Shape[],
  quad: Quad = SHEET,
  width = 1280,
  height = 960,
): RgbaImage {
  const unit: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const toPaper = solveHomography(quad, unit);
  if (!toPaper) throw new Error('degenerate sheet');
  const image = createRgba(width, height);
  const random = noise(42);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = toPaper[6]! * (x + 0.5) + toPaper[7]! * (y + 0.5) + toPaper[8]!;
      const u = (toPaper[0]! * (x + 0.5) + toPaper[1]! * (y + 0.5) + toPaper[2]!) / w;
      const v = (toPaper[3]! * (x + 0.5) + toPaper[4]! * (y + 0.5) + toPaper[5]!) / w;
      let rgb: Rgb;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        rgb = paperColor(shapes, u, v) ?? [246, 244, 238];
      } else {
        rgb = [118, 96, 78];
      }
      const shadow = 0.2 * Math.exp(-((Math.hypot(x - 1000, y - 820) / 300) ** 2));
      const light = 0.72 + 0.28 * (1 - x / width) - shadow;
      const tint = [1, 0.98, 0.93];
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        image.data[i + c] = rgb[c]! * light * tint[c]! + (random() - 0.5) * 8;
      }
      image.data[i + 3] = 255;
    }
  }
  return image;
}
