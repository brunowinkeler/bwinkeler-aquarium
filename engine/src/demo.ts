import type { CreatureKind } from '@bwinkeler-aquarium/shared';
import { createRandom, hashSeed } from './random.js';

const PALETTE = ['#ff8a3d', '#ffd23f', '#ff5d8f', '#7bd389', '#5ec2ff', '#b07cff'];
const INK = '#2b2d42';

export interface DemoSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

function outline(context: CanvasRenderingContext2D, fill: string): void {
  context.fillStyle = fill;
  context.fill();
  context.stroke();
}

/** Hand-drawn-looking stand-ins that swim while an aquarium has no drawings yet. */
export function createDemoSprite(kind: CreatureKind, seed: string): DemoSprite {
  const random = createRandom(hashSeed(seed));
  const color = PALETTE[Math.floor(random() * PALETTE.length)] ?? '#ff8a3d';
  const accent = PALETTE[Math.floor(random() * PALETTE.length)] ?? '#ffd23f';
  const width = kind === 'pulse' ? 180 : 256;
  const height = kind === 'pulse' ? 240 : kind === 'walk' ? 150 : 170;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { canvas, width, height };
  context.lineWidth = 6;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = INK;

  if (kind === 'pulse') {
    context.beginPath();
    context.moveTo(20, 110);
    context.bezierCurveTo(20, 10, 160, 10, 160, 110);
    context.closePath();
    outline(context, color);
    for (let i = 0; i < 5; i++) {
      const x = 36 + i * 27;
      context.beginPath();
      context.moveTo(x, 112);
      context.bezierCurveTo(x - 14, 150, x + 14, 180, x - 6, 228);
      context.stroke();
    }
  } else if (kind === 'walk') {
    for (let i = 0; i < 3; i++) {
      context.beginPath();
      context.moveTo(80 - i * 12, 100);
      context.lineTo(40 - i * 14, 138);
      context.moveTo(176 + i * 12, 100);
      context.lineTo(216 + i * 14, 138);
      context.stroke();
    }
    context.beginPath();
    context.ellipse(128, 92, 78, 46, 0, 0, 2 * Math.PI);
    outline(context, color);
    context.beginPath();
    context.arc(42, 44, 24, 0, 2 * Math.PI);
    outline(context, color);
    context.beginPath();
    context.arc(214, 44, 24, 0, 2 * Math.PI);
    outline(context, color);
    context.fillStyle = INK;
    context.beginPath();
    context.arc(108, 72, 7, 0, 2 * Math.PI);
    context.arc(148, 72, 7, 0, 2 * Math.PI);
    context.fill();
  } else if (kind === 'glide') {
    context.beginPath();
    context.ellipse(196, 82, 30, 22, 0, 0, 2 * Math.PI);
    outline(context, accent);
    for (const [x, y, dir] of [
      [150, 40, -1],
      [150, 124, 1],
      [70, 44, -1],
      [70, 120, 1],
    ] as const) {
      context.beginPath();
      context.ellipse(x, y + dir * 6, 26, 12, dir * 0.6, 0, 2 * Math.PI);
      outline(context, accent);
    }
    context.beginPath();
    context.ellipse(112, 84, 74, 50, 0, 0, 2 * Math.PI);
    outline(context, color);
    context.beginPath();
    context.moveTo(84, 50);
    context.lineTo(112, 118);
    context.lineTo(140, 50);
    context.stroke();
    context.fillStyle = INK;
    context.beginPath();
    context.arc(206, 74, 5, 0, 2 * Math.PI);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(60, 85);
    context.lineTo(14, 36);
    context.lineTo(14, 134);
    context.closePath();
    outline(context, accent);
    context.beginPath();
    context.ellipse(140, 85, 96, 58, 0, 0, 2 * Math.PI);
    outline(context, color);
    context.strokeStyle = accent;
    for (let i = 0; i < 3; i++) {
      context.beginPath();
      context.moveTo(110 + i * 28, 36);
      context.quadraticCurveTo(100 + i * 28, 85, 110 + i * 28, 134);
      context.stroke();
    }
    context.fillStyle = '#ffffff';
    context.strokeStyle = INK;
    context.beginPath();
    context.arc(196, 70, 14, 0, 2 * Math.PI);
    outline(context, '#ffffff');
    context.fillStyle = INK;
    context.beginPath();
    context.arc(200, 70, 6, 0, 2 * Math.PI);
    context.fill();
  }
  return { canvas, width, height };
}
