import { describe, expect, it } from 'vitest';
import {
  createMask,
  createRgba,
  DEFAULT_EXTRACT_OPTIONS,
  detectPaperQuad,
  extractCreature,
  floodFromBorder,
  otsu,
  project,
  rectify,
  segment,
  solveHomography,
  type Quad,
  type Segmentation,
} from '../src/index.js';
import { BUBBLE, FISH, PENCIL_FISH, SHEET, inDrawing, photograph, type Shape } from './scene.js';

const INSET = DEFAULT_EXTRACT_OPTIONS.inset;

function iou(segmentation: Segmentation, shapes: readonly Shape[]): number {
  const { width, height, foreground } = segmentation;
  const span = 1 - 2 * INSET;
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const truth = inDrawing(
        shapes,
        INSET + (span * (x + 0.5)) / width,
        INSET + (span * (y + 0.5)) / height,
      );
      const found = foreground.data[y * width + x] === 1;
      if (truth && found) intersection++;
      if (truth || found) union++;
    }
  }
  return intersection / union;
}

const photoWithBubble = photograph([...FISH, BUBBLE]);

describe('geometry', () => {
  it('maps the four corners exactly', () => {
    const unit: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const h = solveHomography(unit, SHEET);
    expect(h).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const point = project(h!, unit[i]!.x, unit[i]!.y);
      expect(point.x).toBeCloseTo(SHEET[i]!.x, 6);
      expect(point.y).toBeCloseTo(SHEET[i]!.y, 6);
    }
  });
});

describe('image operations', () => {
  it('splits two populations with Otsu', () => {
    const values = [
      ...Array.from({ length: 900 }, () => 0.05),
      ...Array.from({ length: 100 }, () => 0.7),
    ];
    const threshold = otsu(values);
    expect(threshold).toBeGreaterThan(0.05);
    expect(threshold).toBeLessThanOrEqual(0.7);
  });

  it('floods from the border but not into enclosed holes', () => {
    const mask = createMask(7, 7);
    mask.data.fill(1);
    for (let i = 1; i < 6; i++) {
      mask.data[1 * 7 + i] = 0;
      mask.data[5 * 7 + i] = 0;
      mask.data[i * 7 + 1] = 0;
      mask.data[i * 7 + 5] = 0;
    }
    const reached = floodFromBorder(mask);
    expect(reached.data[0]).toBe(1);
    expect(reached.data[3 * 7 + 3]).toBe(0);
  });
});

describe('detectPaperQuad', () => {
  it('finds the corners of the sheet', () => {
    const detection = detectPaperQuad(photoWithBubble);
    expect(detection.confident).toBe(true);
    const tolerance = 0.025 * Math.hypot(1280, 960);
    for (let i = 0; i < 4; i++) {
      const found = detection.quad[i]!;
      expect(Math.hypot(found.x - SHEET[i]!.x, found.y - SHEET[i]!.y)).toBeLessThan(tolerance);
    }
  });

  it('falls back to the whole photo when no sheet stands out', () => {
    const image = createRgba(400, 300);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 90 + ((i / 4) % 7);
      image.data[i + 1] = 80;
      image.data[i + 2] = 70;
      image.data[i + 3] = 255;
    }
    const detection = detectPaperQuad(image);
    expect(detection.confident).toBe(false);
    expect(detection.quad[2].x).toBeGreaterThan(390);
  });
});

describe('segment', () => {
  it('separates a colored drawing from shaded paper and drops loose parts', () => {
    const segmentation = segment(rectify(photoWithBubble, SHEET));
    expect(segmentation).not.toBeNull();
    expect(iou(segmentation!, FISH)).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps loose parts on request', () => {
    const segmentation = segment(rectify(photoWithBubble, SHEET), { includeLooseParts: true });
    expect(iou(segmentation!, [...FISH, BUBBLE])).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps the white interior of an outline-only pencil drawing', () => {
    const segmentation = segment(rectify(photograph(PENCIL_FISH), SHEET));
    expect(iou(segmentation!, PENCIL_FISH)).toBeGreaterThanOrEqual(0.95);
  });

  it('works from the detected corners too', () => {
    const detection = detectPaperQuad(photoWithBubble);
    const segmentation = segment(rectify(photoWithBubble, detection.quad));
    expect(segmentation!.coverage).toBeGreaterThan(0.05);
    expect(segmentation!.coverage).toBeLessThan(0.3);
  });
});

describe('extractCreature', () => {
  it('exports a cropped transparent image with the drawing colors', () => {
    const result = extractCreature(photoWithBubble, SHEET);
    expect(result).not.toBeNull();
    const { width, height, data } = result!.image;
    expect(Math.max(width, height)).toBeLessThanOrEqual(512);
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
    expect(transparent / (width * height)).toBeGreaterThan(0.1);
    const i = (Math.round(0.6 * height) * width + Math.round(0.55 * width)) * 4;
    expect(data[i + 3]).toBe(255);
    expect(data[i]!).toBeGreaterThan(200);
    expect(data[i + 1]!).toBeGreaterThan(90);
    expect(data[i + 1]!).toBeLessThan(190);
    expect(data[i + 2]!).toBeLessThan(110);
  });

  it('finds nothing on a blank sheet', () => {
    expect(extractCreature(photograph([]), SHEET)).toBeNull();
  });

  it('picks up more of a faint drawing with a higher sensitivity', () => {
    const rectified = rectify(photograph(PENCIL_FISH), SHEET);
    const low = segment(rectified, { sensitivity: -0.8, closeOutlines: 0.001 });
    const high = segment(rectified, { sensitivity: 0.8 });
    expect(high!.coverage).toBeGreaterThanOrEqual(low?.coverage ?? 0);
  });
});
