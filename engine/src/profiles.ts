import type { CreatureKind } from '@bwinkeler-aquarium/shared';

export interface MotionProfile {
  /** Vertical band of the creature's center, as fractions of the world height. */
  band: readonly [number, number];
  /** Cruise speed range, in world heights per second. */
  speed: readonly [number, number];
  /** Body rhythm range, in hertz. */
  rhythm: readonly [number, number];
  /** Wave amplitude as a fraction of the sprite height (columns) or width (rows). */
  amplitude: number;
  /** Wave length in body lengths. */
  waveLength: number;
  /** Whether the sprite mirrors when the heading changes. */
  turns: boolean;
}

export const PROFILES: Readonly<Record<CreatureKind, MotionProfile>> = {
  swim: {
    band: [0.1, 0.8],
    speed: [0.07, 0.12],
    rhythm: [1.1, 1.8],
    amplitude: 0.12,
    waveLength: 1.1,
    turns: true,
  },
  pulse: {
    band: [0.05, 0.6],
    speed: [0.035, 0.055],
    rhythm: [0.45, 0.7],
    amplitude: 0.05,
    waveLength: 0.8,
    turns: false,
  },
  walk: {
    band: [0.84, 0.94],
    speed: [0.035, 0.06],
    rhythm: [1.6, 2.4],
    amplitude: 0,
    waveLength: 1,
    turns: false,
  },
  glide: {
    band: [0.15, 0.7],
    speed: [0.045, 0.07],
    rhythm: [0.35, 0.6],
    amplitude: 0.07,
    waveLength: 2,
    turns: true,
  },
};
