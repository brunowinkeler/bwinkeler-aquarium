import { quadSize, warpPerspective, type Quad } from './geometry.js';
import {
  boxBlur,
  createMask,
  createRgba,
  dilate,
  erode,
  fitSize,
  floodFromBorder,
  labelComponents,
  otsu,
  shrinkChannels,
  type Component,
  type Mask,
  type RgbaImage,
} from './image.js';

export interface ExtractOptions {
  /** -1 … 1; positive picks up lighter strokes, negative ignores more paper texture. */
  sensitivity?: number;
  /** Gap-bridging radius as a fraction of the long side. */
  closeOutlines?: number;
  /** Keep parts far from the main body (otherwise only the main group). */
  includeLooseParts?: boolean;
  /** Margin trimmed from each side of the rectified sheet. */
  inset?: number;
  /** Long side of the rectified working image. */
  workSize?: number;
  /** Long side of the exported image. */
  maxOutput?: number;
}

export const DEFAULT_EXTRACT_OPTIONS: Readonly<Required<ExtractOptions>> = {
  sensitivity: 0,
  closeOutlines: 0.006,
  includeLooseParts: false,
  inset: 0.02,
  workSize: 1024,
  maxOutput: 512,
};

export interface Segmentation {
  width: number;
  height: number;
  /** Colors divided by the local paper color: 3 floats per pixel, white paper ≈ 1. */
  color: Float32Array;
  foreground: Mask;
  coverage: number;
}

export interface ExtractResult {
  image: RgbaImage;
  coverage: number;
}

const INK_CHROMA_WEIGHT = 1.2;
const GROUP_GAP = 0.02;

function settingsOf(options: ExtractOptions): Required<ExtractOptions> {
  return { ...DEFAULT_EXTRACT_OPTIONS, ...options };
}

/** Rectifies the sheet inside `quad`, trimmed by the inset, at most `workSize` pixels long. */
export function rectify(image: RgbaImage, quad: Quad, options: ExtractOptions = {}): RgbaImage {
  const { inset, workSize } = settingsOf(options);
  const size = quadSize(quad);
  const span = 1 - 2 * inset;
  const fitted = fitSize(Math.max(1, size.width * span), Math.max(1, size.height * span), workSize);
  return warpPerspective(image, quad, fitted.width, fitted.height, inset);
}

/**
 * Paper color per pixel: the brightest pixels of each grid cell, with cells covered by
 * large fills or ink rebuilt from their neighbours. Dividing by it corrects shading and
 * white balance at once.
 */
