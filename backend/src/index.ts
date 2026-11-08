import { readConfig, type Config } from './config.js';
import { TV_CORS_HEADERS, errorResponse, json, withHeaders } from './http.js';
import { log } from './log.js';
import { handlePhoneRequest } from './phone-routes.js';
import { REGISTRY_NAME } from './registry-do.js';
import { handleTvRequest, handleTvSocket } from './tv-routes.js';

export { AquariumDO } from './aquarium-do.js';
export { JoinCodeDO } from './join-code-do.js';
export { RegistryDO } from './registry-do.js';

const READY_TIMEOUT_MS = 2000;

async function settlesInTime(promise: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => false,
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function ready(env: Env, config: Config): Promise<Response> {
  const [r2, durableObjects] = await Promise.all([
    settlesInTime(env.IMAGES.head('health/ready')),
    settlesInTime(env.REGISTRY.getByName(REGISTRY_NAME).ping()),
  ]);
  const checks = { r2, durableObjects, secrets: config.ipHashKey !== null };
  const healthy = r2 && durableObjects && checks.secrets;
  return json({ status: healthy ? 'ok' : 'unavailable', checks }, { status: healthy ? 200 : 503 });
}

async function route(request: Request, env: Env, path: string): Promise<Response> {
  const config = readConfig(env);
  if (path.startsWith('/api/tv/')) return handleTvRequest(request, env, config, path);
  if (path.startsWith('/ws/tv/')) return handleTvSocket(request, env, path);
  if (path.startsWith('/api/')) return handlePhoneRequest(request, env, config, path);
  if (path === '/health/live') return json({ status: 'ok' });
  if (path === '/health/ready') return ready(env, config);
  return errorResponse(404, 'not_found', 'Not found');
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    let response: Response;
    try {
      response = await route(request, env, path);
    } catch (error) {
      log('unhandled_error', {
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      response = errorResponse(500, 'internal', 'Something went wrong');
    }
    return path.startsWith('/api/tv/') ? withHeaders(response, TV_CORS_HEADERS) : response;
  },
} satisfies ExportedHandler<Env>;
