import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  SESSION_COOKIE,
  normalizeJoinCode,
  type CreatureResponse,
  type JoinResponse,
} from '@bwinkeler-aquarium/shared';
import { createCreatureRequestSchema, joinRequestSchema } from '@bwinkeler-aquarium/shared/schemas';
import type { AquariumDO } from './aquarium-do.js';
import type { Config } from './config.js';
import { formatCredential, hashIp, parseCredential } from './credentials.js';
import {
  clearedSessionCookie,
  empty,
  errorResponse,
  failureResponse,
  isTrustedPhoneRequest,
  json,
  readBody,
  readCookie,
  readJson,
  serveImage,
  sessionCookie,
} from './http.js';
import { readPngHeader } from './png.js';
import type { Failure, Result } from './result.js';

type Aquarium = DurableObjectStub<AquariumDO>;
type PhoneAction = (aquarium: Aquarium, secret: string) => Promise<Response>;

const CREATURE_PATH = /^\/api\/creatures\/([0-9A-HJKMNP-TV-Z]{26})(\/image)?$/;

/** A session that no longer exists also clears the cookie. */
function phoneFailure(failure: Failure): Response {
  const stale = failure.status === 401 || failure.status === 410;
  return failureResponse(failure, stale ? { 'Set-Cookie': clearedSessionCookie() } : undefined);
}

function respond<T>(result: Result<T>, status = 200): Response {
  return result.ok ? json(result.value, { status }) : phoneFailure(result);
}

function respondEmpty(result: Result<unknown>, headers?: Record<string, string>): Response {
  return result.ok ? empty({ headers }) : phoneFailure(result);
}

function phoneAction(request: Request, env: Env, path: string): PhoneAction | null {
  const method = request.method;
  if (path === '/api/session' && method === 'GET') {
    return async (aquarium, secret) => respond(await aquarium.session(secret));
  }
  if (path === '/api/leave' && method === 'POST') {
    return async (aquarium, secret) =>
      respondEmpty(await aquarium.leave(secret), { 'Set-Cookie': clearedSessionCookie() });
  }
  if (path === '/api/creatures' && method === 'GET') {
    return async (aquarium, secret) => respond(await aquarium.listCreatures(secret));
  }
  if (path === '/api/creatures' && method === 'POST') {
    return (aquarium, secret) => reserveCreature(request, aquarium, secret);
  }
  const match = CREATURE_PATH.exec(path);
  const id = match?.[1];
  if (!match || !id) return null;
  const image = match[2] === '/image';
  if (!image && method === 'GET') {
    return async (aquarium, secret) => {
      const result = await aquarium.getCreature(secret, id);
      return result.ok
        ? json({ creature: result.value } satisfies CreatureResponse)
        : phoneFailure(result);
    };
  }
  if (!image && method === 'DELETE') {
    return async (aquarium, secret) => respondEmpty(await aquarium.deleteCreature(secret, id));
  }
  if (image && method === 'PUT') {
    return (aquarium, secret) => uploadImage(request, aquarium, secret, id);
  }
  if (image && method === 'GET') {
    return async (aquarium, secret) =>
      serveImage(env, await aquarium.imageLocation(secret, 'phone', id));
  }
  return null;
}

export async function handlePhoneRequest(
  request: Request,
  env: Env,
  config: Config,
  path: string,
): Promise<Response> {
  if (request.method !== 'GET' && !isTrustedPhoneRequest(request, config.publicOrigin)) {
    return errorResponse(403, 'forbidden', 'Cross-site request rejected');
  }
  if (path === '/api/join') {
    return request.method === 'POST'
      ? join(request, env, config)
      : errorResponse(404, 'not_found', 'Not found');
  }
  const action = phoneAction(request, env, path);
  if (!action) return errorResponse(404, 'not_found', 'Not found');
  const credential = parseCredential(readCookie(request, SESSION_COOKIE));
  if (!credential) return errorResponse(401, 'unauthorized', 'Join an aquarium first');
  return action(env.AQUARIUMS.getByName(credential.aquariumId), credential.secret);
}

async function join(request: Request, env: Env, config: Config): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const limiterKey = config.ipHashKey ? await hashIp(ip, config.ipHashKey) : ip;
  if (!(await env.JOIN_LIMITER.limit({ key: limiterKey })).success) {
    return errorResponse(429, 'rate_limited', 'Too many attempts; wait a minute');
  }
  const parsed = joinRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, 'bad_request', 'Send the join code');
  const code = normalizeJoinCode(parsed.data.code);
  const aquariumId = code ? await env.JOIN_CODES.getByName(code).resolve() : null;
  if (!aquariumId) return errorResponse(404, 'not_found', 'Invalid or expired code');

  const existing = parseCredential(readCookie(request, SESSION_COOKIE));
  if (existing && existing.aquariumId !== aquariumId) {
    await env.AQUARIUMS.getByName(existing.aquariumId).leave(existing.secret);
  }
  const reuse = existing?.aquariumId === aquariumId ? existing.secret : null;
  const added = await env.AQUARIUMS.getByName(aquariumId).addPhone(reuse);
  if (!added.ok) return failureResponse(added);
  const body: JoinResponse = { aquariumId };
  return json(body, {
    headers: {
      'Set-Cookie': sessionCookie(formatCredential({ aquariumId, secret: added.value.secret })),
    },
  });
}

async function reserveCreature(
  request: Request,
  aquarium: Aquarium,
  secret: string,
): Promise<Response> {
  const parsed = createCreatureRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, 'bad_request', 'Invalid creature metadata');
  const result = await aquarium.reserveCreature(secret, parsed.data);
  if (!result.ok) return phoneFailure(result);
  const body: CreatureResponse = { creature: result.value.creature };
  return json(body, { status: result.value.created ? 201 : 200 });
}

async function uploadImage(
  request: Request,
  aquarium: Aquarium,
  secret: string,
  id: string,
): Promise<Response> {
  const bytes = await readBody(request, MAX_IMAGE_BYTES);
  if (!bytes) {
    return errorResponse(
      413,
      'payload_too_large',
      `Images must be at most ${MAX_IMAGE_BYTES} bytes`,
    );
  }
  const info = readPngHeader(bytes);
  if (!info) return errorResponse(415, 'unsupported_media_type', 'Only PNG images are accepted');
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
    return errorResponse(
      422,
      'invalid_image',
      `Images must be at most ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION} pixels`,
    );
  }
  const result = await aquarium.attachImage(secret, id, bytes, info);
  return result.ok
    ? json({ creature: result.value } satisfies CreatureResponse)
    : phoneFailure(result);
}
