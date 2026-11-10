import { mix, rgb } from './color.js';
import {
  paintBranchCoral,
  paintBrainCoral,
  paintFanCoral,
  paintRock,
  paintShadow,
  paintShell,
  paintStarfish,
  paintTubes,
} from './decor.js';
import {
  DEEP,
  drawPlant,
  GREEN,
  HAZE,
  kelp,
  LIME,
  OLIVE,
  plant,
  seaGrass,
  seaLettuce,
  TEAL,
  type Plant,
  type PlantSprite,
} from './plants.js';
import { createRandom, type Random } from './random.js';
import { paintRays, SAND_LINE } from './scene.js';
import { paintSurface } from './surface.js';

type Context = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

/** Gentle dunes around the sand line, in CSS pixels. */
export function sandLine(width: number, height: number): (x: number) => number {
  const top = height * SAND_LINE;
  return (x) =>
    top +
    height *
      (0.011 * Math.sin((x / width) * Math.PI * 3 + 0.4) +
        0.015 * Math.sin((x / width) * Math.PI * 1.35 + 2.3));
}

function paintWater(context: Context, width: number, height: number): void {
  const water = context.createLinearGradient(0, 0, 0, height);
  water.addColorStop(0, '#2b93bb');
  water.addColorStop(0.55, '#115c82');
  water.addColorStop(1, '#0a3552');
  context.fillStyle = water;
  context.fillRect(0, 0, width, height);
  const x = width * 0.42;
  const y = -height * 0.4;
  const glow = context.createRadialGradient(x, y, 0, x, y, height * 1.35);
  glow.addColorStop(0, 'rgba(205, 245, 255, 0.4)');
  glow.addColorStop(1, 'rgba(205, 245, 255, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

/** Two hazy reef silhouettes on the horizon. */
function paintFarReef(
  context: Context,
  width: number,
  height: number,
  sandY: (x: number) => number,
  random: Random,
): void {
  const layers: { color: string; rise: number; waves: [number, number][] }[] = [
    {
      color: 'rgba(16, 74, 108, 0.6)',
      rise: 0.13,
      waves: [
        [1.2, 0.04],
        [3.1, 0.022],
        [8.3, 0.009],
        [17, 0.004],
      ],
    },
    {
      color: 'rgba(11, 58, 88, 0.65)',
      rise: 0.07,
      waves: [
        [1.9, 0.03],
        [4.7, 0.016],
        [11, 0.007],
        [23, 0.003],
      ],
    },
  ];
  const steps = 120;
  for (const layer of layers) {
    const waves = layer.waves.map(([frequency, amplitude]) => ({
      frequency,
      amplitude,
      phase: random() * TAU,
    }));
    context.fillStyle = layer.color;
    context.beginPath();
    context.moveTo(0, height);
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      let rise = layer.rise;
      for (const wave of waves) {
        rise += wave.amplitude * Math.sin((x / width) * wave.frequency * TAU + wave.phase);
      }
      context.lineTo(x, sandY(x) - height * rise);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fill();
  }
}

/** Dunes with ripple marks, grains and pebbles. */
function paintSand(
  context: Context,
  width: number,
  height: number,
  sandY: (x: number) => number,
  random: Random,
): void {
  const steps = 64;
  const outline = (): void => {
    context.beginPath();
    context.moveTo(0, height);
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      context.lineTo(x, sandY(x));
    }
    context.lineTo(width, height);
    context.closePath();
  };
  outline();
  const gradient = context.createLinearGradient(0, height * (SAND_LINE - 0.03), 0, height);
  gradient.addColorStop(0, '#e8d6a2');
  gradient.addColorStop(0.3, '#d6be88');
  gradient.addColorStop(1, '#a5875a');
  context.fillStyle = gradient;
  context.fill();

  context.save();
  outline();
  context.clip();
  context.lineCap = 'round';
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    // Ripples get wider and further apart toward the viewer.
    const depth = (r + 0.6) / rows;
    const amplitude = height * (0.0015 + depth * 0.0035);
    const wavelength = width * (0.035 + depth * 0.045);
    const thickness = Math.max(1, height * (0.0012 + depth * 0.0026));
    let x = -random() * width * 0.1;
    while (x < width) {
      const length = width * (0.06 + random() * 0.16);
      const phase = random() * TAU;
      const strokes: [string, number][] = [
        ['rgba(255, 246, 214, 0.28)', 0],
        ['rgba(122, 92, 52, 0.2)', thickness * 1.6],
      ];
      for (const [style, shift] of strokes) {
        context.strokeStyle = style;
        context.lineWidth = thickness;
        context.beginPath();
        for (let px = x; px <= x + length; px += 8) {
          const base = sandY(px) + (height - sandY(px)) * Math.pow(depth, 1.3) * 0.98;
          const y = base + shift + Math.sin((px / wavelength) * TAU + phase) * amplitude;
          if (px === x) context.moveTo(px, y);
          else context.lineTo(px, y);
        }
        context.stroke();
      }
      x += length + width * (0.02 + random() * 0.06);
    }
  }
  const dot = Math.max(1, height / 540);
  for (let i = 0; i < 420; i++) {
    const x = random() * width;
    const y = sandY(x) + random() * (height - sandY(x));
    context.fillStyle = random() < 0.5 ? 'rgba(120, 92, 52, 0.35)' : 'rgba(255, 248, 225, 0.35)';
    const size = dot * (random() < 0.15 ? 2 : 1);
    context.fillRect(x, y, size, size);
  }
  context.restore();

  context.strokeStyle = 'rgba(255, 248, 220, 0.5)';
  context.lineWidth = Math.max(2, height * 0.003);
  context.beginPath();
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = sandY(x) + context.lineWidth * 0.5;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  for (let i = 0; i < 16; i++) {
    const x = random() * width;
    const y = sandY(x) + height * (0.025 + random() * 0.1);
    const rx = height * (0.006 + random() * 0.01);
    const ry = rx * (0.55 + random() * 0.2);
    context.fillStyle = rgb(mix([92, 86, 80], [150, 140, 128], random()));
    context.beginPath();
    context.ellipse(x, y, rx, ry, 0, 0, TAU);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.25)';
    context.beginPath();
    context.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.3, 0, 0, TAU);
    context.fill();
  }
}

