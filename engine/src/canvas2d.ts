import { bodyWave, creaturePose, type Pose } from './pose.js';
import { paintBackdrop, paintBubbles, paintRays, paintSeaweed } from './scene.js';
import { spriteSize, type SimCreature, type World } from './world.js';

interface Sprite {
  source: CanvasImageSource;
  width: number;
  height: number;
  tinted: HTMLCanvasElement | null;
  tint: number;
}

const SLICES = 16;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Canvas 2D renderer; the body wave is approximated with sprite slices. */
export class Canvas2DRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly sprites = new Map<string, Sprite>();
  private backdrop: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available');
    this.context = context;
  }

  /** Sizes are CSS pixels; the backing store is scaled by `pixelRatio`. */
  resize(width: number, height: number, pixelRatio = 1): void {
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.backdrop = null;
  }

  setImage(id: string, source: CanvasImageSource, width: number, height: number): void {
    this.sprites.set(id, { source, width, height, tinted: null, tint: -1 });
  }

  hasImage(id: string): boolean {
    return this.sprites.has(id);
  }

  deleteImage(id: string): void {
    this.sprites.delete(id);
  }

  render(world: World): void {
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.drawImage(this.getBackdrop(), 0, 0, this.width, this.height);
    paintRays(context, this.width, this.height, world.time);
    paintSeaweed(context, this.width, this.height, world.time);

    const ordered = world.creatures
      .slice()
      .sort((a, b) => a.personality.depth - b.personality.depth);
    for (const creature of ordered) this.drawCreature(world, creature);
    paintBubbles(context, world.bubbles);
  }

  private getBackdrop(): HTMLCanvasElement {
    if (!this.backdrop) {
      const backdrop = createCanvas(this.width * this.pixelRatio, this.height * this.pixelRatio);
      const context = backdrop.getContext('2d');
      if (context) {
        context.scale(this.pixelRatio, this.pixelRatio);
        paintBackdrop(context, this.width, this.height);
      }
      this.backdrop = backdrop;
    }
    return this.backdrop;
  }

  private sourceFor(sprite: Sprite, fog: number): CanvasImageSource {
    if (fog < 0.03) return sprite.source;
    if (sprite.tinted && Math.abs(sprite.tint - fog) < 0.02) return sprite.tinted;
    const tinted = createCanvas(sprite.width, sprite.height);
    const context = tinted.getContext('2d');
    if (!context) return sprite.source;
    context.drawImage(sprite.source, 0, 0, sprite.width, sprite.height);
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = 'rgba(24, 92, 132, ' + fog.toFixed(3) + ')';
    context.fillRect(0, 0, sprite.width, sprite.height);
    sprite.tinted = tinted;
    sprite.tint = fog;
    return tinted;
  }

  private drawCreature(world: World, creature: SimCreature): void {
    const sprite = this.sprites.get(creature.id);
    if (!sprite) return;
    const size = spriteSize(world, creature);
    const pose = creaturePose(creature);
    const source = this.sourceFor(sprite, pose.fog);
    const context = this.context;
    context.save();
    context.translate(creature.x, creature.y + pose.offsetY * size.height);
    context.rotate(pose.tilt);
    context.scale(pose.scaleX, pose.scaleY);
    if (pose.mode === 'columns') this.drawColumns(source, sprite, size, pose, creature);
    else if (pose.mode === 'rows') this.drawRows(source, sprite, size, pose);
    else context.drawImage(source, -size.width / 2, -size.height / 2, size.width, size.height);
    context.restore();
  }

  private drawColumns(
    source: CanvasImageSource,
    sprite: Sprite,
    size: { width: number; height: number },
    pose: Pose,
    creature: SimCreature,
  ): void {
    const sourceWidth = sprite.width / SLICES;
    const width = size.width / SLICES;
    for (let i = 0; i < SLICES; i++) {
      const across = (i + 0.5) / SLICES;
      const u = creature.facing === 'right' ? 1 - across : across;
      const dy = bodyWave(pose, u) * size.height;
      this.context.drawImage(
        source,
        i * sourceWidth,
        0,
        sourceWidth,
        sprite.height,
        -size.width / 2 + i * width,
        -size.height / 2 + dy,
        width + 0.75,
        size.height,
      );
    }
  }

  private drawRows(
    source: CanvasImageSource,
    sprite: Sprite,
    size: { width: number; height: number },
    pose: Pose,
  ): void {
    const sourceHeight = sprite.height / SLICES;
    const height = size.height / SLICES;
    for (let j = 0; j < SLICES; j++) {
      const down = (j + 0.5) / SLICES;
      const t = down > 0.45 ? (down - 0.45) / 0.55 : 0;
      const dx =
        pose.amplitude *
        size.width *
        t *
        t *
        Math.sin(pose.phase - (2 * Math.PI * t) / pose.waveLength);
      this.context.drawImage(
        source,
        0,
        j * sourceHeight,
        sprite.width,
        sourceHeight,
        -size.width / 2 + dx,
        -size.height / 2 + j * height,
        size.width,
        height + 0.75,
      );
    }
  }
}
