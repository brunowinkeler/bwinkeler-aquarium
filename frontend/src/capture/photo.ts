const MAX_PHOTO_SIDE = 2048;

export interface DecodedPhoto {
  /** Downscaled photo for display and corner editing. */
  canvas: HTMLCanvasElement;
  pixels: ImageData;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Decodes a camera or gallery photo (EXIF orientation applied) and caps its size. */
export async function decodePhoto(file: Blob): Promise<DecodedPhoto> {
  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is not available');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
}

export function imageToCanvas(image: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context) {
    context.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    );
  }
  return canvas;
}

export function rotateCanvas(source: HTMLCanvasElement, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return source;
  const canvas = document.createElement('canvas');
  canvas.width = turns % 2 === 0 ? source.width : source.height;
  canvas.height = turns % 2 === 0 ? source.height : source.width;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}
