import { BLACK, mix, rgb, WHITE, type RGB } from './color.js';
import type { Random } from './random.js';

type Context = CanvasRenderingContext2D;
type Point = [number, number];

const TAU = Math.PI * 2;

/** A soft dark ellipse that sets an object on the sand. */
export function paintShadow(
  context: Context,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  alpha = 0.3,
): void {
  context.save();
  context.translate(x, y);
  context.scale(1, radiusY / radiusX);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  gradient.addColorStop(0, 'rgba(58, 40, 18, ' + alpha + ')');
  gradient.addColorStop(1, 'rgba(58, 40, 18, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, radiusX, 0, TAU);
  context.fill();
  context.restore();
}

/** A lumpy rock resting on `baseY`, lit from above; `rim` adds back light on its upper left. */
export function paintRock(
  context: Context,
  cx: number,
  baseY: number,
  width: number,
  height: number,
  color: RGB,
  random: Random,
  moss: boolean,
  rim: boolean,
): void {
  const phase = random() * TAU;
  const lump = 0.05 + random() * 0.05;
  const steps = 32;
  const top: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = Math.PI + (Math.PI * i) / steps;
    const wobble = 1 + lump * Math.sin(theta * 4 + phase) + 0.03 * Math.sin(theta * 13 + phase * 3);
    top.push([
      cx + Math.cos(theta) * (width / 2) * wobble,
      baseY + Math.sin(theta) * height * wobble,
    ]);
  }
  const first = top[0] ?? [cx - width / 2, baseY];
  const last = top[steps] ?? [cx + width / 2, baseY];
  const outline = (): void => {
    context.beginPath();
    context.moveTo(first[0], baseY);
    for (const p of top) context.lineTo(p[0], p[1]);
    context.lineTo(last[0], baseY);
    context.closePath();
  };
  outline();
  const gradient = context.createLinearGradient(0, baseY - height, 0, baseY);
  gradient.addColorStop(0, rgb(mix(color, WHITE, 0.16)));
  gradient.addColorStop(1, rgb(mix(color, BLACK, 0.4)));
  context.fillStyle = gradient;
  context.fill();

  context.save();
  outline();
  context.clip();
  const side = context.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
  side.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  side.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  side.addColorStop(1, 'rgba(0, 20, 30, 0.3)');
  context.fillStyle = side;
  context.fillRect(cx - width / 2 - 2, baseY - height * 1.2, width + 4, height * 1.2);
  context.strokeStyle = rgb(mix(color, BLACK, 0.5), 0.45);
  context.lineWidth = Math.max(1, height * 0.03);
  context.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    let px = cx + (random() - 0.5) * width * 0.5;
    let py = baseY - height * (0.75 + random() * 0.2);
    context.beginPath();
    context.moveTo(px, py);
    for (let j = 0; j < 4; j++) {
      px += (random() - 0.5) * width * 0.12;
      py += height * (0.12 + random() * 0.08);
      context.lineTo(px, py);
    }
    context.stroke();
  }
  context.fillStyle = rgb(mix(color, WHITE, 0.3), 0.35);
  for (let k = 0; k < 14; k++) {
    context.beginPath();
    context.arc(
      cx + (random() - 0.5) * width * 0.8,
      baseY - random() * height * 0.9,
      Math.max(1, height * 0.018),
      0,
      TAU,
    );
    context.fill();
  }
  context.restore();

  if (rim) {
    context.strokeStyle = 'rgba(170, 225, 245, 0.4)';
    context.lineWidth = Math.max(2, height * 0.025);
    context.beginPath();
    for (let i = 3; i <= steps * 0.55; i++) {
      const p = top[i];
      if (!p) continue;
      if (i === 3) context.moveTo(p[0], p[1]);
      else context.lineTo(p[0], p[1]);
    }
    context.stroke();
  }
  if (moss) {
    for (let k = 0; k < 4; k++) {
      const p = top[4 + Math.floor(random() * (steps - 8))] ?? first;
      const size = Math.min(height, 90) * (0.12 + random() * 0.1);
      for (let d = 0; d < 7; d++) {
        context.fillStyle = rgb(mix([70, 124, 56], [150, 196, 100], random()));
        context.beginPath();
        context.arc(
          p[0] + (random() - 0.5) * size * 2.2,
          p[1] + (random() - 0.3) * size * 0.7 + size * 0.3,
          size * (0.35 + random() * 0.35),
          0,
          TAU,
        );
        context.fill();
      }
    }
  }
}

interface Branch {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  width: number;
  tip: boolean;
}