function paintVignette(context: Context, width: number, height: number, strength: number): void {
  const x = width / 2;
  const y = height * 0.42;
  const gradient = context.createRadialGradient(x, y, height * 0.3, x, y, width * 0.72);
  gradient.addColorStop(0, 'rgba(3, 22, 38, 0)');
  gradient.addColorStop(1, 'rgba(3, 22, 38, ' + strength + ')');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

interface Layer {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The sea floor in depth: a cached backdrop, swaying plants behind and in front of the corals,
 * and a foreground drawn over the creatures. Everything static is painted once per size.
 */
export class Seabed {
  private readonly backdrop: Layer;
  private readonly decor: Layer;
  private readonly foreground: Layer[];
  private readonly back: Plant[];
  private readonly front: Plant[];
  private readonly nearest: Plant;

  /** Sizes are CSS pixels; layers hold `scale` device pixels per CSS pixel. */
  constructor(
    private readonly width: number,
    private readonly height: number,
    scale: number,
  ) {
    const sandY = sandLine(width, height);
    // Plants and corals follow the height of a 16:9 frame, so narrow screens are not crowded.
    const unit = Math.min(height, width * 0.5625);
    const at = (fx: number): number => fx * width;
    const ground = (fx: number, sink = 0.012): number => sandY(fx * width) + height * sink;

    this.backdrop = {
      canvas: paintSurface(width, height, scale, (context) => {
        paintWater(context, width, height);
        paintFarReef(context, width, height, sandY, createRandom(5));
        const far = createRandom(13);
        context.globalAlpha = 0.5;
        const farKelp: [number, number][] = [
          [0.14, 0.34],
          [0.43, 0.28],
          [0.66, 0.38],
          [0.88, 0.3],
        ];
        for (const [fx, size] of farKelp) {
          const sprite = kelp(unit * size, far, HAZE, scale);
          context.drawImage(
            sprite.canvas,
            at(fx) - sprite.rootX,
            ground(fx, 0.01) - sprite.height,
            sprite.width,
            sprite.height,
          );
        }
        context.globalAlpha = 0.6;
        paintBranchCoral(
          context,
          at(0.22),
          ground(0.22, 0.02),
          unit * 0.2,
          HAZE.dark,
          createRandom(19),
          false,
        );
        paintFanCoral(context, at(0.5), ground(0.5, 0.02), unit * 0.12, HAZE.dark, false);
        paintBranchCoral(
          context,
          at(0.81),
          ground(0.81, 0.02),
          unit * 0.16,
          HAZE.dark,
          createRandom(23),
          false,
        );
        context.globalAlpha = 1;
        paintSand(context, width, height, sandY, createRandom(9));
        paintVignette(context, width, height, 0.38);
      }),
      x: 0,
      y: 0,
      width,
      height,
    };

    const decorTop = Math.floor(height * 0.5);
    this.decor = {
      canvas: paintSurface(width, height - decorTop, scale, (context) => {
        context.translate(0, -decorTop);
        const items = createRandom(31);
        const shadow = (fx: number, radius: number): void =>
          paintShadow(context, at(fx), ground(fx, 0.004), radius, radius * 0.22);
        shadow(0.075, width * 0.07);
        paintRock(
          context,
          at(0.075),
          ground(0.075),
          width * 0.11,
          unit * 0.075,
          [88, 104, 120],
          items,
          true,
          true,
        );
        shadow(0.175, width * 0.05);
        paintBranchCoral(
          context,
          at(0.175),
          ground(0.175),
          unit * 0.22,
          [243, 139, 160],
          items,
          true,
        );
        shadow(0.305, width * 0.05);
        paintFanCoral(context, at(0.305), ground(0.305), unit * 0.14, [180, 142, 232], true);
        shadow(0.415, width * 0.035);
        paintBrainCoral(context, at(0.415), ground(0.415), unit * 0.045, [245, 166, 91]);
        shadow(0.548, width * 0.05);
        paintRock(
          context,
          at(0.548),
          ground(0.548),
          width * 0.08,
          unit * 0.055,
          [150, 128, 104],
          items,
          false,
          true,
        );
        shadow(0.645, width * 0.045);
        paintTubes(context, at(0.645), ground(0.645), unit * 0.11, [95, 201, 184], items);
        shadow(0.765, width * 0.05);
        paintBranchCoral(
          context,
          at(0.765),
          ground(0.765),
          unit * 0.18,
          [245, 166, 91],
          items,
          true,
        );
        shadow(0.862, width * 0.03);
        paintBrainCoral(context, at(0.862), ground(0.862), unit * 0.035, [247, 208, 112]);
        shadow(0.952, width * 0.075);
        paintRock(
          context,
          at(0.952),
          ground(0.952),
          width * 0.12,
          unit * 0.08,
          [80, 96, 112],
          items,
          true,
          true,
        );
        const stars: [number, string][] = [
          [0.24, '#ff6b4a'],
          [0.6, '#f7b267'],
          [0.9, '#e85d75'],
        ];
        for (const [fx, color] of stars) {
          const y = ground(fx, 0.05 + items() * 0.04);
          const radius = unit * (0.024 + items() * 0.01);
          paintShadow(
            context,
            at(fx) + radius * 0.15,
            y + radius * 0.2,
            radius * 1.1,
            radius * 0.35,
            0.25,
          );
          paintStarfish(context, at(fx), y, radius, items() * Math.PI, color);
        }
        const shells = [0.12, 0.37, 0.5, 0.71, 0.82];
        shells.forEach((fx, i) => {
          paintShell(
            context,
            at(fx),
            ground(fx, 0.05 + items() * 0.06),
            unit * (0.017 + items() * 0.008),
            (items() - 0.5) * 0.8,
            i % 2 === 0 ? '#f4e1c1' : '#f2c6b4',
          );
        });
        // The same vignette as the backdrop, applied only where the decor has paint.
        context.globalCompositeOperation = 'source-atop';
        paintVignette(context, width, height, 0.38);
      }),
      x: 0,
      y: decorTop,
      width,
      height: height - decorTop,
    };

    const flora = createRandom(57);
    const grow = (
      sprite: PlantSprite,
      fx: number,
      sink: number,
      sway: number,
      slices: number,
    ): Plant => plant(sprite, at(fx), ground(fx, sink), flora, unit * sway, slices);
    this.back = [
      grow(kelp(unit * 0.5, flora, OLIVE, scale), 0.045, 0.02, 0.024, 18),
      grow(kelp(unit * 0.42, flora, GREEN, scale), 0.262, 0.02, 0.022, 16),
      grow(kelp(unit * 0.36, flora, OLIVE, scale), 0.594, 0.02, 0.02, 16),
      grow(kelp(unit * 0.46, flora, GREEN, scale), 0.915, 0.02, 0.024, 18),
      grow(seaGrass(unit * 0.16, flora, GREEN, scale), 0.125, 0.02, 0.014, 10),
      grow(seaGrass(unit * 0.14, flora, TEAL, scale), 0.36, 0.02, 0.012, 10),
      grow(seaGrass(unit * 0.19, flora, GREEN, scale), 0.47, 0.02, 0.014, 10),
      grow(seaGrass(unit * 0.17, flora, TEAL, scale), 0.705, 0.02, 0.014, 10),
      grow(seaGrass(unit * 0.15, flora, GREEN, scale), 0.815, 0.02, 0.012, 10),
    ];
    this.front = [
      grow(seaGrass(unit * 0.085, flora, LIME, scale), 0.218, 0.03, 0.008, 8),
      grow(seaLettuce(unit * 0.08, flora, LIME, scale), 0.5, 0.03, 0.006, 8),
      grow(seaGrass(unit * 0.075, flora, GREEN, scale), 0.688, 0.03, 0.008, 8),
      grow(seaLettuce(unit * 0.07, flora, LIME, scale), 0.9, 0.03, 0.006, 8),
    ];

    const near = createRandom(91);
    const rock = { cx: at(0.025), baseY: height * 1.04, width: width * 0.17, height: unit * 0.14 };
    const rockTop = (x: number): number => {
      const u = Math.min(1, Math.abs(x - rock.cx) / (rock.width / 2));
      return rock.baseY - rock.height * Math.sqrt(1 - u * u);
    };
    const leftY = Math.floor(height * 0.7);
    const rightX = Math.floor(width * 0.8);
    const rightY = Math.floor(height * 0.55);
    this.foreground = [
      {
        canvas: paintSurface(width * 0.2, height - leftY, scale, (context) => {
          context.translate(0, -leftY);
          paintRock(
            context,
            rock.cx,
            rock.baseY,
            rock.width,
            rock.height,
            [40, 56, 70],
            near,
            true,
            true,
          );
          const lettuce = seaLettuce(unit * 0.09, near, LIME, scale);
          context.drawImage(
            lettuce.canvas,
            at(0.035) - lettuce.rootX,
            rockTop(at(0.035)) + unit * 0.012 - lettuce.height,
            lettuce.width,
            lettuce.height,
          );
          const tuft = seaGrass(unit * 0.12, near, GREEN, scale);
          context.drawImage(
            tuft.canvas,
            at(0.075) - tuft.rootX,
            rockTop(at(0.075)) + unit * 0.012 - tuft.height,
            tuft.width,
            tuft.height,
          );
        }),
        x: 0,
        y: leftY,
        width: width * 0.2,
        height: height - leftY,
      },
      {
        canvas: paintSurface(width - rightX, height - rightY, scale, (context) => {
          context.translate(-rightX, -rightY);
          paintBranchCoral(
            context,
            at(0.978),
            height * 1.03,
            unit * 0.34,
            [200, 70, 82],
            near,
            true,
          );
          paintRock(
            context,
            at(0.925),
            height * 1.02,
            width * 0.12,
            unit * 0.085,
            [40, 56, 70],
            near,
            false,
            true,
          );
        }),
        x: rightX,
        y: rightY,
        width: width - rightX,
        height: height - rightY,
      },
    ];
    this.nearest = plant(
      kelp(unit * 0.62, near, DEEP, scale),
      at(0.012),
      height,
      near,
      unit * 0.02,
      20,
    );
  }

  /** Water, light, the far reef, sand, plants and corals: everything behind the creatures. */
  paintBehind(context: Context, time: number): void {
    drawLayer(context, this.backdrop);
    paintRays(context, this.width, this.height, time);
    for (const item of this.back) drawPlant(context, item, time);
    drawLayer(context, this.decor);
    for (const item of this.front) drawPlant(context, item, time);
  }

  /** The kelp, rocks and coral nearest to the viewer, over the creatures. */
  paintFront(context: Context, time: number): void {
    drawPlant(context, this.nearest, time);
    for (const layer of this.foreground) drawLayer(context, layer);
  }
}

function drawLayer(context: Context, layer: Layer): void {
  context.drawImage(layer.canvas, layer.x, layer.y, layer.width, layer.height);
}
