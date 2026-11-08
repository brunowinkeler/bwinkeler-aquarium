import type { CreatureKind, CreatureSize, Facing, RemovalReason } from '@bwinkeler-aquarium/shared';
import { PROFILES } from './profiles.js';
import { between, createRandom, hashSeed, type Random } from './random.js';

export type CreatureState = 'entering' | 'cruising' | 'idle' | 'turning' | 'darting' | 'exiting';

export interface CreatureSpec {
  id: string;
  kind: CreatureKind;
  facing: Facing;
  /** Image size in pixels; only the aspect ratio matters. */
  width: number;
  height: number;
  /** Defaults to `small`, the size every creature had before sizes existed. */
  size?: CreatureSize;
  /** `dive` drops the creature in from above with bubbles. */
  entry?: 'dive' | 'none';
}

export interface Personality {
  /** World heights per second. */
  speed: number;
  /** Hertz. */
  rhythm: number;
  /** Preferred band, as fractions of the world height. */
  bandTop: number;
  bandBottom: number;
  /** 0 = far (small, bluish), 1 = near. */
  depth: number;
  /** Longest side as a fraction of the world height, before depth scaling. */
  size: number;
  phase: number;
}

export interface SimCreature {
  readonly id: string;
  readonly kind: CreatureKind;
  readonly facing: Facing;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly personality: Personality;
  readonly random: Random;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: 1 | -1;
  /** Horizontal mirror, animated between -1 and 1 when the creature turns. */
  flip: number;
  state: CreatureState;
  stateTime: number;
  timer: number;
  wander: number;
  wavePhase: number;
  pulse: number;
  energy: number;
  exitReason: RemovalReason | null;
  done: boolean;
}

export interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobble: number;
}

export interface WorldOptions {
  width: number;
  height: number;
  /** A single large creature, as in the phone preview. */
  preview?: boolean;
}

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
export const TURN_SECONDS = 0.6;
const MAX_BUBBLES = 90;
const TAU = Math.PI * 2;

export const SIZE_SCALE: Readonly<Record<CreatureSize, number>> = {
  small: 1,
  medium: 1.35,
  large: 1.75,
};
// The preview shows one creature, so its sizes are compressed to stay readable.
const PREVIEW_SCALE: Readonly<Record<CreatureSize, number>> = {
  small: 0.62,
  medium: 0.8,
  large: 1,
};

