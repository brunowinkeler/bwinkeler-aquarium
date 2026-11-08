import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import {
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  SESSION_COOKIE,
  createUlid,
  type CreateAquariumResponse,
  type JoinCodeResponse,
  type ServerMessage,
  type TvMessage,
} from '@bwinkeler-aquarium/shared';
import { expect } from 'vitest';

export const ORIGIN = 'https://aquarium.bwinkeler.com';

let ipCounter = 0;

/** Every request gets its own client IP, so per-IP limits never couple unrelated tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export function call(path: string, init: RequestInit = {}): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
}

export interface Tv {
  aquariumId: string;
  token: string;
}

export function tvHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function createAquarium(headers: Record<string, string> = {}): Promise<Tv> {
  const response = await call('/api/tv/aquariums', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': uniqueIp(), ...headers },
  });
  expect(response.status).toBe(201);
  const body = await response.json<CreateAquariumResponse>();
  return { aquariumId: body.aquariumId, token: body.token };
}

export async function issueJoinCode(token: string): Promise<string> {
  const response = await call('/api/tv/join-code', { method: 'POST', headers: tvHeaders(token) });
  expect(response.status).toBe(201);
  return (await response.json<JoinCodeResponse>()).code;
}

export function phoneHeaders(cookie?: string): Record<string, string> {
  return {
    Origin: ORIGIN,
    [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
    'CF-Connecting-IP': uniqueIp(),
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

export function postJson(path: string, body: unknown, headers: Record<string, string>) {
  return call(path, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function cookieFrom(response: Response): string {
  const match = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(
    response.headers.get('Set-Cookie') ?? '',
  );
  return `${SESSION_COOKIE}=${match?.[1] ?? ''}`;
}

export async function joinPhone(code: string, cookie?: string): Promise<string> {
  const response = await postJson('/api/join', { code }, phoneHeaders(cookie));
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

export async function aquariumWithPhone(): Promise<{ tv: Tv; cookie: string }> {
  const tv = await createAquarium();
  const cookie = await joinPhone(await issueJoinCode(tv.token));
  return { tv, cookie };
}

/** Minimal PNG: signature plus IHDR, which is all the Worker inspects. */
export function png(width: number, height: number, size = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, 33));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

export function reserve(
  cookie: string,
  overrides: Partial<{
    id: string;
    width: number;
    height: number;
    author: string | null;
    size: string;
  }> = {},
) {
  return postJson(
    '/api/creatures',
    {
      id: createUlid(),
      kind: 'swim',
      facing: 'right',
      author: 'Olivia',
      width: 64,
      height: 48,
      ...overrides,
    },
    phoneHeaders(cookie),
  );
}

export function upload(cookie: string, id: string, body: Uint8Array) {
  return call(`/api/creatures/${id}/image`, {
    method: 'PUT',
    headers: phoneHeaders(cookie),
    body,
  });
}

export async function sendCreature(cookie: string): Promise<string> {
  const id = createUlid();
  expect((await reserve(cookie, { id })).status).toBe(201);
  expect((await upload(cookie, id, png(64, 48))).status).toBe(200);
  return id;
}

export function aquariumStub(aquariumId: string) {
  return env.AQUARIUMS.getByName(aquariumId);
}

export async function setExpiry(aquariumId: string, expiresAt: number): Promise<void> {
  await runInDurableObject(aquariumStub(aquariumId), (_instance, state) => {
    state.storage.sql.exec('UPDATE meta SET expires_at = ?', expiresAt);
  });
}

export async function storedKeys(aquariumId: string): Promise<string[]> {
  const listing = await env.IMAGES.list({ prefix: `aquariums/${aquariumId}/` });
  return listing.objects.map((object) => object.key);
}

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export class TvSocket {
  private readonly messages: ServerMessage[] = [];
  private readonly listeners = new Set<() => void>();
  closeEvent: { code: number; reason: string } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      this.messages.push(JSON.parse(event.data as string) as ServerMessage);
      this.notify();
    });
    ws.addEventListener('close', (event) => {
      this.closeEvent = { code: event.code, reason: event.reason };
      this.notify();
    });
  }

  send(message: TvMessage | string): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private waitUntil<R>(check: () => R | undefined, what: string, timeoutMs = 3000): Promise<R> {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const result = check();
        if (result === undefined) return;
        this.listeners.delete(attempt);
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        this.listeners.delete(attempt);
        reject(new Error(`Timed out waiting for ${what}`));
      }, timeoutMs);
      this.listeners.add(attempt);
      attempt();
    });
  }

  /** Resolves with (and consumes) the first matching message. */
  next<T extends ServerMessage['type']>(
    type: T,
    predicate: (message: MessageOf<T>) => boolean = () => true,
  ): Promise<MessageOf<T>> {
    return this.waitUntil(() => {
      const index = this.messages.findIndex(
        (message) => message.type === type && predicate(message as MessageOf<T>),
      );
      return index === -1 ? undefined : (this.messages.splice(index, 1)[0] as MessageOf<T>);
    }, `a ${type} message`);
  }

  closed(): Promise<{ code: number; reason: string }> {
    return this.waitUntil(() => this.closeEvent ?? undefined, 'the socket to close');
  }
}

export async function openSocket(aquariumId: string): Promise<TvSocket> {
  const response = await call(`/ws/tv/${aquariumId}`, { headers: { Upgrade: 'websocket' } });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  if (!ws) throw new Error('The response has no WebSocket');
  ws.accept();
  return new TvSocket(ws);
}

export async function connectTv(
  tv: Tv,
): Promise<{ socket: TvSocket; snapshot: MessageOf<'snapshot'> }> {
  const socket = await openSocket(tv.aquariumId);
  socket.send({ type: 'auth', token: tv.token });
  return { socket, snapshot: await socket.next('snapshot') };
}

export async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Condition not met in time');
}
