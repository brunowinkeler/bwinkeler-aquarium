import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, rgb: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const color = rgb(x, y);
      raw.set(color, y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type Point = { x: number; y: number };

function insideQuad(points: readonly Point[], x: number, y: number): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

/** A phone photo of an orange fish drawn on a white sheet lying on a table. */
export function drawingPhoto(): Buffer {
  const width = 900;
  const height = 675;
  const sheet: Point[] = [
    { x: 140, y: 110 },
    { x: 780, y: 140 },
    { x: 760, y: 590 },
    { x: 110, y: 560 },
  ];
  let seed = 7;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  return encodePng(width, height, (x, y) => {
    let color = [112, 92, 76];
    if (insideQuad(sheet, x, y)) {
      color = [246, 244, 238];
      const body = Math.hypot((x - 480) / 150, (y - 350) / 90);
      const tail = x > 270 && x < 345 && Math.abs(y - 350) < (345 - x) * 0.9;
      if (Math.hypot(x - 570, y - 330) < 12) color = [40, 40, 52];
      else if (body <= 0.94) color = [255, 138, 61];
      else if (body <= 1.0) color = [40, 40, 52];
      else if (tail)
        color = x < 280 || (345 - x) * 0.9 - Math.abs(y - 350) < 6 ? [40, 40, 52] : [255, 210, 63];
    }
    const light = 0.82 + 0.18 * (1 - x / width);
    return color.map((value) =>
      Math.max(0, Math.min(255, Math.round(value * light + noise() * 6))),
    );
  });
}

/**
 * A photo of the served template at `url` with an orange crab drawn in its frame, taken
 * upside down and slightly turned. Rendered in the page, so it uses the real SVG.
 */
export async function templatePhoto(page: Page, url: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(112, 92, 76)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // From here on the units are template millimetres.
    context.translate(600, 450);
    context.rotate(Math.PI + 0.1);
    context.scale(1000 / 297, 1000 / 297);
    context.translate(-297 / 2, -210 / 2);
    context.drawImage(image, 0, 0, 297, 210);
    context.fillStyle = 'rgb(255, 138, 61)';
    context.strokeStyle = 'rgb(40, 40, 52)';
    context.lineWidth = 1.2;
    context.beginPath();
    context.ellipse(148, 105, 45, 28, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    return canvas.toDataURL('image/png');
  }, url);
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

export interface TvStatus {
  screen: string;
  aquariumId: string | null;
  connection: string;
  phoneCount: number;
  panelOpen: boolean;
  joinCode: string | null;
  creatures: string[];
  pointer: boolean;
  sound: 'off' | 'waiting' | 'playing' | 'unavailable';
}

export function tvStatus(page: Page): Promise<TvStatus> {
  return page.evaluate(() =>
    (window as unknown as { aquariumTv: { getStatus(): TvStatus } }).aquariumTv.getStatus(),
  );
}
