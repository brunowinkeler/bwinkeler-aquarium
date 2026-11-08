import {
  JOIN_CODE_TTL_MS,
  generateJoinCode,
  type CreateAquariumResponse,
  type JoinCodeResponse,
} from '@bwinkeler-aquarium/shared';
import type { Config } from './config.js';
import { formatCredential, hashIp, newAquariumId, parseCredential } from './credentials.js';
import { bearerToken, empty, errorResponse, failureResponse, json, serveImage } from './http.js';
import { log } from './log.js';
import { REGISTRY_NAME } from './registry-do.js';

const JOIN_CODE_ATTEMPTS = 5;
const TV_IMAGE_PATH = /^\/api\/tv\/creatures\/([0-9A-HJKMNP-TV-Z]{26})\/image$/;
const TV_SOCKET_PATH = /^\/ws\/tv\/([0-9A-HJKMNP-TV-Z]{20})$/;

export async function handleTvRequest(
  request: Request,
  env: Env,
  config: Config,
  path: string,
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return empty();
  if (method === 'POST' && path === '/api/tv/aquariums')
    return createAquarium(request, env, config);

  const imageId = method === 'GET' ? TV_IMAGE_PATH.exec(path)?.[1] : undefined;
  const known =
    imageId !== undefined ||
    (method === 'POST' && path === '/api/tv/join-code') ||
    (method === 'DELETE' && (path === '/api/tv/phones' || path === '/api/tv/aquarium'));
  if (!known) return errorResponse(404, 'not_found', 'Not found');

  const credential = parseCredential(bearerToken(request));
  if (!credential) return errorResponse(401, 'unauthorized', 'Missing or invalid TV token');
  const aquarium = env.AQUARIUMS.getByName(credential.aquariumId);

  if (imageId !== undefined) {
    return serveImage(env, await aquarium.imageLocation(credential.secret, 'tv', imageId));
  }
  if (path === '/api/tv/join-code') {
    const verified = await aquarium.verifyTv(credential.secret);
    if (!verified.ok) return failureResponse(verified);
    const expiresAt = Date.now() + JOIN_CODE_TTL_MS;
    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
      const code = generateJoinCode();
      if (await env.JOIN_CODES.getByName(code).claim(credential.aquariumId, expiresAt)) {
        const body: JoinCodeResponse = { code, expiresAt };
        return json(body, { status: 201 });
      }
    }
    return errorResponse(503, 'unavailable', 'Could not allocate a join code; try again');
  }
  const result =
    path === '/api/tv/phones'
      ? await aquarium.disconnectPhones(credential.secret)
      : await aquarium.end(credential.secret);
  return result.ok ? empty() : failureResponse(result);
}

async function createAquarium(request: Request, env: Env, config: Config): Promise<Response> {
  if (!config.ipHashKey)
    return errorResponse(503, 'unavailable', 'Aquarium creation is not configured');
  const ipKey = await hashIp(
    request.headers.get('CF-Connecting-IP') ?? 'unknown',
    config.ipHashKey,
  );
  if (!(await env.CREATE_LIMITER.limit({ key: ipKey })).success) {
    return errorResponse(429, 'rate_limited', 'Too many new aquariums; try again in a minute');
  }

  // A TV that starts over sends its previous token, which ends the old aquarium.
  const previous = parseCredential(bearerToken(request));
  if (previous) await env.AQUARIUMS.getByName(previous.aquariumId).end(previous.secret);

  const aquariumId = newAquariumId();
  const registry = env.REGISTRY.getByName(REGISTRY_NAME);
  const registered = await registry.register(aquariumId, ipKey, {
    maxLive: config.maxLiveAquariums,
    perIpPerDay: config.creationsPerIpPerDay,
  });
  if (!registered.ok) {
    return registered.reason === 'quota'
      ? errorResponse(429, 'rate_limited', 'Daily limit of new aquariums reached')
      : errorResponse(503, 'capacity', 'Too many aquariums are open right now; try again later');
  }
  const created = await env.AQUARIUMS.getByName(aquariumId).create(aquariumId);
  if (!created.ok) {
    await registry.unregister(aquariumId);
    return failureResponse(created);
  }
  log('aquarium_created', { aquariumId });
  const body: CreateAquariumResponse = {
    aquariumId,
    token: formatCredential({ aquariumId, secret: created.value.secret }),
    reconnectWindowMs: config.reconnectWindowMs,
  };
  return json(body, { status: 201 });
}

export async function handleTvSocket(request: Request, env: Env, path: string): Promise<Response> {
  const aquariumId = TV_SOCKET_PATH.exec(path)?.[1];
  if (!aquariumId || request.method !== 'GET') return errorResponse(404, 'not_found', 'Not found');
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return errorResponse(426, 'bad_request', 'Expected a WebSocket upgrade');
  }
  return env.AQUARIUMS.getByName(aquariumId).fetch(request);
}