function setState(creature: SimCreature, state: CreatureState, timer = 0): void {
  creature.state = state;
  creature.stateTime = 0;
  creature.timer = timer;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function createPersonality(
  kind: CreatureKind,
  size: CreatureSize,
  random: Random,
  preview: boolean,
): Personality {
  const profile = PROFILES[kind];
  const span = profile.band[1] - profile.band[0];
  const preferred = span * 0.6;
  const top = profile.band[0] + random() * (span - preferred);
  const personality: Personality = {
    speed: between(random, profile.speed[0], profile.speed[1]),
    rhythm: between(random, profile.rhythm[0], profile.rhythm[1]),
    bandTop: top,
    bandBottom: top + preferred,
    depth: random(),
    size: between(random, 0.15, 0.21) * SIZE_SCALE[size],
    phase: random() * TAU,
  };
  if (preview) {
    personality.depth = 1;
    personality.size = (kind === 'walk' ? 0.3 : 0.38) * PREVIEW_SCALE[size];
    personality.bandTop = profile.band[0];
    personality.bandBottom = profile.band[1];
  }
  return personality;
}

export function spriteSize(world: World, creature: SimCreature): { width: number; height: number } {
  const length =
    creature.personality.size * world.height * (0.65 + 0.35 * creature.personality.depth);
  const aspect = creature.imageWidth / Math.max(1, creature.imageHeight);
  return aspect >= 1
    ? { width: length, height: length / aspect }
    : { width: length * aspect, height: length };
}

function steer(creature: SimCreature, vx: number, vy: number, response: number, dt: number): void {
  const k = Math.min(1, response * dt);
  creature.vx += (vx - creature.vx) * k;
  creature.vy += (vy - creature.vy) * k;
}

function bandPush(y: number, top: number, bottom: number, speed: number): number {
  if (y < top) return Math.min(speed, (top - y) * 1.5);
  if (y > bottom) return -Math.min(speed, (y - bottom) * 1.5);
  return 0;
}

function turn(creature: SimCreature, heading: 1 | -1): void {
  if (creature.heading === heading) return;
  creature.heading = heading;
  if (PROFILES[creature.kind].turns) setState(creature, 'turning', creature.timer);
}

export class World {
  width: number;
  height: number;
  readonly preview: boolean;
  readonly creatures: SimCreature[] = [];
  readonly bubbles: Bubble[] = [];
  time = 0;
  onExited: ((id: string) => void) | null = null;
  private accumulator = 0;
  private bubbleTimer = 0;
  private readonly ambient: Random = createRandom(0x0a9a71);

  constructor(options: WorldOptions) {
    this.width = options.width;
    this.height = options.height;
    this.preview = options.preview === true;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0 || (width === this.width && height === this.height)) return;
    const sx = width / this.width;
    const sy = height / this.height;
    for (const creature of this.creatures) {
      creature.x *= sx;
      creature.y *= sy;
      creature.vx *= sx;
      creature.vy *= sy;
    }
    for (const bubble of this.bubbles) {
      bubble.x *= sx;
      bubble.y *= sy;
    }
    this.width = width;
    this.height = height;
  }

  get(id: string): SimCreature | undefined {
    for (const creature of this.creatures) if (creature.id === id) return creature;
    return undefined;
  }

  add(spec: CreatureSpec): SimCreature {
    const existing = this.get(spec.id);
    if (existing) return existing;
    const random = createRandom(hashSeed(spec.id));
    const personality = createPersonality(spec.kind, spec.size ?? 'small', random, this.preview);
    const heading: 1 | -1 = random() < 0.5 ? -1 : 1;
    const creature: SimCreature = {
      id: spec.id,
      kind: spec.kind,
      facing: spec.facing,
      imageWidth: spec.width,
      imageHeight: spec.height,
      personality,
      random,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading,
      flip: PROFILES[spec.kind].turns ? heading : 1,
      state: 'cruising',
      stateTime: 0,
      timer: between(random, 4, 10),
      wander: 0,
      wavePhase: personality.phase,
      pulse: 0,
      energy: 0,
      exitReason: null,
      done: false,
    };
    const size = spriteSize(this, creature);
    const margin = Math.min(0.45, (size.width / 2 + this.width * 0.02) / this.width);
    creature.x = between(random, margin, 1 - margin) * this.width;
    const bandY = between(random, personality.bandTop, personality.bandBottom) * this.height;
    if (spec.entry === 'dive') {
      creature.y = -size.height;
      setState(creature, 'entering');
    } else {
      creature.y = clamp(bandY, size.height / 2, this.height - size.height / 2);
    }
    if (!this.preview) this.startle(creature.x, bandY);
    this.creatures.push(creature);
    return creature;
  }

  /** The creature swims away; `onExited` fires once it has left the screen. */
  remove(id: string, reason: RemovalReason = 'deleted'): void {
    const creature = this.get(id);
    if (!creature || creature.state === 'exiting') return;
    creature.exitReason = reason;
    setState(creature, 'exiting');
    creature.heading = creature.x < this.width / 2 ? -1 : 1;
  }

  step(seconds: number): void {
    this.accumulator += clamp(seconds, 0, MAX_FRAME);
    while (this.accumulator >= STEP) {
      this.tick(STEP);
      this.accumulator -= STEP;
    }
  }

  private startle(x: number, y: number): void {
    const radius = this.height * 0.4;
    for (const creature of this.creatures) {
      if (creature.state === 'exiting' || creature.state === 'entering') continue;
      const dx = creature.x - x;
      const dy = creature.y - y;
      if (dx * dx + dy * dy > radius * radius) continue;
      creature.energy = 1;
      setState(creature, 'darting', creature.timer);
      creature.heading = dx >= 0 ? 1 : -1;
    }
  }

  private tick(dt: number): void {
    this.time += dt;
    for (const creature of this.creatures) this.update(creature, dt);
    this.separate(dt);
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const creature = this.creatures[i];
      if (!creature || !creature.done) continue;
      this.creatures.splice(i, 1);
      if (this.onExited) this.onExited(creature.id);
    }
    this.updateBubbles(dt);
  }

  private update(creature: SimCreature, dt: number): void {
    const size = spriteSize(this, creature);
    const speed = creature.personality.speed * this.height;
    creature.stateTime += dt;

    let rhythm = creature.personality.rhythm;
    if (creature.state === 'darting' || creature.state === 'exiting') rhythm *= 1.8;
    else if (creature.state === 'idle') rhythm *= 0.6;
    creature.wavePhase = (creature.wavePhase + TAU * rhythm * dt) % (TAU * 1000);
    if (creature.kind === 'pulse') {
      const s = Math.sin(creature.wavePhase);
      creature.pulse = s > 0 ? s * s * s : 0;
    }

    if (creature.state === 'entering') this.enter(creature, size, speed, dt);
    else if (creature.state === 'exiting') this.exit(creature, size, speed, dt);
    else this.cruise(creature, size, speed, dt);

    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;

    if (creature.state !== 'entering' && creature.state !== 'exiting') {
      const top = size.height / 2;
      const bottom = this.height - size.height * 0.45;
      if (creature.y < top) {
        creature.y = top;
        if (creature.vy < 0) creature.vy = 0;
      } else if (creature.y > bottom) {
        creature.y = bottom;
        if (creature.vy > 0) creature.vy = 0;
      }
    }

    const target = PROFILES[creature.kind].turns ? creature.heading : 1;
    if (creature.flip !== target) {
      const delta = (2 / TURN_SECONDS) * dt;
      creature.flip =
        creature.flip < target
          ? Math.min(target, creature.flip + delta)
          : Math.max(target, creature.flip - delta);
    }
  }

  private enter(
    creature: SimCreature,
    size: { width: number; height: number },
    speed: number,
    dt: number,
  ): void {
    const p = creature.personality;
    const targetY = Math.min(
      ((p.bandTop + p.bandBottom) / 2) * this.height,
      this.height - size.height * 0.45,
    );
    const distance = targetY - creature.y;
    steer(creature, creature.heading * speed * 0.3, Math.max(speed * 0.8, distance * 1.6), 3, dt);
    if (distance <= size.height * 0.05)
      setState(creature, 'cruising', between(creature.random, 6, 12));
  }

  private exit(
    creature: SimCreature,
    size: { width: number; height: number },
    speed: number,
    dt: number,
  ): void {
    if (creature.kind === 'pulse') {
      creature.vy += (-creature.pulse * speed * 9 - speed * 0.6) * dt;
      creature.vy -= creature.vy * Math.min(1, 1.2 * dt);
      creature.vx -= creature.vx * Math.min(1, 1.2 * dt);
      if (creature.y < -size.height) creature.done = true;
      return;
    }
    steer(creature, creature.heading * speed * 1.8, 0, 2, dt);
    if (creature.x < -size.width || creature.x > this.width + size.width) creature.done = true;
  }

  private cruise(
    creature: SimCreature,
    size: { width: number; height: number },
    speed: number,
    dt: number,
  ): void {
    const random = creature.random;
    creature.timer -= dt;
    if (creature.state === 'darting') {
      creature.energy -= dt / 1.2;
      if (creature.energy <= 0) setState(creature, 'cruising', between(random, 5, 10));
    } else if (creature.state === 'turning') {
      if (creature.stateTime >= TURN_SECONDS) setState(creature, 'cruising', creature.timer);
    } else if (creature.timer <= 0) {
      if (creature.state === 'idle') {
        setState(creature, 'cruising', between(random, 6, 14));
      } else if (creature.kind === 'pulse') {
        creature.timer = between(random, 6, 14);
      } else if (random() < 0.35) {
        creature.timer = between(random, 6, 14);
        turn(creature, creature.heading === 1 ? -1 : 1);
      } else {
        setState(
          creature,
          'idle',
          creature.kind === 'walk' ? between(random, 1, 3) : between(random, 2.5, 5),
        );
      }
    }

    const factor =
      creature.state === 'idle'
        ? 0.25
        : creature.state === 'darting'
          ? 1 + 1.8 * Math.max(0, creature.energy)
          : 1;
    const marginX = size.width / 2 + this.width * 0.02;
    const bandTop = creature.personality.bandTop * this.height;
    const bandBottom = creature.personality.bandBottom * this.height;

    if (creature.kind !== 'pulse' && creature.state !== 'turning') {
      if (creature.heading > 0 && creature.x > this.width - marginX) turn(creature, -1);
      else if (creature.heading < 0 && creature.x < marginX) turn(creature, 1);
    }

    switch (creature.kind) {
      case 'swim':
      case 'glide': {
        const rate = creature.kind === 'swim' ? 1.6 : 0.6;
        creature.wander = clamp(creature.wander + (random() - 0.5) * 2 * rate * dt, -1.2, 1.2);
        let vy = Math.sin(creature.wander) * speed * 0.5 * factor;
        if (creature.kind === 'glide') {
          vy += Math.sin(this.time * 0.5 + creature.personality.phase) * speed * 0.25;
        }
        vy += bandPush(creature.y, bandTop, bandBottom, speed);
        const vx = creature.heading * speed * factor * (creature.state === 'turning' ? 0.35 : 1);
        steer(creature, vx, vy, creature.kind === 'swim' ? 2.2 : 1.2, dt);
        break;
      }
      case 'pulse': {
        creature.wander = clamp(creature.wander + (random() - 0.5) * 1.6 * dt, -1, 1);
        if (creature.x < marginX) creature.wander = Math.abs(creature.wander) + 0.05;
        else if (creature.x > this.width - marginX)
          creature.wander = -Math.abs(creature.wander) - 0.05;
        const vx = Math.sin(creature.wander) * speed * 0.8 * factor;
        creature.vx += (vx - creature.vx) * Math.min(1, 1.5 * dt);
        creature.vy += (-creature.pulse * speed * 7 * factor + speed * 0.9) * dt;
        creature.vy += bandPush(creature.y, bandTop, bandBottom, speed) * 2 * dt;
        creature.vy -= creature.vy * Math.min(1, 1.6 * dt);
        break;
      }
      case 'walk': {
        const ground = Math.min((bandTop + bandBottom) / 2, this.height - size.height * 0.45);
        const vx = creature.state === 'idle' ? 0 : creature.heading * speed * factor;
        steer(creature, vx, (ground - creature.y) * 4, 6, dt);
        break;
      }
    }
  }

  private separate(dt: number): void {
    const list = this.creatures;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || a.kind === 'walk' || a.state === 'entering' || a.state === 'exiting') continue;
      const sa = spriteSize(this, a);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b || b.kind === 'walk' || b.state === 'entering' || b.state === 'exiting') continue;
        if (Math.abs(a.personality.depth - b.personality.depth) > 0.35) continue;
        const sb = spriteSize(this, b);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minY = (sa.height + sb.height) * 0.45;
        if (Math.abs(dx) >= (sa.width + sb.width) * 0.35 || Math.abs(dy) >= minY) continue;
        const nudge = (minY - Math.abs(dy)) * 3 * dt;
        const direction = dy >= 0 ? 1 : -1;
        a.vy -= direction * nudge;
        b.vy += direction * nudge;
      }
    }
  }

  private updateBubbles(dt: number): void {
    const unit = this.height / 1080;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = between(this.ambient, 0.4, 1.2) * (this.preview ? 2 : 1);
      this.spawnBubble(between(this.ambient, 0.05, 0.95) * this.width, this.height * 0.9, unit);
    }
    for (const creature of this.creatures) {
      if (creature.state !== 'entering' || this.ambient() > dt * 14) continue;
      const size = spriteSize(this, creature);
      this.spawnBubble(
        creature.x + between(this.ambient, -0.4, 0.4) * size.width,
        creature.y - size.height * 0.3,
        unit,
      );
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      if (!bubble) continue;
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(this.time * 2.4 + bubble.wobble) * 12 * unit * dt;
      if (bubble.y < -bubble.radius) this.bubbles.splice(i, 1);
    }
  }

  private spawnBubble(x: number, y: number, unit: number): void {
    if (this.bubbles.length >= MAX_BUBBLES) return;
    this.bubbles.push({
      x,
      y,
      radius: between(this.ambient, 2, 7) * unit,
      speed: between(this.ambient, 40, 90) * unit,
      wobble: this.ambient() * TAU,
    });
  }
}
