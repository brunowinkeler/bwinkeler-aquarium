import {
  Canvas2DRenderer,
  createDemoSprite,
  startAnimation,
  World,
} from '@bwinkeler-aquarium/engine';
import type { Creature, CreatureKind, RemovalReason } from '@bwinkeler-aquarium/shared';
import { fetchImage } from './api';

const DEMO: CreatureKind[] = ['swim', 'pulse', 'walk', 'glide', 'swim'];

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

/** The animated aquarium: real creatures from the server, demo fish while it is empty. */
export class AquariumScene {
  private readonly world = new World({ width: 1280, height: 720 });
  private readonly renderer: Canvas2DRenderer;
  private readonly real: { [id: string]: true } = {};
  private readonly loading: { [id: string]: true } = {};
  private demo: string[] = [];
  private frames = 0;
  private frameTime = 0;
  fps = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly token: () => string | null,
    private readonly onShown: (id: string) => void,
  ) {
    this.renderer = new Canvas2DRenderer(canvas);
    this.world.onExited = (id) => this.renderer.deleteImage(id);
  }

  start(): void {
    const fit = () => {
      this.world.resize(window.innerWidth, window.innerHeight);
      this.renderer.resize(window.innerWidth, window.innerHeight, 1);
    };
    fit();
    window.addEventListener('resize', fit);
    this.showDemo();
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
        this.hideDemo();
        if (creature.displayedAt === null) this.onShown(creature.id);
      })
      .catch(() => {
        delete this.loading[creature.id];
      });
  }

  remove(id: string, reason: RemovalReason): void {
    delete this.real[id];
    this.world.remove(id, reason);
    if (this.creatures().length === 0) this.showDemo();
  }

  clear(): void {
    for (const id of this.creatures()) this.remove(id, 'deleted');
  }

  private showDemo(): void {
    if (this.demo.length > 0) return;
    for (let i = 0; i < DEMO.length; i++) {
      const kind = DEMO[i] as CreatureKind;
      const id = 'demo-' + i + '-' + Date.now();
      const sprite = createDemoSprite(kind, 'demo-' + i);
      this.renderer.setImage(id, sprite.canvas, sprite.width, sprite.height);
      this.world.add({ id, kind, facing: 'right', width: sprite.width, height: sprite.height });
      this.demo.push(id);
    }
  }

  private hideDemo(): void {
    for (const id of this.demo) this.world.remove(id, 'deleted');
    this.demo = [];
  }
}
