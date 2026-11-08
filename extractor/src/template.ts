import {
  fitHomography,
  project,
  quadArea,
  solveHomography,
  type Homography,
  type Point,
  type Quad,
} from './geometry.js';
import {
  bilinear,
  boxBlur,
  createMask,
  fitSize,
  labelComponents,
  luminance,
  otsu,
  shrinkChannels,
  type Component,
  type Plane,
  type RgbaImage,
} from './image.js';

/** What a printed template asks for; `generic` leaves the kind to the preview. */
export const TEMPLATE_KINDS = ['generic', 'swim', 'pulse', 'walk', 'glide'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Template geometry in millimetres on an A4 landscape page. */
export const TEMPLATE_LAYOUT = {
  page: { width: 297, height: 210 },
  markerSize: 28,
  /** Top-left corner of the marker at each page corner: top-left, top-right, bottom-right, bottom-left. */
  markers: [
    { x: 10, y: 10 },
    { x: 259, y: 10 },
    { x: 259, y: 172 },
    { x: 10, y: 172 },
  ],
  /** Centre line of the printed frame around the drawing area. */
  frame: { x: 10, y: 42, width: 277, height: 126, radius: 6 },
  /** The crop stays this far inside the frame line, so the line never reaches the ink mask. */
  frameMargin: 2,
} as const;

/** Cells per marker side: a one-cell black border around 6×6 data cells. */
export const MARKER_CELLS = 8;

// IDs 0–19 of the ArUco ARUCO_MIP_36h12 dictionary (as listed by js-aruco2); row-major, 1 = white.
const MARKER_CODES = [
  0xd2b63a09d, 0x6001134e5, 0x1206fbe72, 0xff8ad6cb4, 0x85da9bc49, 0xb461afe9c, 0x6db51fe13,
  0x5248c541f, 0x8f34503, 0x8ea462ece, 0xeac2be76d, 0x1af615c44, 0xb48a49f27, 0x2e4e1283b,
  0x78b1f2fa8, 0x27d34f57e, 0x89222fff1, 0x4c1669406, 0xbf49b3511, 0xdc191cd5d,
];

/** Marker ID printed at `corner` (0 = top-left, then clockwise) of the template for `kind`. */
export function templateMarkerId(kind: TemplateKind, corner: number): number {
  return TEMPLATE_KINDS.indexOf(kind) * 4 + corner;
}

/** The 6×6 data cells of a marker, row-major; true = white. */
export function markerBits(id: number): boolean[] {
  const code = MARKER_CODES[id];
  if (code === undefined) throw new RangeError(`Unknown template marker ${id}`);
  // The codes are 36 bits wide, beyond the 32-bit bitwise operators.
  return Array.from({ length: 36 }, (_, i) => Math.floor(code / 2 ** (35 - i)) % 2 === 1);
}

export interface TemplateDetection {
  kind: TemplateKind;
  /** Drawing area inside the frame, in photo pixels, in the template's own orientation. */
  quad: Quad;
  /** Markers found: 3 or 4. */
  markers: number;
}

interface FoundMarker {
  id: number;
  /** The marker's own top-left, top-right, bottom-right and bottom-left corners. */
  corners: Quad;
}

const DETECTION_SIDE = 1280;
const MAX_BIT_ERRORS = 3;
const MIN_DARK_BORDER = 26;
const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const SAMPLE_OFFSETS = [
  [0, 0],
  [-0.2, -0.2],
  [0.2, -0.2],
  [0.2, 0.2],
  [-0.2, 0.2],
] as const;
const CODE_BITS = MARKER_CODES.map((_, id) => markerBits(id));

/** Twice the signed area; positive when the corners run clockwise on screen. */
function orientation(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

function isConvex(quad: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const c = quad[(i + 2) % 4]!;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return false;
  }
  return true;
}

/** Corners of a roughly quadrilateral blob, clockwise on screen; null for other shapes. */
function blobCorners(labels: Int32Array, width: number, blob: Component): Quad | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let cx = 0;
  let cy = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      if (labels[y * width + x] !== blob.label) continue;
      xs.push(x + 0.5);
      ys.push(y + 0.5);
      cx += x + 0.5;
      cy += y + 0.5;
    }
  }
  const count = xs.length;
  cx /= count;
  cy /= count;
  const farthest = (px: number, py: number): number => {
    let best = -1;
    let index = 0;
    for (let i = 0; i < count; i++) {
      const distance = (xs[i]! - px) ** 2 + (ys[i]! - py) ** 2;
      if (distance > best) {
        best = distance;
        index = i;
      }
    }
    return index;
  };
  // The farthest point from the centre is a corner, the farthest from it the opposite one,
  // and the farthest on each side of that diagonal are the other two.
  const a = farthest(cx, cy);
  const c = farthest(xs[a]!, ys[a]!);
  const dx = xs[c]! - xs[a]!;
  const dy = ys[c]! - ys[a]!;
  let b = -1;
  let d = -1;
  let most = 0;
  let least = 0;
  for (let i = 0; i < count; i++) {
    const side = dx * (ys[i]! - ys[a]!) - dy * (xs[i]! - xs[a]!);
    if (side > most) {
      most = side;
      b = i;
    }
    if (side < least) {
      least = side;
      d = i;
    }
  }
  if (b < 0 || d < 0) return null;
  const at = (i: number): Point => ({ x: xs[i]!, y: ys[i]! });
  let quad: Quad = [at(a), at(b), at(c), at(d)];
  if (orientation(quad) < 0) quad = [quad[0], quad[3], quad[2], quad[1]];
  const area = orientation(quad) / 2;
  if (!isConvex(quad) || count < area * 0.3 || count > area * 1.3 + 4 * Math.sqrt(area)) {
    return null;
  }
  return quad;
}

