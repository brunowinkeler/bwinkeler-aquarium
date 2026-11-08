import { quadArea, orderQuad, type Point, type Quad } from './geometry.js';
import {
  createMask,
  erode,
  fitSize,
  labelComponents,
  otsu,
  shrinkRgba,
  type Component,
  type RgbaImage,
} from './image.js';

const DETECTION_SIDE = 360;
const MIN_PAPER_SHARE = 0.12;

export interface PaperDetection {
  quad: Quad;
  /** False when no sheet stood out; the quad then covers the whole photo. */
  confident: boolean;
}

function wholeImage(width: number, height: number): Quad {
  const mx = width * 0.01;
  const my = height * 0.01;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

/** Finds the white sheet: bright, unsaturated, large and preferably central. */
export function detectPaperQuad(image: RgbaImage): PaperDetection {
  const size = fitSize(image.width, image.height, DETECTION_SIDE);
  const small = shrinkRgba(image, size.width, size.height);
  const { width, height, data } = small;
  const total = width * height;
  const score = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const light = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    score[p] = Math.min(1, Math.max(0, light - 1.5 * chroma));
  }
  const threshold = otsu(score);
  const bright = createMask(width, height);
  for (let p = 0; p < total; p++) bright.data[p] = score[p]! >= threshold ? 1 : 0;
  const { labels, components } = labelComponents(erode(bright, 1));

  const center = labels[Math.floor(height / 2) * width + Math.floor(width / 2)] ?? 0;
  let best: Component | null = null;
  let bestScore = 0;
  for (const component of components) {
    const value = component.area * (component.label === center ? 1.5 : 1);
    if (value > bestScore) {
      bestScore = value;
      best = component;
    }
  }
  if (!best || best.area < total * MIN_PAPER_SHARE) {
    return { quad: wholeImage(image.width, image.height), confident: false };
  }

  let topLeft = Infinity;
  let bottomRight = -Infinity;
  let topRight = -Infinity;
  let bottomLeft = -Infinity;
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  for (let y = best.minY; y <= best.maxY; y++) {
    for (let x = best.minX; x <= best.maxX; x++) {
      if (labels[y * width + x] !== best.label) continue;
      if (x + y < topLeft) {
        topLeft = x + y;
        corners[0] = { x, y };
      }
      if (x - y > topRight) {
        topRight = x - y;
        corners[1] = { x: x + 1, y };
      }
      if (x + y > bottomRight) {
        bottomRight = x + y;
        corners[2] = { x: x + 1, y: y + 1 };
      }
      if (y - x > bottomLeft) {
        bottomLeft = y - x;
        corners[3] = { x, y: y + 1 };
      }
    }
  }
  const sx = image.width / width;
  const sy = image.height / height;
  const quad = orderQuad(corners.map((point) => ({ x: point.x * sx, y: point.y * sy })));
  const confident = quadArea(quad) >= best.area * sx * sy * 0.6;
  return { quad: confident ? quad : wholeImage(image.width, image.height), confident };
}
