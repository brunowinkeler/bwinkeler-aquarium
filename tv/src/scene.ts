import {
  Canvas2DRenderer,
  createDemoSprite,
  startAnimation,
  World,
} from '@bwinkeler-aquarium/engine';
import type {
  Creature,
  CreatureKind,
  CreatureSize,
  RemovalReason,
} from '@bwinkeler-aquarium/shared';
import { fetchImage } from './api';

// Hand-drawn stand-ins: all of them in an empty aquarium, the first DEMO_KEPT always.
const DEMO: readonly { kind: CreatureKind; size: CreatureSize }[] = [
  { kind: 'swim', size: 'medium' },
  { kind: 'pulse', size: 'small' },
  { kind: 'walk', size: 'small' },
  { kind: 'glide', size: 'medium' },
  { kind: 'swim', size: 'small' },
  { kind: 'swim', size: 'large' },
];
const DEMO_KEPT = 3;

interface Loaded {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function decode(blob: Blob): Promise<Loaded> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob).then((bitmap) => ({
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
    }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed'));
    };
    image.src = url;
  });
}

/** The animated aquarium: real creatures from the server among a few demo ones. */
export class AquariumScene {
  private readonly world = new World({ width: 1280, height: 720 });
  private readonly renderer: Canvas2DRenderer;
  private readonly real: { [id: string]: true } = {};
  private readonly loading: { [id: string]: true } = {};
  private demo: string[] = [];
  private frames = 0;
  private frameTime = 0;
  private light = false;
  fps = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly token: () => string | null,
    private readonly onShown: (id: string) => void,
  ) {
    this.renderer = new Canvas2DRenderer(canvas);
    this.world.onExited = (id) => this.renderer.deleteImage(id);
  }

  start(): void {
    this.fit();
    window.addEventListener('resize', () => this.fit());
    this.updateDemo();
    startAnimation((seconds) => {
      this.world.step(seconds);
      this.renderer.render(this.world);
      this.frames++;
      this.frameTime += seconds;
      if (this.frameTime >= 1) {
        this.fps = Math.round(this.frames / this.frameTime);
        this.frames = 0;
        this.frameTime = 0;
      }
    });
  }

  /** IDs of the real creatures that are swimming. */
  creatures(): string[] {
    return Object.keys(this.real);
  }

  /** Light quality draws at most 720 lines; the browser stretches the canvas to the screen. */
  setLight(light: boolean): void {
    this.light = light;
    this.fit();
  }

  /** The canvas size in device pixels, such as `1280x720`. */
  resolution(): string {
    return this.canvas.width + 'x' + this.canvas.height;
  }

  private fit(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.world.resize(width, height);
    this.renderer.resize(width, height, this.light ? Math.min(1, 720 / height) : 1);
  }

  sync(creatures: readonly Creature[]): void {
    const wanted: { [id: string]: true } = {};
    for (const creature of creatures) wanted[creature.id] = true;
    for (const id of this.creatures()) if (!wanted[id]) this.remove(id, 'deleted');
    for (const creature of creatures) this.add(creature, false);
  }

  add(creature: Creature, dive: boolean): void {
    const token = this.token();
    if (!token || this.real[creature.id] || this.loading[creature.id]) return;
    this.loading[creature.id] = true;
    fetchImage(token, creature.id)
      .then(decode)
      .then((image) => {
        delete this.loading[creature.id];
        if (this.token() !== token) return;
        this.renderer.setImage(creature.id, image.source, image.width, image.height);
        this.world.add({
          id: creature.id,
          kind: creature.kind,
          facing: creature.facing,
          size: creature.size,
          width: image.width,
          height: image.height,
          entry: dive ? 'dive' : 'none',
        });
        this.real[creature.id] = true;
        this.updateDemo();
        if (creature.displayedAt === null) this.onShown(creature.id);
      })
      .catch(() => {
        delete this.loading[creature.id];
      });
  }

  remove(id: string, reason: RemovalReason): void {
    delete this.real[id];
    this.world.remove(id, reason);
    this.updateDemo();
  }

  clear(): void {
    for (const id of this.creatures()) this.remove(id, 'deleted');
  }

  /** Fewer stand-ins as real creatures arrive, but never fewer than DEMO_KEPT. */
  private updateDemo(): void {
    const wanted = Math.max(DEMO_KEPT, DEMO.length - this.creatures().length);
    while (this.demo.length > wanted) {
      const id = this.demo.pop();
      if (id) this.world.remove(id, 'deleted');
    }
    while (this.demo.length < wanted) {
      const index = this.demo.length;
      const demo = DEMO[index];
      if (!demo) return;
      const id = 'demo-' + index + '-' + Date.now();
      const sprite = createDemoSprite(demo.kind, 'demo-' + index);
      this.renderer.setImage(id, sprite.canvas, sprite.width, sprite.height);
      this.world.add({
        id,
        kind: demo.kind,
        size: demo.size,
        facing: 'right',
        width: sprite.width,
        height: sprite.height,
      });
      this.demo.push(id);
    }
  }
}
