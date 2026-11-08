// Writes the spike's launcher icons (webOS requires 80x80 and 130x130 PNGs).
import { writeFileSync } from 'node:fs';
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

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      raw.set([r, g, b, 255], y * (size * 4 + 1) + 1 + x * 4);
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
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fish(u, v) {
  const body = ((u - 0.56) / 0.3) ** 2 + ((v - 0.5) / 0.2) ** 2 <= 1;
  const tail = u >= 0.12 && u <= 0.32 && Math.abs(v - 0.5) <= (0.32 - u) * 1.1;
  const eye = (u - 0.74) ** 2 + (v - 0.45) ** 2 <= 0.03 ** 2;
  if (eye) return [17, 17, 17];
  if (body || tail) return [255, 159, 67];
  return [6 + Math.round(v * 30), 40 + Math.round(v * 40), 61 + Math.round(v * 50)];
}

const target = new URL('../spikes/tv-spike/', import.meta.url);
writeFileSync(new URL('icon.png', target), encodePng(80, fish));
writeFileSync(new URL('largeIcon.png', target), encodePng(130, fish));
