import { createRandom, type Random } from './random.js';
import type { Bubble } from './world.js';

export const SAND_LINE = 0.86;

type Context = CanvasRenderingContext2D;

/** A cluster of rounded rocks resting on `baseY`, with a soft highlight on each. */
function paintRocks(
  context: Context,
  x: number,
  baseY: number,
  size: number,
  random: Random,
): void {
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const width = size * (0.55 + random() * 0.6);
    const height = width * (0.45 + random() * 0.3);
    const cx = x + (i - (count - 1) / 2) * size * 0.5 + (random() - 0.5) * size * 0.2;
    const light = 70 + Math.floor(random() * 30);
    context.fillStyle = 'rgb(' + (light - 8) + ', ' + (light + 6) + ', ' + (light + 14) + ')';
    context.beginPath();
    context.ellipse(cx, baseY, width / 2, height, 0, Math.PI, 2 * Math.PI);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.13)';
    context.beginPath();
    context.ellipse(
      cx - width * 0.12,
      baseY - height * 0.62,
      width * 0.2,
      height * 0.16,
      -0.3,
      0,
      2 * Math.PI,
    );
    context.fill();
  }
}

/** Branching coral with round polyps at the tips. */
function paintBranchCoral(
  context: Context,
  x: number,
  baseY: number,
  height: number,
  color: string,
  random: Random,
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = 'round';
  const grow = (
    x0: number,
    y0: number,
    angle: number,
    length: number,
    width: number,
    depth: number,
  ): void => {
    const x1 = x0 + Math.cos(angle) * length;
    const y1 = y0 + Math.sin(angle) * length;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x0, y0);
    context.quadraticCurveTo(
      x0 + Math.cos(angle + 0.25) * length * 0.55,
      y0 + Math.sin(angle + 0.25) * length * 0.55,
      x1,
      y1,
    );
    context.stroke();
    if (depth === 0) {
      context.beginPath();
      context.arc(x1, y1, width * 0.75, 0, 2 * Math.PI);
      context.fill();
      return;
    }
    grow(
      x1,
      y1,
      angle - 0.35 - random() * 0.35,
      length * (0.68 + random() * 0.12),
      width * 0.72,
      depth - 1,
    );
    grow(
      x1,
      y1,
      angle + 0.35 + random() * 0.35,
      length * (0.68 + random() * 0.12),
      width * 0.72,
      depth - 1,
    );
  };
  grow(x, baseY, -Math.PI / 2 + (random() - 0.5) * 0.3, height * 0.32, height * 0.075, 3);
  context.restore();
}

/** A sea fan: radial veins joined by a light mesh. */
function paintFanCoral(
  context: Context,
  x: number,
  baseY: number,
  radius: number,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineWidth = Math.max(1, radius * 0.03);
  for (let i = 0; i <= 10; i++) {
    const angle = -Math.PI * (0.12 + (0.76 * i) / 10);
    const reach = radius * (0.82 + 0.18 * Math.sin(i * 1.7));
    context.beginPath();
    context.moveTo(x, baseY);
    context.quadraticCurveTo(
      x + Math.cos(angle) * reach * 0.45,
      baseY + Math.sin(angle) * reach * 0.6,
      x + Math.cos(angle) * reach,
      baseY + Math.sin(angle) * reach,
    );
    context.stroke();
  }
  context.globalAlpha = 0.5;
  context.lineWidth = Math.max(1, radius * 0.014);
  for (let k = 1; k <= 4; k++) {
    context.beginPath();
    context.arc(x, baseY, (radius * k) / 4.6, Math.PI * 1.14, Math.PI * 1.86);
    context.stroke();
  }
  context.restore();
}

/** A low dome with meandering grooves. */
function paintBrainCoral(
  context: Context,
  x: number,
  baseY: number,
  radius: number,
  color: string,
): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, baseY, radius, radius * 0.72, 0, Math.PI, 2 * Math.PI);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(60, 20, 30, 0.22)';
  context.lineWidth = Math.max(1, radius * 0.06);
  for (let ring = 1; ring <= 3; ring++) {
    const rx = radius * (1 - ring * 0.24);
    const ry = radius * 0.72 * (1 - ring * 0.24);
    context.beginPath();
    for (let t = 0; t <= 18; t++) {
      const angle = Math.PI + (Math.PI * t) / 18;
      const wobble = 1 + 0.08 * Math.sin(t * 2.2 + ring);
      const px = x + Math.cos(angle) * rx * wobble;
      const py = baseY + Math.sin(angle) * ry * wobble;
      if (t === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }
  context.restore();
}

/** Tube sponges with dark openings. */
function paintTubes(
  context: Context,
  x: number,
  baseY: number,
  height: number,
  color: string,
  random: Random,
): void {
  context.save();
  context.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const tx = x + (i - 2) * height * 0.13;
    const tall = height * (0.45 + random() * 0.55);
    const lean = (i - 2) * height * 0.04;
    const width = height * (0.1 + random() * 0.04);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(tx, baseY);
    context.lineTo(tx + lean, baseY - tall);
    context.stroke();
    context.fillStyle = 'rgba(20, 40, 50, 0.55)';
    context.beginPath();
    context.ellipse(tx + lean, baseY - tall, width * 0.32, width * 0.16, 0, 0, 2 * Math.PI);
    context.fill();
  }
  context.restore();
}

