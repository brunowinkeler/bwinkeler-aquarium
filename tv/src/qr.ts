import qrcode from 'qrcode-generator';

/** Draws a QR code for `text` with a quiet zone, about `target` pixels wide. */
export function drawQr(canvas: HTMLCanvasElement, text: string, target = 240): void {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 2;
  const cells = modules + quiet * 2;
  const scale = Math.max(1, Math.floor(target / cells));
  const size = cells * scale;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#0f2a3d';
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      if (qr.isDark(row, column)) {
        context.fillRect((column + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
  }
}
