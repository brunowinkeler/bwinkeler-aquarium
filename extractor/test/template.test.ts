import aruco from 'js-aruco2';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTRACT_OPTIONS,
  detectTemplate,
  fitHomography,
  MARKER_CELLS,
  markerBits,
  project,
  rectify,
  segment,
  solveHomography,
  TEMPLATE_KINDS,
  TEMPLATE_LAYOUT,
  templateMarkerId,
  type Point,
  type Quad,
  type Segmentation,
  type TemplateKind,
} from '../src/index.js';
import { ellipse, FISH, inDrawing, photograph, SHEET, type Print, type Shape } from './scene.js';

const { page, markers, markerSize, frame, frameMargin } = TEMPLATE_LAYOUT;
const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const DRAWING = {
  left: frame.x + frameMargin,
  top: frame.y + frameMargin,
  right: frame.x + frame.width - frameMargin,
  bottom: frame.y + frame.height - frameMargin,
};

/** The template as printed: markers, the frame line and white paper. */
function printed(kind: TemplateKind): Print {
  const cell = markerSize / MARKER_CELLS;
  const bits = markers.map((_, corner) => markerBits(templateMarkerId(kind, corner)));
  return (u, v) => {
    const x = u * page.width;
    const y = v * page.height;
    for (let corner = 0; corner < 4; corner++) {
      const column = Math.floor((x - markers[corner]!.x) / cell);
      const row = Math.floor((y - markers[corner]!.y) / cell);
      if (column < 0 || row < 0 || column >= MARKER_CELLS || row >= MARKER_CELLS) continue;
      const last = MARKER_CELLS - 1;
      const edge = row === 0 || column === 0 || row === last || column === last;
      return !edge && bits[corner]![(row - 1) * 6 + column - 1] ? null : [22, 22, 26];
    }
    const inside = (value: number, from: number, length: number) =>
      value >= from && value <= from + length;
    const near = (value: number, line: number) => Math.abs(value - line) <= 0.4;
    const vertical =
      (near(x, frame.x) || near(x, frame.x + frame.width)) && inside(y, frame.y, frame.height);
    const horizontal =
      (near(y, frame.y) || near(y, frame.y + frame.height)) && inside(x, frame.x, frame.width);
    return vertical || horizontal ? [74, 144, 200] : null;
  };
}

/** Where the drawing area of a sheet photographed at `sheet` really is. */
function expectedQuad(sheet: Quad): Quad {
  const h = solveHomography(UNIT, sheet)!;
  const at = (x: number, y: number): Point => project(h, x / page.width, y / page.height);
  return [
    at(DRAWING.left, DRAWING.top),
    at(DRAWING.right, DRAWING.top),
    at(DRAWING.right, DRAWING.bottom),
    at(DRAWING.left, DRAWING.bottom),
  ];
}

function expectNear(found: Quad, expected: Quad, tolerance: number): void {
  for (let i = 0; i < 4; i++) {
    const distance = Math.hypot(found[i]!.x - expected[i]!.x, found[i]!.y - expected[i]!.y);
    expect(distance).toBeLessThan(tolerance);
  }
}

/** Overlap with the drawn shapes, mapping the rectified drawing area back to the sheet. */
function iou(segmentation: Segmentation, shapes: readonly Shape[]): number {
  const { width, height, foreground } = segmentation;
  const inset = DEFAULT_EXTRACT_OPTIONS.inset;
  const span = 1 - 2 * inset;
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = inset + (span * (x + 0.5)) / width;
      const t = inset + (span * (y + 0.5)) / height;
      const u = (DRAWING.left + s * (DRAWING.right - DRAWING.left)) / page.width;
      const v = (DRAWING.top + t * (DRAWING.bottom - DRAWING.top)) / page.height;
      const truth = inDrawing(shapes, u, v);
      const found = foreground.data[y * width + x] === 1;
      if (truth && found) intersection++;
      if (truth || found) union++;
    }
  }
  return intersection / union;
}