/** A starfish lying on the sand, seen at an angle. */
function paintStarfish(
  context: Context,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.scale(1, 0.55);
  context.rotate(rotation);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineJoin = 'round';
  context.lineWidth = radius * 0.3;
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const reach = i % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) context.moveTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    else context.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  context.closePath();
  context.stroke();
  context.fill();
  context.fillStyle = 'rgba(255, 240, 220, 0.45)';
  for (let arm = 0; arm < 5; arm++) {
    const angle = -Math.PI / 2 + (arm * 2 * Math.PI) / 5;
    for (let dot = 1; dot <= 2; dot++) {
      context.beginPath();
      context.arc(
        Math.cos(angle) * radius * dot * 0.32,
        Math.sin(angle) * radius * dot * 0.32,
        radius * 0.07,
        0,
        2 * Math.PI,
      );
      context.fill();
    }
  }
  context.restore();
}

/** A scallop shell with ridges. */
function paintShell(
  context: Context,
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(1, 0.8);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, size, Math.PI * 1.12, Math.PI * 1.88);
  context.closePath();
  context.fill();
  context.strokeStyle = 'rgba(130, 80, 40, 0.4)';
  context.lineWidth = Math.max(1, size * 0.07);
  for (let i = 0; i <= 5; i++) {
    const angle = Math.PI * (1.17 + (0.66 * i) / 5);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * size * 0.95, Math.sin(angle) * size * 0.95);
    context.stroke();
  }
  context.fillStyle = color;
  context.fillRect(-size * 0.2, -size * 0.06, size * 0.4, size * 0.16);
  context.restore();
}

/** Corals, rocks, shells and starfish; drawn once into the cached backdrop. */
function paintSeabed(context: Context, width: number, height: number, sandTop: number): void {
  const random = createRandom(31);
  const base = sandTop + height * 0.012;
  paintRocks(context, width * 0.07, base, height * 0.1, random);
  paintBranchCoral(context, width * 0.17, base, height * 0.22, '#f38ba0', random);
  paintFanCoral(context, width * 0.3, base, height * 0.14, '#b48ee8');
  paintBrainCoral(context, width * 0.41, base, height * 0.045, '#f5a65b');
  paintRocks(context, width * 0.55, base, height * 0.07, random);
  paintTubes(context, width * 0.64, base, height * 0.11, '#5fc9b8', random);
  paintBranchCoral(context, width * 0.76, base, height * 0.18, '#f5a65b', random);
  paintBrainCoral(context, width * 0.86, base, height * 0.035, '#f7d070');
  paintRocks(context, width * 0.95, base, height * 0.11, random);

  const starColors = ['#ff6b4a', '#f7b267', '#e85d75'];
  const stars = [0.24, 0.6, 0.9];
  for (let i = 0; i < stars.length; i++) {
    paintStarfish(
      context,
      width * (stars[i] as number),
      height * (0.93 + random() * 0.04),
      height * (0.024 + random() * 0.01),
      random() * Math.PI,
      starColors[i % starColors.length] as string,
    );
  }
  const shells = [0.12, 0.37, 0.5, 0.71, 0.82];
  for (let i = 0; i < shells.length; i++) {
    paintShell(
      context,
      width * (shells[i] as number),
      height * (0.92 + random() * 0.06),
      height * (0.017 + random() * 0.008),
      (random() - 0.5) * 0.8,
      i % 2 === 0 ? '#f4e1c1' : '#f2c6b4',
    );
  }
}

/** The static part of the scene: water, distant rocks, sand and the seabed decor. */
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
  const far = createRandom(19);
  const haze = 'rgba(24, 92, 122, 0.6)';
  paintBranchCoral(context, width * 0.22, sandTop + height * 0.02, height * 0.2, haze, far);
  paintFanCoral(context, width * 0.5, sandTop + height * 0.02, height * 0.12, haze);
  paintBranchCoral(context, width * 0.83, sandTop + height * 0.02, height * 0.16, haze, far);

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
  paintSeabed(context, width, height, sandTop);
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
