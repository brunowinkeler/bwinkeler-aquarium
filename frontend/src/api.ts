import {
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  type CreateCreatureRequest,
  type CreatureListResponse,
  type CreatureResponse,
  type ErrorCode,
  type JoinResponse,
  type SessionResponse,
} from '@bwinkeler-aquarium/shared';

export type ApiErrorCode = ErrorCode | 'network';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
  ) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

const CLIENT = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
const JSON_CLIENT = { ...CLIENT, 'Content-Type': 'application/json' };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!response.ok) {
    let code: ApiErrorCode = response.status === 410 ? 'gone' : 'internal';
    try {
      const body = (await response.json()) as { error?: ErrorCode };
      if (typeof body.error === 'string') code = body.error;
    } catch {
      // Not JSON (for example a proxy error page): keep the status-based code.
    }
    throw new ApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  join: (code: string) =>
    request<JoinResponse>('/api/join', {
      method: 'POST',
      headers: JSON_CLIENT,
      body: JSON.stringify({ code }),
    }),
  session: () => request<SessionResponse>('/api/session'),
  leave: () => request<void>('/api/leave', { method: 'POST', headers: CLIENT }),
  creatures: () => request<CreatureListResponse>('/api/creatures'),
  creature: (id: string) => request<CreatureResponse>(`/api/creatures/${id}`),
  reserve: (creature: CreateCreatureRequest) =>
    request<CreatureResponse>('/api/creatures', {
      method: 'POST',
      headers: JSON_CLIENT,
      body: JSON.stringify(creature),
    }),
  upload: (id: string, image: Blob) =>
    request<CreatureResponse>(`/api/creatures/${id}/image`, {
      method: 'PUT',
      headers: { ...CLIENT, 'Content-Type': 'image/png' },
      body: image,
    }),
  remove: (id: string) =>
    request<void>(`/api/creatures/${id}`, { method: 'DELETE', headers: CLIENT }),
  imageUrl: (id: string) => `/api/creatures/${id}/image`,
};

/** Message key for an API failure that has no screen-specific wording. */
export function errorMessageKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : 'internal';
  switch (code) {
    case 'network':
      return 'error.network' as const;
    case 'rate_limited':
      return 'error.rate_limited' as const;
    case 'phone_limit':
      return 'error.phone_limit' as const;
    case 'payload_too_large':
      return 'error.payload_too_large' as const;
    case 'invalid_image':
    case 'unsupported_media_type':
      return 'error.invalid_image' as const;
    case 'unavailable':
    case 'capacity':
      return 'error.unavailable' as const;
    default:
      return 'error.generic' as const;
  }
}

export function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 410 || error.status === 401);
}
