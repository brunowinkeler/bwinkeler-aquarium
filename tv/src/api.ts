import type { CreateAquariumResponse, JoinCodeResponse } from '@bwinkeler-aquarium/shared';

const PRODUCTION = 'https://aquarium.bwinkeler.com';

/** The packaged webOS app runs on file:// and talks to production; /tv/ uses its own origin. */
export const API_BASE = window.location.protocol === 'file:' ? PRODUCTION : window.location.origin;

export class TvApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(status + ' ' + code);
  }
}

function call(path: string, method: string, token: string | null): Promise<Response> {
  const headers: { [name: string]: string } = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(API_BASE + path, { method, headers, cache: 'no-store' }).then(
    (response) => {
      if (response.ok) return response;
      return response.json().then(
        (body: { error?: string }) => {
          throw new TvApiError(response.status, body && body.error ? body.error : 'internal');
        },
        () => {
          throw new TvApiError(response.status, 'internal');
        },
      );
    },
    () => {
      throw new TvApiError(0, 'network');
    },
  );
}

/** Sending the previous token ends the aquarium this TV was showing. */
export function createAquarium(previousToken: string | null): Promise<CreateAquariumResponse> {
  return call('/api/tv/aquariums', 'POST', previousToken).then((response) => response.json());
}

export function issueJoinCode(token: string): Promise<JoinCodeResponse> {
  return call('/api/tv/join-code', 'POST', token).then((response) => response.json());
}

export function disconnectPhones(token: string): Promise<void> {
  return call('/api/tv/phones', 'DELETE', token).then(() => undefined);
}

export function endAquarium(token: string): Promise<void> {
  return call('/api/tv/aquarium', 'DELETE', token).then(() => undefined);
}

export function fetchImage(token: string, id: string): Promise<Blob> {
  return call('/api/tv/creatures/' + id + '/image', 'GET', token).then((response) =>
    response.blob(),
  );
}

export function socketUrl(aquariumId: string): string {
  return API_BASE.replace(/^http/, 'ws') + '/ws/tv/' + aquariumId;
}

export function joinUrl(code: string): string {
  return API_BASE + '/join/?code=' + code;
}

/** Where phones go, as people type it: `aquarium.bwinkeler.com/join`. */
export function joinAddress(): string {
  return API_BASE.replace(/^https?:\/\//, '') + '/join';
}