/** Mean brightness of each marker cell, with `corners` taken as the marker's own corners. */
function sampleCells(light: Plane, corners: Quad): Float32Array | null {
  const h = solveHomography(UNIT, corners);
  if (!h) return null;
  const cells = new Float32Array(MARKER_CELLS * MARKER_CELLS);
  for (let row = 0; row < MARKER_CELLS; row++) {
    for (let column = 0; column < MARKER_CELLS; column++) {
      let sum = 0;
      for (const [ox, oy] of SAMPLE_OFFSETS) {
        const point = project(
          h,
          (column + 0.5 + ox) / MARKER_CELLS,
          (row + 0.5 + oy) / MARKER_CELLS,
        );
        sum += bilinear(light, point.x - 0.5, point.y - 0.5);
      }
      cells[row * MARKER_CELLS + column] = sum / SAMPLE_OFFSETS.length;
    }
  }
  return cells;
}

function isBorderCell(index: number): boolean {
  const row = Math.floor(index / MARKER_CELLS);
  const column = index % MARKER_CELLS;
  return row === 0 || column === 0 || row === MARKER_CELLS - 1 || column === MARKER_CELLS - 1;
}

/** Reads the marker inside `quad` (clockwise on screen) in each of its four rotations. */
function decodeMarker(light: Plane, quad: Quad): FoundMarker | null {
  const first = sampleCells(light, quad);
  if (!first) return null;
  const threshold = otsu(first);
  let darkSum = 0;
  let darkCount = 0;
  let lightSum = 0;
  let darkBorder = 0;
  for (let index = 0; index < first.length; index++) {
    const value = first[index]!;
    if (value < threshold) {
      darkSum += value;
      darkCount++;
      if (isBorderCell(index)) darkBorder++;
    } else {
      lightSum += value;
    }
  }
  const lightCount = first.length - darkCount;
  if (darkCount === 0 || lightCount === 0 || darkBorder < MIN_DARK_BORDER) return null;
  if (lightSum / lightCount - darkSum / darkCount < 0.15) return null;

  let best: FoundMarker | null = null;
  let bestErrors = MAX_BIT_ERRORS + 1;
  for (let turn = 0; turn < 4; turn++) {
    const corners: Quad = [
      quad[turn]!,
      quad[(turn + 1) % 4]!,
      quad[(turn + 2) % 4]!,
      quad[(turn + 3) % 4]!,
    ];
    const cells = turn === 0 ? first : sampleCells(light, corners);
    if (!cells) continue;
    const bits: boolean[] = [];
    for (let row = 1; row < MARKER_CELLS - 1; row++) {
      for (let column = 1; column < MARKER_CELLS - 1; column++) {
        bits.push(cells[row * MARKER_CELLS + column]! >= threshold);
      }
    }
    for (let id = 0; id < CODE_BITS.length; id++) {
      const code = CODE_BITS[id]!;
      let errors = 0;
      for (let i = 0; i < code.length && errors < bestErrors; i++) {
        if (code[i] !== bits[i]) errors++;
      }
      if (errors < bestErrors) {
        bestErrors = errors;
        best = { id, corners };
      }
    }
  }
  return best;
}

