import type { Bubble } from './world.js';

export const SAND_LINE = 0.86;

export function paintRays(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
): void {
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const center = (0.1 + i * 0.2) * width + Math.sin(time * 0.15 + i * 1.7) * width * 0.03;
    const top = width * 0.02;
    const bottom = width * 0.07;
    const drift = width * 0.06;
    const alpha = 0.045 + 0.02 * Math.sin(time * 0.4 + i);
    context.fillStyle = 'rgba(190, 235, 255, ' + alpha.toFixed(3) + ')';
    context.beginPath();
    context.moveTo(center - top, 0);
    context.lineTo(center + top, 0);
    context.lineTo(center + bottom + drift, height * SAND_LINE);
    context.lineTo(center - bottom + drift, height * SAND_LINE);
    context.closePath();
    context.fill();
  }
  context.restore();
}

export function paintBubbles(context: CanvasRenderingContext2D, bubbles: readonly Bubble[]): void {
  context.save();
  context.strokeStyle = 'rgba(225, 246, 255, 0.65)';
  context.fillStyle = 'rgba(225, 246, 255, 0.18)';
  context.lineWidth = 1.2;
  for (const bubble of bubbles) {
    context.beginPath();
    context.arc(bubble.x, bubble.y, bubble.radius, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
  }
  context.restore();
}
