/** A canvas with `scale` device pixels per CSS pixel, painted in CSS pixels. */
export function paintSurface(
  width: number,
  height: number,
  scale: number,
  paint: (context: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (context) {
    context.scale(scale, scale);
    paint(context);
  }
  return canvas;
}
