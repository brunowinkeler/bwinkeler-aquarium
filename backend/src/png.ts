const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = 0x49484452;
const IHDR_LENGTH = 13;

export interface PngInfo {
  width: number;
  height: number;
}

/** Checks only the signature and the IHDR chunk: decoding is too expensive for a Worker. */
export function readPngHeader(bytes: Uint8Array): PngInfo | null {
  if (bytes.byteLength < 8 + 8 + IHDR_LENGTH + 4) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== IHDR_LENGTH || view.getUint32(12) !== IHDR) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
