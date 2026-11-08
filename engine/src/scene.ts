import { createRandom } from './random.js';
import type { Bubble } from './world.js';

export const SAND_LINE = 0.86;

/** The static part of the scene: water, distant rocks and sand. */
export function paintBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const water = context.createLinearGradient(0, 0, 0, height);
  water.addColorStop(0, '#2b93bb');
  water.addColorStop(0.55, '#115c82');
  water.addColorStop(1, '#0a3552');
  context.fillStyle = water;
  context.fillRect(0, 0, width, height);

  const random = createRandom(7);
  const sandTop = height * SAND_LINE;
  context.fillStyle = 'rgba(8, 42, 62, 0.5)';
  for (let i = 0; i < 6; i++) {
    context.beginPath();
    context.ellipse(
      random() * width,
      sandTop + height * 0.01,
      width * (0.05 + random() * 0.09),
      height * (0.04 + random() * 0.05),
      0,
      Math.PI,
      2 * Math.PI,
    );
    context.fill();
  }

  context.beginPath();
  context.moveTo(0, height);
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    context.lineTo(x, sandTop + Math.sin((i / steps) * Math.PI * 3) * height * 0.012);
  }
  context.lineTo(width, height);
  context.closePath();
  const sand = context.createLinearGradient(0, sandTop, 0, height);
  sand.addColorStop(0, '#d9c48f');
  sand.addColorStop(1, '#ad8e5e');
  context.fillStyle = sand;
  context.fill();

  context.fillStyle = 'rgba(120, 92, 52, 0.35)';
  const dot = Math.max(1, height / 540);
  for (let i = 0; i < 180; i++) {
    context.fillRect(
      random() * width,
      sandTop + height * 0.015 + random() * (height - sandTop),
      dot,
      dot,
    );
  }
  context.fillStyle = 'rgba(90, 80, 70, 0.6)';
  for (let i = 0; i < 9; i++) {
    context.beginPath();
    context.ellipse(
      random() * width,
      sandTop + height * (0.04 + random() * 0.08),
      height * (0.008 + random() * 0.012),
      height * (0.005 + random() * 0.007),
      0,
      0,
      2 * Math.PI,
    );
    context.fill();
  }
}

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

export function paintSeaweed(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
): void {
  const base = height * (SAND_LINE + 0.03);
  context.save();
  context.lineCap = 'round';
  context.lineWidth = Math.max(3, height * 0.009);
  for (let i = 0; i < 7; i++) {
    const x = ((i * 0.137 + 0.06) % 1) * width;
    const tall = height * (0.16 + (i % 3) * 0.06);
    const sway = Math.sin(time * 0.8 + i * 1.3) * height * 0.02;
    context.strokeStyle = i % 2 === 0 ? '#2f7f50' : '#3f9864';
    context.beginPath();
    context.moveTo(x, base);
    context.quadraticCurveTo(x + sway * 2, base - tall * 0.55, x + sway * 3, base - tall);
    context.stroke();
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