function findMarkers(light: Plane): FoundMarker[] {
  const { width, height } = light;
  const longSide = Math.max(width, height);
  // Dark relative to the neighbourhood, which copes with shadows across the sheet.
  const local = boxBlur(light, Math.max(4, Math.round(longSide / 16)));
  const dark = createMask(width, height);
  for (let p = 0; p < dark.data.length; p++) {
    dark.data[p] = light.data[p]! < local.data[p]! * 0.6 ? 1 : 0;
  }
  const { labels, components } = labelComponents(dark);
  const minSide = Math.max(12, longSide * 0.015);
  const maxSide = longSide * 0.3;
  const found: FoundMarker[] = [];
  for (const blob of components) {
    const blobWidth = blob.maxX - blob.minX + 1;
    const blobHeight = blob.maxY - blob.minY + 1;
    const long = Math.max(blobWidth, blobHeight);
    if (long < minSide || long > maxSide || Math.min(blobWidth, blobHeight) < minSide / 2) {
      continue;
    }
    if (blob.area < 0.2 * blobWidth * blobHeight) continue;
    const quad = blobCorners(labels, width, blob);
    const marker = quad && decodeMarker(light, quad);
    if (marker) found.push(marker);
  }
  return found;
}

function markerPoints(corner: number): Point[] {
  const { markers, markerSize: size } = TEMPLATE_LAYOUT;
  const { x, y } = markers[corner]!;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

/** Template millimetres → photo pixels, rejected when the markers disagree with the layout. */
function fitTemplate(found: readonly (readonly [number, FoundMarker])[]): Homography | null {
  const attempt = (subset: readonly (readonly [number, FoundMarker])[]): Homography | null => {
    const from = subset.flatMap(([corner]) => markerPoints(corner));
    const to = subset.flatMap(([, marker]) => marker.corners);
    const h = fitHomography(from, to);
    if (!h) return null;
    const side =
      subset.reduce((sum, [, marker]) => sum + Math.sqrt(quadArea(marker.corners)), 0) /
      subset.length;
    const tolerance = Math.max(1.5, side * 0.12);
    for (let k = 0; k < from.length; k++) {
      const point = project(h, from[k]!.x, from[k]!.y);
      if (Math.hypot(point.x - to[k]!.x, point.y - to[k]!.y) > tolerance) return null;
    }
    return h;
  };
  const all = attempt(found);
  if (all || found.length < 4) return all;
  for (let skip = 0; skip < found.length; skip++) {
    const h = attempt(found.filter((_, index) => index !== skip));
    if (h) return h;
  }
  return null;
}

/** Finds a printed template (at least 3 of its 4 corner markers) and its drawing area. */
export function detectTemplate(image: RgbaImage): TemplateDetection | null {
  const size = fitSize(image.width, image.height, DETECTION_SIDE);
  const full = luminance(image);
  const light: Plane = {
    width: size.width,
    height: size.height,
    data: shrinkChannels(full.data, image.width, image.height, 1, size.width, size.height),
  };

  const templates = new Map<number, Map<number, FoundMarker>>();
  for (const marker of findMarkers(light)) {
    const template = Math.floor(marker.id / 4);
    const corner = marker.id % 4;
    const corners = templates.get(template) ?? new Map<number, FoundMarker>();
    const known = corners.get(corner);
    if (!known || quadArea(marker.corners) > quadArea(known.corners)) corners.set(corner, marker);
    templates.set(template, corners);
  }
  let chosen: [number, Map<number, FoundMarker>] | null = null;
  for (const entry of templates) {
    if (entry[1].size >= 3 && (!chosen || entry[1].size > chosen[1].size)) chosen = entry;
  }
  if (!chosen) return null;
  const [template, corners] = chosen;
  const h = fitTemplate([...corners.entries()]);
  if (!h) return null;

  const { frame, frameMargin: margin } = TEMPLATE_LAYOUT;
  const left = frame.x + margin;
  const top = frame.y + margin;
  const right = frame.x + frame.width - margin;
  const bottom = frame.y + frame.height - margin;
  const scaleX = image.width / size.width;
  const scaleY = image.height / size.height;
  const toPhoto = (x: number, y: number): Point => {
    const point = project(h, x, y);
    return { x: point.x * scaleX, y: point.y * scaleY };
  };
  return {
    kind: TEMPLATE_KINDS[template]!,
    quad: [toPhoto(left, top), toPhoto(right, top), toPhoto(right, bottom), toPhoto(left, bottom)],
    markers: corners.size,
  };
}