/** Branching coral with round polyps; `shaded` adds a dark offset copy and highlights. */
export function paintBranchCoral(
  context: Context,
  x: number,
  baseY: number,
  height: number,
  color: RGB,
  random: Random,
  shaded: boolean,
): void {
  const branches: Branch[] = [];
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
    branches.push({
      x0,
      y0,
      cx: x0 + Math.cos(angle + 0.25) * length * 0.55,
      cy: y0 + Math.sin(angle + 0.25) * length * 0.55,
      x1,
      y1,
      width,
      tip: depth === 0,
    });
    if (depth === 0) return;
    const shrink = (): number => length * (0.68 + random() * 0.12);
    grow(x1, y1, angle - 0.35 - random() * 0.35, shrink(), width * 0.72, depth - 1);
    grow(x1, y1, angle + 0.35 + random() * 0.35, shrink(), width * 0.72, depth - 1);
  };
  grow(x, baseY, -Math.PI / 2 + (random() - 0.5) * 0.3, height * 0.32, height * 0.075, 3);
  const passes = shaded
    ? [
        { color: mix(color, BLACK, 0.32), dx: height * 0.012, dy: height * 0.006 },
        { color, dx: 0, dy: 0 },
      ]
    : [{ color, dx: 0, dy: 0 }];
  context.save();
  context.lineCap = 'round';
  for (const pass of passes) {
    context.strokeStyle = rgb(pass.color);
    context.fillStyle = rgb(pass.color);
    for (const b of branches) {
      context.lineWidth = b.width;
      context.beginPath();
      context.moveTo(b.x0 + pass.dx, b.y0 + pass.dy);
      context.quadraticCurveTo(b.cx + pass.dx, b.cy + pass.dy, b.x1 + pass.dx, b.y1 + pass.dy);
      context.stroke();
      if (b.tip) {
        context.beginPath();
        context.arc(b.x1 + pass.dx, b.y1 + pass.dy, b.width * 0.75, 0, TAU);
        context.fill();
      }
    }
  }
  if (shaded) {
    context.fillStyle = rgb(mix(color, WHITE, 0.45));
    for (const b of branches) {
      if (!b.tip) continue;
      context.beginPath();
      context.arc(b.x1 - b.width * 0.2, b.y1 - b.width * 0.2, b.width * 0.28, 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

/** A sea fan: radial veins joined by a light mesh. */
export function paintFanCoral(
  context: Context,
  x: number,
  baseY: number,
  radius: number,
  color: RGB,
  shaded: boolean,
): void {
  const passes = shaded
    ? [
        { color: mix(color, BLACK, 0.35), dx: radius * 0.03 },
        { color, dx: 0 },
      ]
    : [{ color, dx: 0 }];
  context.save();
  context.lineCap = 'round';
  for (const pass of passes) {
    const left = x + pass.dx;
    context.strokeStyle = rgb(pass.color);
    context.globalAlpha = 1;
    context.lineWidth = Math.max(1, radius * 0.03);
    for (let i = 0; i <= 10; i++) {
      const angle = -Math.PI * (0.12 + (0.76 * i) / 10);
      const reach = radius * (0.82 + 0.18 * Math.sin(i * 1.7));
      context.beginPath();
      context.moveTo(left, baseY);
      context.quadraticCurveTo(
        left + Math.cos(angle) * reach * 0.45,
        baseY + Math.sin(angle) * reach * 0.6,
        left + Math.cos(angle) * reach,
        baseY + Math.sin(angle) * reach,
      );
      context.stroke();
    }
    context.globalAlpha = 0.5;
    context.lineWidth = Math.max(1, radius * 0.014);
    for (let k = 1; k <= 4; k++) {
      context.beginPath();
      context.arc(left, baseY, (radius * k) / 4.6, Math.PI * 1.14, Math.PI * 1.86);
      context.stroke();
    }
  }
  context.restore();
}

/** A low dome with meandering grooves. */
export function paintBrainCoral(
  context: Context,
  x: number,
  baseY: number,
  radius: number,
  color: RGB,
): void {
  context.save();
  const gradient = context.createRadialGradient(
    x - radius * 0.3,
    baseY - radius * 0.55,
    radius * 0.1,
    x,
    baseY - radius * 0.2,
    radius * 1.1,
  );
  gradient.addColorStop(0, rgb(mix(color, WHITE, 0.3)));
  gradient.addColorStop(1, rgb(mix(color, BLACK, 0.25)));
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(x, baseY, radius, radius * 0.72, 0, Math.PI, TAU);
  context.closePath();
  context.fill();
  context.strokeStyle = rgb(mix(color, BLACK, 0.45), 0.35);
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

/** Tube sponges with dark openings, lit from the left. */
export function paintTubes(
  context: Context,
  x: number,
  baseY: number,
  height: number,
  color: RGB,
  random: Random,
): void {
  context.save();
  context.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const tx = x + (i - 2) * height * 0.13;
    const tall = height * (0.45 + random() * 0.55);
    const lean = (i - 2) * height * 0.04;
    const width = height * (0.1 + random() * 0.04);
    const gradient = context.createLinearGradient(tx - width, 0, tx + width, 0);
    gradient.addColorStop(0, rgb(mix(color, WHITE, 0.25)));
    gradient.addColorStop(1, rgb(mix(color, BLACK, 0.3)));
    context.strokeStyle = gradient;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(tx, baseY);
    context.lineTo(tx + lean, baseY - tall);
    context.stroke();
    context.fillStyle = 'rgba(20, 40, 50, 0.6)';
    context.beginPath();
    context.ellipse(tx + lean, baseY - tall, width * 0.32, width * 0.16, 0, 0, TAU);
    context.fill();
  }
  context.restore();
}

/** A starfish lying on the sand, seen at an angle. */
export function paintStarfish(
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
    const angle = -Math.PI / 2 + (arm * TAU) / 5;
    for (let dot = 1; dot <= 2; dot++) {
      context.beginPath();
      context.arc(
        Math.cos(angle) * radius * dot * 0.32,
        Math.sin(angle) * radius * dot * 0.32,
        radius * 0.07,
        0,
        TAU,
      );
      context.fill();
    }
  }
  context.restore();
}

/** A scallop shell with ridges. */
export function paintShell(
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