function estimatePaper(image: RgbaImage): [Float32Array, Float32Array, Float32Array] {
  const { width, height, data } = image;
  const cell = Math.max(8, Math.round(Math.max(width, height) / 20));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const cells = cols * rows;
  const color = new Float32Array(cells * 3);
  const light = new Float32Array(cells);
  const valid = new Uint8Array(cells);
  const histogram = new Uint32Array(64);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cell;
      const y0 = row * cell;
      const x1 = Math.min(width, x0 + cell);
      const y1 = Math.min(height, y0 + cell);
      histogram.fill(0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const l = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
          histogram[Math.min(63, Math.floor(l * 64))]!++;
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      let cutoff = 63;
      for (let seen = 0; cutoff > 0; cutoff--) {
        seen += histogram[cutoff]!;
        if (seen >= count * 0.15) break;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const l = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
          if (Math.floor(l * 64) < cutoff) continue;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
      }
      const index = row * cols + col;
      color[index * 3] = r / n / 255;
      color[index * 3 + 1] = g / n / 255;
      color[index * 3 + 2] = b / n / 255;
      light[index] =
        0.299 * color[index * 3]! + 0.587 * color[index * 3 + 1]! + 0.114 * color[index * 3 + 2]!;
    }
  }

  const sorted = Float32Array.from(light).sort();
  const reference = sorted[Math.floor(sorted.length * 0.75)] ?? 1;
  for (let index = 0; index < cells; index++) {
    const r = color[index * 3]!;
    const g = color[index * 3 + 1]!;
    const b = color[index * 3 + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    valid[index] = light[index]! >= reference * 0.6 && chroma <= 0.15 ? 1 : 0;
  }
  if (valid.indexOf(1) === -1) {
    for (let index = 0; index < cells; index++) {
      color[index * 3] = reference;
      color[index * 3 + 1] = reference;
      color[index * 3 + 2] = reference;
      valid[index] = 1;
    }
  }
  for (let pass = 0; pass < cols + rows && valid.indexOf(0) !== -1; pass++) {
    const next = Uint8Array.from(valid);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (valid[index]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = row + dy;
            const nx = col + dx;
            if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
            const neighbour = ny * cols + nx;
            if (!valid[neighbour]) continue;
            r += color[neighbour * 3]!;
            g += color[neighbour * 3 + 1]!;
            b += color[neighbour * 3 + 2]!;
            n++;
          }
        }
        if (n === 0) continue;
        color[index * 3] = r / n;
        color[index * 3 + 1] = g / n;
        color[index * 3 + 2] = b / n;
        next[index] = 1;
      }
    }
    valid.set(next);
  }

  const out: [Float32Array, Float32Array, Float32Array] = [
    new Float32Array(width * height),
    new Float32Array(width * height),
    new Float32Array(width * height),
  ];
  for (let y = 0; y < height; y++) {
    const cy = Math.min(Math.max((y + 0.5) / cell - 0.5, 0), rows - 1);
    const r0 = Math.floor(cy);
    const r1 = Math.min(r0 + 1, rows - 1);
    const ty = cy - r0;
    for (let x = 0; x < width; x++) {
      const cx = Math.min(Math.max((x + 0.5) / cell - 0.5, 0), cols - 1);
      const c0 = Math.floor(cx);
      const c1 = Math.min(c0 + 1, cols - 1);
      const tx = cx - c0;
      for (let channel = 0; channel < 3; channel++) {
        const top =
          color[(r0 * cols + c0) * 3 + channel]! * (1 - tx) +
          color[(r0 * cols + c1) * 3 + channel]! * tx;
        const bottom =
          color[(r1 * cols + c0) * 3 + channel]! * (1 - tx) +
          color[(r1 * cols + c1) * 3 + channel]! * tx;
        out[channel]![y * width + x] = top * (1 - ty) + bottom * ty;
      }
    }
  }
  return out;
}

