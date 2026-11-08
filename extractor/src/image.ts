export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One float channel, usually in [0, 1]. */
export interface Plane {
  width: number;
  height: number;
  data: Float32Array;
}

/** Binary image: 1 = set. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createRgba(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function createPlane(width: number, height: number): Plane {
  return { width, height, data: new Float32Array(width * height) };
}

export function createMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

export function luminance(image: RgbaImage): Plane {
  const plane = createPlane(image.width, image.height);
  const { data } = image;
  for (let i = 0, p = 0; p < plane.data.length; i += 4, p++) {
    plane.data[p] = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
  }
  return plane;
}

/** Area-average shrink of interleaved float channels along one axis. */
function shrinkAxis(
  source: Float32Array,
  width: number,
  height: number,
  channels: number,
  outWidth: number,
  horizontal: boolean,
): Float32Array {
  const inLength = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const out = new Float32Array((horizontal ? outWidth * height : width * outWidth) * channels);
  const scale = inLength / outWidth;
  const sums = new Float64Array(channels);
  for (let line = 0; line < lines; line++) {
    for (let o = 0; o < outWidth; o++) {
      const start = o * scale;
      const end = start + scale;
      sums.fill(0);
      let total = 0;
      for (let s = Math.floor(start); s < Math.ceil(end) && s < inLength; s++) {
        const weight = Math.min(end, s + 1) - Math.max(start, s);
        if (weight <= 0) continue;
        const index = (horizontal ? line * width + s : s * width + line) * channels;
        for (let c = 0; c < channels; c++) sums[c]! += source[index + c]! * weight;
        total += weight;
      }
      const target = (horizontal ? line * outWidth + o : o * width + line) * channels;
      for (let c = 0; c < channels; c++) out[target + c] = total > 0 ? sums[c]! / total : 0;
    }
  }
  return out;
}

/** Area-average resampling for shrinking (never enlarges). */
export function shrinkChannels(
  source: Float32Array,
  width: number,
  height: number,
  channels: number,
  outWidth: number,
  outHeight: number,
): Float32Array {
  const horizontal =
    outWidth < width ? shrinkAxis(source, width, height, channels, outWidth, true) : source;
  const w = outWidth < width ? outWidth : width;
  return outHeight < height
    ? shrinkAxis(horizontal, w, height, channels, outHeight, false)
    : horizontal;
}

export function shrinkRgba(image: RgbaImage, outWidth: number, outHeight: number): RgbaImage {
  if (outWidth >= image.width && outHeight >= image.height) return image;
  const floats = Float32Array.from(image.data);
  const result = shrinkChannels(floats, image.width, image.height, 4, outWidth, outHeight);
  const out = createRgba(outWidth, outHeight);
  out.data.set(result);
  return out;
}

/** Fits an image inside `maxSide` while keeping its aspect ratio. */
export function fitSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function bilinear(plane: Plane, x: number, y: number): number {
  const { width, height, data } = plane;
  const fx = Math.min(Math.max(x, 0), width - 1);
  const fy = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = data[y0 * width + x0]! * (1 - tx) + data[y0 * width + x1]! * tx;
  const bottom = data[y1 * width + x0]! * (1 - tx) + data[y1 * width + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Separable box blur with clamped edges. */
export function boxBlur(plane: Plane, radius: number): Plane {
  if (radius < 1) return plane;
  const { width, height } = plane;
  const temp = new Float32Array(width * height);
  const out = createPlane(width, height);
  const size = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++)
      sum += plane.data[row + Math.min(Math.max(k, 0), width - 1)]!;
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum / size;
      sum += plane.data[row + Math.min(x + radius + 1, width - 1)]!;
      sum -= plane.data[row + Math.max(x - radius, 0)]!;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++)
      sum += temp[Math.min(Math.max(k, 0), height - 1) * width + x]!;
    for (let y = 0; y < height; y++) {
      out.data[y * width + x] = sum / size;
      sum += temp[Math.min(y + radius + 1, height - 1) * width + x]!;
      sum -= temp[Math.max(y - radius, 0) * width + x]!;
    }
  }
  return out;
}

function morph(mask: Mask, radius: number, dilate: boolean): Mask {
  if (radius < 1) return mask;
  const { width, height } = mask;
  const pass = (source: Uint8Array, horizontal: boolean): Uint8Array => {
    const out = new Uint8Array(width * height);
    const length = horizontal ? width : height;
    const lines = horizontal ? height : width;
    const prefix = new Int32Array(length + 1);
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < length; i++) {
        prefix[i + 1] = prefix[i]! + source[horizontal ? line * width + i : i * width + line]!;
      }
      for (let i = 0; i < length; i++) {
        const lo = Math.max(0, i - radius);
        const hi = Math.min(length, i + radius + 1);
        const count = prefix[hi]! - prefix[lo]!;
        // Erosion treats pixels past the edge as set, so shapes touching the border survive.
        const value = dilate ? count > 0 : count === hi - lo;
        out[horizontal ? line * width + i : i * width + line] = value ? 1 : 0;
      }
    }
    return out;
  };
  return { width, height, data: pass(pass(mask.data, true), false) };
}

export function dilate(mask: Mask, radius: number): Mask {
  return morph(mask, radius, true);
}

export function erode(mask: Mask, radius: number): Mask {
  return morph(mask, radius, false);
}

/** Marks every passable pixel 4-connected to the image border. */
export function floodFromBorder(passable: Mask): Mask {
  const { width, height } = passable;
  const reached = createMask(width, height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (index: number): void => {
    if (passable.data[index] === 1 && reached.data[index] === 0) {
      reached.data[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < (height - 1) * width) visit(index + width);
  }
  return reached;
}

export interface Component {
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 8-connected components; label 0 is the unset background. */
export function labelComponents(mask: Mask): { labels: Int32Array; components: Component[] } {
  const { width, height } = mask;
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Component[] = [];
  for (let start = 0; start < mask.data.length; start++) {
    if (mask.data[start] !== 1 || labels[start] !== 0) continue;
    const label = components.length + 1;
    const component: Component = {
      label,
      area: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
    };
    let head = 0;
    let tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = (index - x) / width;
      component.area++;
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue;
          const next = ny * width + nx;
          if (mask.data[next] === 1 && labels[next] === 0) {
            labels[next] = label;
            queue[tail++] = next;
          }
        }
      }
    }
    components.push(component);
  }
  return { labels, components };
}

/** Otsu's threshold for values in [0, 1]. */
export function otsu(values: ArrayLike<number>, bins = 256): number {
  const histogram = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(values[i]! * bins)));
    histogram[bin]!++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * histogram[i]!;
  let weightBelow = 0;
  let sumBelow = 0;
  let best = 0;
  let threshold = 0;
  for (let i = 0; i < bins; i++) {
    weightBelow += histogram[i]!;
    if (weightBelow === 0) continue;
    const weightAbove = total - weightBelow;
    if (weightAbove === 0) break;
    sumBelow += i * histogram[i]!;
    const meanBelow = sumBelow / weightBelow;
    const meanAbove = (sumAll - sumBelow) / weightAbove;
    const between = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return (threshold + 1) / bins;
}
