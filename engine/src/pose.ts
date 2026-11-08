import { PROFILES } from './profiles.js';
import type { SimCreature } from './world.js';

export interface Pose {
  /** `columns` bends the body vertically, `rows` ripples the lower half sideways. */
  mode: 'columns' | 'rows' | 'rigid';
  /** Fraction of the sprite height (columns) or width (rows). */
  amplitude: number;
  phase: number;
  waveLength: number;
  /** Includes the mirror; the sprite is drawn centered on the creature. */
  scaleX: number;
  scaleY: number;
  /** Fraction of the sprite height. */
  offsetY: number;
  tilt: number;
  /** Strength of the blue depth tint. */
  fog: number;
}

const MAX_TILT = 0.35;

export function creaturePose(creature: SimCreature): Pose {
  const profile = PROFILES[creature.kind];
  const fog = 0.35 * (1 - creature.personality.depth);
  const mirror = profile.turns ? creature.flip * (creature.facing === 'right' ? 1 : -1) : 1;
  const busy = creature.state === 'darting' || creature.state === 'exiting';
  const calm = creature.state === 'idle';

  switch (creature.kind) {
    case 'pulse':
      return {
        mode: 'rows',
        amplitude: profile.amplitude,
        phase: creature.wavePhase,
        waveLength: profile.waveLength,
        scaleX: 1 - 0.12 * creature.pulse,
        scaleY: 1 + 0.08 * creature.pulse,
        offsetY: 0,
        tilt: 0.08 * Math.sin(creature.wavePhase * 0.5),
        fog,
      };
    case 'walk': {
      const walking = !calm;
      return {
        mode: 'rigid',
        amplitude: 0,
        phase: 0,
        waveLength: 1,
        scaleX: mirror,
        scaleY: 1,
        offsetY: walking ? -0.06 * Math.abs(Math.sin(creature.wavePhase / 2)) : 0,
        tilt: walking ? 0.05 * Math.sin(creature.wavePhase) : 0,
        fog,
      };
    }
    default: {
      const direction = creature.vx >= 0 ? 1 : -1;
      const climb = Math.atan2(creature.vy, Math.abs(creature.vx) + 1e-3) * 0.6;
      return {
        mode: 'columns',
        amplitude: profile.amplitude * (busy ? 1.3 : calm ? 0.5 : 1),
        phase: creature.wavePhase,
        waveLength: profile.waveLength,
        scaleX: mirror,
        scaleY: 1,
        offsetY: 0,
        tilt: Math.max(-MAX_TILT, Math.min(MAX_TILT, climb)) * direction,
        fog,
      };
    }
  }
}

/** Vertical offset of a body column, `u` = 0 at the head and 1 at the tail. */
export function bodyWave(pose: Pose, u: number): number {
  return pose.amplitude * u * u * Math.sin(pose.phase - (2 * Math.PI * u) / pose.waveLength);
}
