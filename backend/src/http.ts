import {
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  SESSION_COOKIE,
  type ErrorCode,
  type ErrorResponse,
} from '@bwinkeler-aquarium/shared';
import type { ImageLocation } from './aquarium-do.js';
import type { Failure, Result } from './result.js';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

/** Only /api/tv/* gets CORS: the packaged TV app runs on file:// and never sends cookies. */
export const TV_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  // Chromium 53 does not support the `*` wildcard here.
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

interface ResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function json(body: unknown, options: ResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...BASE_HEADERS,
      ...options.headers,
    },
  });
}

export function empty(options: ResponseOptions = {}): Response {
  return new Response(null, {
    status: options.status ?? 204,
    headers: { ...BASE_HEADERS, ...options.headers },
  });
}

export function errorResponse(
  status: number,
  error: ErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  const body: ErrorResponse = { error, message };
  return json(body, { status, headers });
}

export function failureResponse(failure: Failure, headers?: Record<string, string>): Response {
  return errorResponse(failure.status, failure.error, failure.message, headers);
}

export function imageResponse(object: R2ObjectBody): Response {
  return new Response(object.body, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: object.httpEtag,
    },
  });
}

export async function serveImage(env: Env, location: Result<ImageLocation>): Promise<Response> {
  if (!location.ok) return failureResponse(location);
  const object = await env.IMAGES.get(location.value.objectKey);
  return object ? imageResponse(object) : errorResponse(404, 'not_found', 'Image not found');
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
  return result;
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '');
  return match?.[1] ?? null;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function sessionCookie(value: string): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** CSRF guard for state-changing phone requests: same origin plus a header forms cannot send. */
export function isTrustedPhoneRequest(request: Request, publicOrigin: string): boolean {
  return (
    request.headers.get('Origin') === publicOrigin &&
    request.headers.get(CLIENT_HEADER) === CLIENT_HEADER_VALUE
  );
}

/** Reads at most `limit` bytes; returns null when the body is larger. */
export async function readBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > limit) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJson(request: Request, limit = 4096): Promise<unknown> {
  const body = await readBody(request, limit);
  if (!body) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
}
