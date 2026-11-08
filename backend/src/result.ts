import type { ErrorCode } from '@bwinkeler-aquarium/shared';

export interface Failure {
  ok: false;
  status: number;
  error: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(status: number, error: ErrorCode, message: string): Failure {
  return { ok: false, status, error, message };
}
