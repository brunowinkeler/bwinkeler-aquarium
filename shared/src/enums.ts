export const CREATURE_KINDS = ['swim', 'pulse', 'walk', 'glide'] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export const FACINGS = ['left', 'right'] as const;
export type Facing = (typeof FACINGS)[number];

export const REMOVAL_REASONS = ['capacity', 'deleted'] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export const END_REASONS = ['ended', 'expired'] as const;
export type EndReason = (typeof END_REASONS)[number];

export const CREATURE_STATUSES = ['pending', 'active'] as const;
export type CreatureStatus = (typeof CREATURE_STATUSES)[number];

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'gone',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
  'invalid_image',
  'rate_limited',
  'phone_limit',
  'capacity',
  'unavailable',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).indexOf(value) !== -1;
}
