import { createRgba, type RgbaImage } from './image.js';

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** 3×3 row-major matrix with h[8] = 1. */
export type Homography = Float64Array;

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]!]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![column]!) < 1e-12) return null;
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    const lead = a[column]!;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const current = a[row]!;
      const factor = current[column]! / lead[column]!;
      if (factor === 0) continue;
      for (let k = column; k <= n; k++) current[k] = current[k]! - factor * lead[k]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

/** Maps the four `from` points onto the four `to` points. */
export function solveHomography(from: Quad, to: Quad): Homography | null {
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    vector.push(v);
  }
  const h = solve(matrix, vector);
  if (!h) return null;
  return Float64Array.from([...h, 1]);
}

export function project(h: Homography, x: number, y: number): Point {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return {
    x: (h[0]! * x + h[1]! * y + h[2]!) / w,
    y: (h[3]! * x + h[4]! * y + h[5]!) / w,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Size of the rectangle the quad most likely shows. */
export function quadSize(quad: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  return {
    width: (distance(tl, tr) + distance(bl, br)) / 2,
    height: (distance(tl, bl) + distance(tr, br)) / 2,
  };
}

export function quadArea(quad: Quad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(points: readonly Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDifference = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0]!, byDifference[3]!, bySum[3]!, byDifference[0]!];
}

/**
 * Samples the region inside `quad` into a `width`×`height` image. `inset` trims a margin
 * (fraction of each side) of the rectified sheet; samples outside the photo become white.
 */
export function warpPerspective(
  image: RgbaImage,
  quad: Quad,
  width: number,
  height: number,
  inset = 0,
): RgbaImage {
  const unit: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const h = solveHomography(unit, quad);
  const out = createRgba(width, height);
  if (!h) return out;
  const span = 1 - 2 * inset;
  const source = image.data;
  const sw = image.width;
  const sh = image.height;
  for (let y = 0; y < height; y++) {
    const v = inset + (span * (y + 0.5)) / height;
    for (let x = 0; x < width; x++) {
      const u = inset + (span * (x + 0.5)) / width;
      const w = h[6]! * u + h[7]! * v + h[8]!;
      const sx = (h[0]! * u + h[1]! * v + h[2]!) / w - 0.5;
      const sy = (h[3]! * u + h[4]! * v + h[5]!) / w - 0.5;
      const target = (y * width + x) * 4;
      if (sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) {
        out.data[target] = 255;
        out.data[target + 1] = 255;
        out.data[target + 2] = 255;
        out.data[target + 3] = 255;
        continue;
      }
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const tx = Math.min(1, Math.max(0, sx - x0));
      const ty = Math.min(1, Math.max(0, sy - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = source[i00 + c]! * (1 - tx) + source[i10 + c]! * tx;
        const bottom = source[i01 + c]! * (1 - tx) + source[i11 + c]! * tx;
        out.data[target + c] = top * (1 - ty) + bottom * ty;
      }
      out.data[target + 3] = 255;
    }
  }
  return out;
}
