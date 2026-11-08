import {
  CREATURE_KINDS,
  END_REASONS,
  ERROR_CODES,
  FACINGS,
  REMOVAL_REASONS,
  isOneOf,
  type CreatureKind,
  type CreatureStatus,
  type EndReason,
  type ErrorCode,
  type Facing,
  type RemovalReason,
} from './enums.js';
import { MAX_IMAGE_DIMENSION } from './limits.js';
import { isUlid } from './ulid.js';

export const SESSION_COOKIE = 'aquarium_sid';
export const CLIENT_HEADER = 'X-Aquarium-Client';
export const CLIENT_HEADER_VALUE = 'pwa';

export interface Creature {
  id: string;
  kind: CreatureKind;
  facing: Facing;
  author: string | null;
  width: number;
  height: number;
  createdAt: number;
  displayedAt: number | null;
}

export interface PhoneCreature extends Creature {
  status: CreatureStatus;
  mine: boolean;
}

export interface CreateAquariumResponse {
  aquariumId: string;
  token: string;
  reconnectWindowMs: number;
}

export interface JoinCodeResponse {
  code: string;
  expiresAt: number;
}

export interface JoinRequest {
  code: string;
}

export interface JoinResponse {
  aquariumId: string;
}

export interface SessionResponse {
  aquariumId: string;
  tvConnected: boolean;
  /** Deadline of the `Waiting` state; null while the TV is connected. */
  expiresAt: number | null;
  phoneCount: number;
  creatureCount: number;
  capacity: number;
}

export interface CreateCreatureRequest {
  id: string;
  kind: CreatureKind;
  facing: Facing;
  author: string | null;
  width: number;
  height: number;
}

export interface CreatureResponse {
  creature: PhoneCreature;
}

export interface CreatureListResponse {
  creatures: PhoneCreature[];
  capacity: number;
}

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
}

export type TvMessage =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  | { type: 'sync' }
  | { type: 'displayed'; id: string };

export type ServerMessage =
  | { type: 'snapshot'; revision: number; creatures: Creature[]; phoneCount: number }
  | { type: 'creature_added'; revision: number; creature: Creature }
  | { type: 'creature_removed'; revision: number; id: string; reason: RemovalReason }
  | { type: 'phones_changed'; revision: number; phoneCount: number }
  | { type: 'aquarium_ended'; reason: EndReason }
  | { type: 'error'; code: ErrorCode }
  | { type: 'pong' };

/** Exact strings: the runtime answers the ping without waking the Durable Object. */
export const WS_PING = '{"type":"ping"}';
export const WS_PONG = '{"type":"pong"}';

export const WS_CLOSE = {
  authTimeout: 4000,
  replaced: 4001,
  unauthorized: 4003,
  ended: 4010,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDimension(value: unknown): boolean {
  return isCount(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION;
}

export function isCreature(value: unknown): value is Creature {
  return (
    isRecord(value) &&
    isUlid(value.id) &&
    isOneOf(CREATURE_KINDS, value.kind) &&
    isOneOf(FACINGS, value.facing) &&
    (value.author === null || typeof value.author === 'string') &&
    isDimension(value.width) &&
    isDimension(value.height) &&
    isTimestamp(value.createdAt) &&
    (value.displayedAt === null || isTimestamp(value.displayedAt))
  );
}

/** Hand-written guard so the TV bundle does not need Zod. */
export function parseServerMessage(data: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'snapshot':
      return isCount(value.revision) &&
        Array.isArray(value.creatures) &&
        value.creatures.every(isCreature) &&
        isCount(value.phoneCount)
        ? (value as ServerMessage)
        : null;
    case 'creature_added':
      return isCount(value.revision) && isCreature(value.creature)
        ? (value as ServerMessage)
        : null;
    case 'creature_removed':
      return isCount(value.revision) && isUlid(value.id) && isOneOf(REMOVAL_REASONS, value.reason)
        ? (value as ServerMessage)
        : null;
    case 'phones_changed':
      return isCount(value.revision) && isCount(value.phoneCount) ? (value as ServerMessage) : null;
    case 'aquarium_ended':
      return isOneOf(END_REASONS, value.reason) ? (value as ServerMessage) : null;
    case 'error':
      return isOneOf(ERROR_CODES, value.code) ? (value as ServerMessage) : null;
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}