describe('template markers', () => {
  it('are the first codes of the ArUco ARUCO_MIP_36h12 dictionary', () => {
    const dictionary = new aruco.AR.Dictionary('ARUCO_MIP_36h12');
    for (let id = 0; id < TEMPLATE_KINDS.length * 4; id++) {
      const bits = markerBits(id)
        .map((white) => (white ? '1' : '0'))
        .join('');
      expect(bits).toBe(dictionary.codeList[id]);
    }
  });

  it('are read by a standard ArUco detector', () => {
    const flat: Quad = [
      { x: 0, y: 0 },
      { x: 891, y: 0 },
      { x: 891, y: 630 },
      { x: 0, y: 630 },
    ];
    const photo = photograph([], flat, 891, 630, printed('pulse'));
    const detector = new aruco.AR.Detector({
      dictionaryName: 'ARUCO_MIP_36h12',
      maxHammingDistance: 1,
    });
    const ids = detector
      .detect(photo)
      .map((marker) => marker.id)
      .filter((id) => id < 20)
      .sort((a, b) => a - b);
    expect(ids).toEqual([8, 9, 10, 11]);
  });
});

describe('fitHomography', () => {
  it('recovers a perspective map from more than four points', () => {
    const truth = solveHomography(UNIT, SHEET)!;
    const from = Array.from({ length: 12 }, (_, i) => ({
      x: (i % 4) / 3,
      y: Math.floor(i / 4) / 2,
    }));
    const to = from.map((point) => project(truth, point.x, point.y));
    const h = fitHomography(from, to)!;
    for (const point of [
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.1 },
    ]) {
      const expected = project(truth, point.x, point.y);
      const found = project(h, point.x, point.y);
      expect(found.x).toBeCloseTo(expected.x, 6);
      expect(found.y).toBeCloseTo(expected.y, 6);
    }
  });
});

describe('detectTemplate', () => {
  it('finds the drawing area and the kind of a photographed template', () => {
    const detection = detectTemplate(photograph(FISH, SHEET, 1280, 960, printed('walk')));
    expect(detection).not.toBeNull();
    expect(detection!.kind).toBe('walk');
    expect(detection!.markers).toBe(4);
    expectNear(detection!.quad, expectedQuad(SHEET), 4);
  });

  it('turns an upside-down template back and extracts the drawing', () => {
    const upsideDown: Quad = [SHEET[2], SHEET[3], SHEET[0], SHEET[1]];
    const photo = photograph(FISH, upsideDown, 1280, 960, printed('generic'));
    const detection = detectTemplate(photo);
    expect(detection!.kind).toBe('generic');
    expectNear(detection!.quad, expectedQuad(upsideDown), 4);
    const segmentation = segment(rectify(photo, detection!.quad));
    expect(iou(segmentation!, FISH)).toBeGreaterThanOrEqual(0.93);
  });

  it('needs only three markers', () => {
    const scribble = ellipse(0.92, 0.11, 0.05, 0.07, [40, 90, 200], null);
    const photo = photograph([...FISH, scribble], SHEET, 1280, 960, printed('glide'));
    const detection = detectTemplate(photo);
    expect(detection!.kind).toBe('glide');
    expect(detection!.markers).toBe(3);
    expectNear(detection!.quad, expectedQuad(SHEET), 5);
  });

  it('works on a smaller, downscaled photo', () => {
    const small: Quad = SHEET.map((point) => ({ x: point.x * 0.6, y: point.y * 0.6 })) as Quad;
    const detection = detectTemplate(photograph(FISH, small, 768, 576, printed('swim')));
    expect(detection!.kind).toBe('swim');
    expectNear(detection!.quad, expectedQuad(small), 4);
  });

  it('ignores a plain sheet', () => {
    expect(detectTemplate(photograph(FISH))).toBeNull();
  });
});
