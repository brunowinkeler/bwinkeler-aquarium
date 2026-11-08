// Writes the PWA icons (pure Node, no image tools): node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `pixel(u, v)` returns [r, g, b]; 4×4 supersampling smooths the edges. */
function encodePng(size, pixel) {
  const samples = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = pixel((x + (sx + 0.5) / samples) / size, (y + (sy + 0.5) / samples) / size);
          for (let c = 0; c < 3; c++) sum[c] += color[c];
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[offset + c] = Math.round(sum[c] / (samples * samples));
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const INK = [43, 45, 66];
const ORANGE = [255, 138, 61];
const YELLOW = [255, 210, 63];

function sea(u, v) {
  const depth = v;
  return [Math.round(30 - depth * 20), Math.round(127 - depth * 60), Math.round(174 - depth * 80)];
}

/** Fish in a unit square scaled by `scale` around the center. */
function fish(scale) {
  return (u0, v0) => {
    const u = (u0 - 0.5) / scale + 0.5;
    const v = (v0 - 0.5) / scale + 0.5;
    const body = ((u - 0.56) / 0.3) ** 2 + ((v - 0.5) / 0.19) ** 2;
    const tailInside = u >= 0.12 && u <= 0.3 && Math.abs(v - 0.5) <= (0.3 - u) * 0.95;
    const eye = Math.hypot(u - 0.72, v - 0.45);
    if (eye <= 0.022) return INK;
    if (eye <= 0.05) return [255, 255, 255];
    if (body <= 0.84) return ORANGE;
    if (body <= 1.0) return INK;
    if (tailInside) {
      const edge = Math.min(u - 0.12, ((0.3 - u) * 0.95 - Math.abs(v - 0.5)) * 0.72);
      return edge < 0.022 ? INK : YELLOW;
    }
    const bubble = Math.hypot(u - 0.86, v - 0.22);
    if (bubble <= 0.045 && bubble >= 0.03) return [210, 240, 255];
    return sea(u0, v0);
  };
}

const target = new URL('../frontend/public/icons/', import.meta.url);
mkdirSync(target, { recursive: true });
writeFileSync(new URL('icon-192.png', target), encodePng(192, fish(1)));
writeFileSync(new URL('icon-512.png', target), encodePng(512, fish(1)));
writeFileSync(new URL('icon-maskable-512.png', target), encodePng(512, fish(0.72)));
writeFileSync(new URL('apple-touch-icon.png', target), encodePng(180, fish(0.86)));