function boxGap(
  a: Component,
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

/** Separates the drawing from the paper of a rectified sheet; null when nothing was found. */
export function segment(image: RgbaImage, options: ExtractOptions = {}): Segmentation | null {
  const settings = settingsOf(options);
  const { width, height, data } = image;
  const total = width * height;
  const longSide = Math.max(width, height);
  const [paperR, paperG, paperB] = estimatePaper(image);
  const color = new Float32Array(total * 3);
  const score = new Float32Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const r = Math.min(1, data[i]! / 255 / Math.max(paperR[p]!, 0.05));
    const g = Math.min(1, data[i + 1]! / 255 / Math.max(paperG[p]!, 0.05));
    const b = Math.min(1, data[i + 2]! / 255 / Math.max(paperB[p]!, 0.05));
    color[p * 3] = r;
    color[p * 3 + 1] = g;
    color[p * 3 + 2] = b;
    const light = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    score[p] = Math.min(1, Math.max(1 - light, INK_CHROMA_WEIGHT * chroma));
  }

  const base = Math.min(0.5, Math.max(0.1, otsu(score)));
  const sensitivity = Math.min(1, Math.max(-1, settings.sensitivity));
  const threshold = Math.min(0.8, Math.max(0.04, base * (1 - 0.6 * sensitivity)));
  const ink = createMask(width, height);
  for (let p = 0; p < total; p++) ink.data[p] = score[p]! > threshold ? 1 : 0;

  const radius = Math.max(1, Math.round(settings.closeOutlines * longSide));
  const closed = erode(dilate(ink, radius), radius);
  // A thin band along the edge stays passable, so table or frame slivers left by an
  // imprecise crop cannot wall the flood fill out of the sheet.
  const band = Math.max(2, Math.round(0.01 * longSide));
  const passable = createMask(width, height);
  for (let y = 0; y < height; y++) {
    const edgeRow = y < band || y >= height - band;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      passable.data[p] = !closed.data[p] || edgeRow || x < band || x >= width - band ? 1 : 0;
    }
  }
  const background = floodFromBorder(passable);
  const filled = createMask(width, height);
  for (let p = 0; p < total; p++) filled.data[p] = background.data[p] ? 0 : 1;

  const { labels, components } = labelComponents(filled);
  const minArea = Math.max(12, total * 0.0004);
  const significant = components.filter((c) => c.area >= minArea).sort((a, b) => b.area - a.area);
  const main = significant[0];
  if (!main) return null;
  const kept = new Uint8Array(components.length + 1);
  kept[main.label] = 1;
  if (settings.includeLooseParts) {
    for (const component of significant) kept[component.label] = 1;
  } else {
    const group = { minX: main.minX, minY: main.minY, maxX: main.maxX, maxY: main.maxY };
    const gap = GROUP_GAP * longSide;
    for (let changed = true; changed;) {
      changed = false;
      for (const component of significant) {
        if (kept[component.label] || boxGap(component, group) > gap) continue;
        kept[component.label] = 1;
        group.minX = Math.min(group.minX, component.minX);
        group.minY = Math.min(group.minY, component.minY);
        group.maxX = Math.max(group.maxX, component.maxX);
        group.maxY = Math.max(group.maxY, component.maxY);
        changed = true;
      }
    }
  }

  const foreground = createMask(width, height);
  let area = 0;
  for (let p = 0; p < total; p++) {
    if (kept[labels[p]!]) {
      foreground.data[p] = 1;
      area++;
    }
  }
  return { width, height, color, foreground, coverage: area / total };
}

/** Soft alpha, edge color decontamination against white paper, a color boost and the crop. */
function compose(segmentation: Segmentation, maxOutput: number): RgbaImage {
  const { width, height, color, foreground } = segmentation;
  const soft = boxBlur({ width, height, data: Float32Array.from(foreground.data) }, 1);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!foreground.data[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const premultiplied = new Float32Array(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      const p = (y + minY) * width + (x + minX);
      if (!foreground.data[p]) continue;
      const alpha = soft.data[p]!;
      const channels = [color[p * 3]!, color[p * 3 + 1]!, color[p * 3 + 2]!].map((c) =>
        Math.min(1, Math.max(0, (c - (1 - alpha)) / alpha)),
      );
      const mean = (channels[0]! + channels[1]! + channels[2]!) / 3;
      const target = (y * cropWidth + x) * 4;
      for (let c = 0; c < 3; c++) {
        const boosted = Math.min(1, Math.max(0, mean + (channels[c]! - mean) * 1.2));
        premultiplied[target + c] = boosted * alpha;
      }
      premultiplied[target + 3] = alpha;
    }
  }
  const size = fitSize(cropWidth, cropHeight, maxOutput);
  const shrunk = shrinkChannels(premultiplied, cropWidth, cropHeight, 4, size.width, size.height);
  const out = createRgba(size.width, size.height);
  for (let i = 0; i < out.data.length; i += 4) {
    const alpha = shrunk[i + 3]!;
    if (alpha <= 0) continue;
    out.data[i] = (shrunk[i]! / alpha) * 255;
    out.data[i + 1] = (shrunk[i + 1]! / alpha) * 255;
    out.data[i + 2] = (shrunk[i + 2]! / alpha) * 255;
    out.data[i + 3] = alpha * 255;
  }
  return out;
}

/** Full pipeline: rectify, segment and export a transparent creature image. */
export function extractCreature(
  image: RgbaImage,
  quad: Quad,
  options: ExtractOptions = {},
): ExtractResult | null {
  const settings = settingsOf(options);
  const segmentation = segment(rectify(image, quad, settings), settings);
  if (!segmentation) return null;
  return { image: compose(segmentation, settings.maxOutput), coverage: segmentation.coverage };
}
