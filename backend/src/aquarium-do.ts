import { DurableObject } from 'cloudflare:workers';
import {
  MAX_ACTIVE_CREATURES,
  WS_AUTH_TIMEOUT_MS,
  WS_CLOSE,
  WS_MAX_MESSAGE_BYTES,
  WS_PING,
  WS_PONG,
  type CreateCreatureRequest,
  type Creature,
  type CreatureKind,
  type CreatureListResponse,
  type CreatureSize,
  type CreatureStatus,
  type EndReason,
  type Facing,
  type PhoneCreature,
  type ServerMessage,
  type SessionResponse,
} from '@bwinkeler-aquarium/shared';
import { tvMessageSchema } from '@bwinkeler-aquarium/shared/schemas';
import { readConfig, type Config } from './config.js';
import { hashSecret, newSecret, parseCredential } from './credentials.js';
import { log } from './log.js';
import type { PngInfo } from './png.js';
import { REGISTRY_NAME } from './registry-do.js';
import { fail, ok, type Result } from './result.js';
import { deletePrefix, migrate, tableExists } from './storage.js';

type Role = 'tv' | 'phone';

type MetaRow = {
  aquarium_id: string;
  revision: number;
  created_at: number;
  expires_at: number | null;
};

type CreatureRow = {
  id: string;
  kind: string;
  facing: string;
  size: string;
  author: string | null;
  width: number;
  height: number;
  status: string;
  object_key: string | null;
  created_by: string;
  created_at: number;
  displayed_at: number | null;
};

interface SocketAttachment {
  /** TV device id once the socket has authenticated. */
  deviceId: string | null;
  connectedAt: number;
}

interface Authorized {
  meta: MetaRow;
  deviceId: string;
}

export interface ImageLocation {
  objectKey: string;
}

const HOUR_MS = 60 * 60 * 1000;
const WS_OPEN = 1;
const CREATURE_COLUMNS =
  'id, kind, facing, size, author, width, height, status, object_key, created_by, created_at, displayed_at';

const MIGRATIONS = [
  `CREATE TABLE meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    aquarium_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('tv', 'phone')),
    secret_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE creatures (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    facing TEXT NOT NULL,
    author TEXT,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
    object_key TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    displayed_at INTEGER
  );
  CREATE INDEX creatures_by_activation ON creatures (status, activated_at);
  CREATE TABLE upload_log (at INTEGER NOT NULL);`,
  `ALTER TABLE creatures ADD COLUMN size TEXT NOT NULL DEFAULT 'small';`,
];

const GONE = fail(410, 'gone', 'This aquarium has ended');

function toCreature(row: CreatureRow): Creature {
  return {
    id: row.id,
    kind: row.kind as CreatureKind,
    facing: row.facing as Facing,
    size: row.size as CreatureSize,
    author: row.author,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    displayedAt: row.displayed_at,
  };
}

function toPhoneCreature(row: CreatureRow, deviceId: string): PhoneCreature {
  return {
    ...toCreature(row),
    status: row.status as CreatureStatus,
    mine: row.created_by === deviceId,
  };
}

function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/**
 * One object per aquarium (`getByName(aquariumId)`). Storage without the `meta` table means
 * "no such aquarium": only `create()` ever writes the schema, so stray requests never
 * resurrect an ended aquarium.
 */
export class AquariumDO extends DurableObject<Env> {
  private readonly config: Config;
  private ready = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.config = readConfig(env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
    if (tableExists(ctx.storage.sql, 'meta')) {
      migrate(ctx.storage.sql, MIGRATIONS);
      this.ready = true;
    }
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  async create(aquariumId: string): Promise<Result<{ secret: string }>> {
    if (this.ready) return fail(409, 'conflict', 'Aquarium already exists');
    const secret = newSecret();
    const secretHash = await hashSecret(secret);
    const now = Date.now();
    migrate(this.sql, MIGRATIONS);
    this.ready = true;
    this.sql.exec(
      'INSERT INTO meta (id, aquarium_id, revision, created_at, expires_at) VALUES (1, ?, 0, ?, ?)',
      aquariumId,
      now,
      now + this.config.reconnectWindowMs,
    );
    this.sql.exec(
      "INSERT INTO devices (id, role, secret_hash, created_at) VALUES (?, 'tv', ?, ?)",
      crypto.randomUUID(),
      secretHash,
      now,
    );
    await this.scheduleAlarm();
    return ok({ secret });
  }

  isAlive(): boolean {
    return this.meta() !== null;
  }

  async verifyTv(secret: string): Promise<Result<null>> {
    const auth = await this.authorize(secret, 'tv');
    return auth.ok ? ok(null) : auth;
  }

  async end(tvSecret: string): Promise<Result<null>> {
    const auth = await this.authorize(tvSecret, 'tv');
    if (!auth.ok) return auth;
    await this.destroy('ended');
    return ok(null);
  }

  /** Reuses the caller's session when it already belongs to this aquarium. */
  async addPhone(existingSecret: string | null): Promise<Result<{ secret: string }>> {
    const existingHash = existingSecret ? await hashSecret(existingSecret) : null;
    const secret = newSecret();
    const secretHash = await hashSecret(secret);
    if (!this.meta()) return GONE;
    if (existingSecret && existingHash && this.deviceIdByHash(existingHash, 'phone')) {
      return ok({ secret: existingSecret });
    }
    if (this.phoneCount() >= this.config.maxPhones) {
      return fail(409, 'phone_limit', 'This aquarium already has the maximum number of phones');
    }
    this.sql.exec(
      "INSERT INTO devices (id, role, secret_hash, created_at) VALUES (?, 'phone', ?, ?)",
      crypto.randomUUID(),
      secretHash,
      Date.now(),
    );
    this.broadcastPhones();
    return ok({ secret });
  }

  async leave(phoneSecret: string): Promise<Result<null>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    this.sql.exec('DELETE FROM devices WHERE id = ?', auth.value.deviceId);
    this.broadcastPhones();
    return ok(null);
  }

  async disconnectPhones(tvSecret: string): Promise<Result<null>> {
    const auth = await this.authorize(tvSecret, 'tv');
    if (!auth.ok) return auth;
    const removed = this.sql.exec("DELETE FROM devices WHERE role = 'phone'").rowsWritten;
    if (removed > 0) this.broadcastPhones();
    return ok(null);
  }

  async session(phoneSecret: string): Promise<Result<SessionResponse>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const { meta } = auth.value;
    return ok({
      aquariumId: meta.aquarium_id,
      tvConnected: this.hasTvSocket(),
      expiresAt: meta.expires_at,
      phoneCount: this.phoneCount(),
      creatureCount: this.activeCount(),
      capacity: MAX_ACTIVE_CREATURES,
    });
  }

  async listCreatures(phoneSecret: string): Promise<Result<CreatureListResponse>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const creatures = this.activeCreatures().map((row) =>
      toPhoneCreature(row, auth.value.deviceId),
    );
    return ok({ creatures, capacity: MAX_ACTIVE_CREATURES });
  }

  async getCreature(phoneSecret: string, id: string): Promise<Result<PhoneCreature>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const row = this.creatureRow(id);
    return row
      ? ok(toPhoneCreature(row, auth.value.deviceId))
      : fail(404, 'not_found', 'No such creature');
  }

  /** Idempotent on the phone-generated ULID. */
  async reserveCreature(
    phoneSecret: string,
    input: CreateCreatureRequest,
  ): Promise<Result<{ creature: PhoneCreature; created: boolean }>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const { deviceId } = auth.value;
    const existing = this.creatureRow(input.id);
    if (existing) {
      const same =
        existing.created_by === deviceId &&
        existing.kind === input.kind &&
        existing.facing === input.facing &&
        existing.size === input.size &&
        existing.author === input.author &&
        existing.width === input.width &&
        existing.height === input.height;
      return same
        ? ok({ creature: toPhoneCreature(existing, deviceId), created: false })
        : fail(409, 'conflict', 'Another creature already uses this ID');
    }

    const now = Date.now();
    this.sql.exec('DELETE FROM upload_log WHERE at <= ?', now - HOUR_MS);
    this.sql.exec(
      "DELETE FROM creatures WHERE status = 'pending' AND created_at <= ?",
      now - HOUR_MS,
    );
    const uploads = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM upload_log').one().n;
    if (uploads >= this.config.uploadsPerHour) {
      return fail(429, 'rate_limited', 'Too many drawings this hour; try again later');
    }
    this.sql.exec('INSERT INTO upload_log (at) VALUES (?)', now);
    this.sql.exec(
      `INSERT INTO creatures (id, kind, facing, size, author, width, height, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      input.id,
      input.kind,
      input.facing,
      input.size,
      input.author,
      input.width,
      input.height,
      deviceId,
      now,
    );
    const row = this.creatureRow(input.id);
    if (!row) return fail(500, 'internal', 'Creature was not stored');
    return ok({ creature: toPhoneCreature(row, deviceId), created: true });
  }

  /** The Worker already checked the size limit and the PNG header. */
  async attachImage(
    phoneSecret: string,
    id: string,
    image: Uint8Array,
    info: PngInfo,
  ): Promise<Result<PhoneCreature>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const { meta, deviceId } = auth.value;
    const row = this.creatureRow(id);
    if (!row) return fail(404, 'not_found', 'Reserve the creature before uploading its image');
    if (row.created_by !== deviceId)
      return fail(403, 'forbidden', 'This creature belongs to another phone');
    if (row.status === 'active') return ok(toPhoneCreature(row, deviceId));
    if (info.width !== row.width || info.height !== row.height) {
      return fail(422, 'invalid_image', 'The image size does not match the reserved creature');
    }

    const objectKey = `aquariums/${meta.aquarium_id}/creatures/${id}.png`;
    await this.env.IMAGES.put(objectKey, image, { httpMetadata: { contentType: 'image/png' } });

    // The aquarium may have ended, or a retry may have won, while R2 was busy.
    const current = this.meta() ? this.creatureRow(id) : null;
    if (!current) {
      await this.env.IMAGES.delete(objectKey);
      return this.meta() ? fail(404, 'not_found', 'The creature was removed') : GONE;
    }
    if (current.status !== 'active') {
      this.sql.exec(
        "UPDATE creatures SET status = 'active', object_key = ?, activated_at = ? WHERE id = ?",
        objectKey,
        Date.now(),
        id,
      );
      const activated = this.creatureRow(id);
      if (!activated) return fail(500, 'internal', 'Creature was not stored');
      this.broadcast({
        type: 'creature_added',
        revision: this.bumpRevision(),
        creature: toCreature(activated),
      });
      await this.evictOverflow();
      return ok(toPhoneCreature(activated, deviceId));
    }
    return ok(toPhoneCreature(current, deviceId));
  }

  async deleteCreature(phoneSecret: string, id: string): Promise<Result<null>> {
    const auth = await this.authorize(phoneSecret, 'phone');
    if (!auth.ok) return auth;
    const row = this.creatureRow(id);
    if (!row) return fail(404, 'not_found', 'No such creature');
    this.sql.exec('DELETE FROM creatures WHERE id = ?', id);
    if (row.status === 'active') {
      this.broadcast({
        type: 'creature_removed',
        revision: this.bumpRevision(),
        id,
        reason: 'deleted',
      });
    }
    if (row.object_key) await this.env.IMAGES.delete(row.object_key);
    return ok(null);
  }

  async imageLocation(secret: string, role: Role, id: string): Promise<Result<ImageLocation>> {
    const auth = await this.authorize(secret, role);
    if (!auth.ok) return auth;
    const row = this.creatureRow(id);
    if (!row || row.status !== 'active' || !row.object_key) {
      return fail(404, 'not_found', 'No such creature');
    }
    return ok({ objectKey: row.object_key });
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!this.meta()) {
      // Browsers hide the status of a refused upgrade, so a TV could only retry forever;
      // close code 4010 tells it that the aquarium is gone.
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
      server.accept();
      server.close(WS_CLOSE.ended, 'This aquarium has ended');
      return new Response(null, { status: 101, webSocket: client });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      deviceId: null,
      connectedAt: Date.now(),
    } satisfies SocketAttachment);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (
      typeof message !== 'string' ||
      new TextEncoder().encode(message).byteLength > WS_MAX_MESSAGE_BYTES
    ) {
      closeSocket(ws, 1009, 'Message rejected');
      return;
    }
    let parsed: ReturnType<typeof tvMessageSchema.safeParse>;
    try {
      parsed = tvMessageSchema.safeParse(JSON.parse(message));
    } catch {
      closeSocket(ws, 1008, 'Invalid message');
      return;
    }
    if (!parsed.success) {
      closeSocket(ws, 1008, 'Invalid message');
      return;
    }
    const data = parsed.data;
    const attachment = this.attachment(ws);
    if (!attachment?.deviceId) {
      if (data.type === 'auth') await this.authenticateSocket(ws, data.token);
      else closeSocket(ws, WS_CLOSE.unauthorized, 'Authenticate first');
      return;
    }

    const meta = this.meta();
    if (!meta || !this.deviceExists(attachment.deviceId)) {
      closeSocket(ws, WS_CLOSE.unauthorized, 'Device is no longer valid');
      return;
    }
    switch (data.type) {
      case 'auth':
        return;
      case 'ping':
        ws.send(WS_PONG);
        return;
      case 'sync':
        ws.send(JSON.stringify(this.snapshot(meta)));
        return;
      case 'displayed':
        this.sql.exec(
          "UPDATE creatures SET displayed_at = ? WHERE id = ? AND status = 'active' AND displayed_at IS NULL",
          Date.now(),
          data.id,
        );
        return;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  override async alarm(): Promise<void> {
    const meta = this.meta();
    if (!meta) return;
    const now = Date.now();
    for (const ws of this.openSockets()) {
      const attachment = this.attachment(ws);
      if (
        attachment &&
        !attachment.deviceId &&
        attachment.connectedAt + WS_AUTH_TIMEOUT_MS <= now
      ) {
        closeSocket(ws, WS_CLOSE.authTimeout, 'Authentication timeout');
      }
    }
    if (meta.expires_at !== null && meta.expires_at <= now && !this.hasTvSocket()) {
      await this.destroy('expired');
      return;
    }
    await this.scheduleAlarm();
  }

  private async authenticateSocket(ws: WebSocket, token: string): Promise<void> {
    const credential = parseCredential(token);
    const secretHash = credential ? await hashSecret(credential.secret) : null;
    const meta = this.meta();
    if (!meta) {
      closeSocket(ws, WS_CLOSE.ended, 'This aquarium has ended');
      return;
    }
    const deviceId =
      credential && secretHash && credential.aquariumId === meta.aquarium_id
        ? this.deviceIdByHash(secretHash, 'tv')
        : null;
    const attachment = this.attachment(ws);
    if (!deviceId || !attachment) {
      closeSocket(ws, WS_CLOSE.unauthorized, 'Invalid token');
      return;
    }
    for (const other of this.openSockets()) {
      if (other !== ws && this.attachment(other)?.deviceId) {
        closeSocket(other, WS_CLOSE.replaced, 'Replaced by a newer connection');
      }
    }
    ws.serializeAttachment({
      deviceId,
      connectedAt: attachment.connectedAt,
    } satisfies SocketAttachment);
    this.sql.exec('UPDATE meta SET expires_at = NULL');
    ws.send(JSON.stringify(this.snapshot({ ...meta, expires_at: null })));
    await this.scheduleAlarm();
  }

  /** The aquarium enters `Waiting` when its last TV socket goes away. */
  private async onSocketGone(ws: WebSocket): Promise<void> {
    const meta = this.meta();
    if (!meta) return;
    if (this.attachment(ws)?.deviceId && !this.hasTvSocket(ws) && meta.expires_at === null) {
      this.sql.exec('UPDATE meta SET expires_at = ?', Date.now() + this.config.reconnectWindowMs);
    }
    await this.scheduleAlarm(ws);
  }

  private meta(): MetaRow | null {
    if (!this.ready) return null;
    return (
      this.sql
        .exec<MetaRow>('SELECT aquarium_id, revision, created_at, expires_at FROM meta')
        .toArray()[0] ?? null
    );
  }

  private async authorize(secret: string, role: Role): Promise<Result<Authorized>> {
    const secretHash = await hashSecret(secret);
    const meta = this.meta();
    if (!meta) return GONE;
    const deviceId = this.deviceIdByHash(secretHash, role);
    if (!deviceId) return fail(401, 'unauthorized', 'This device is not part of the aquarium');
    return ok({ meta, deviceId });
  }

  private deviceIdByHash(secretHash: string, role: Role): string | null {
    const row = this.sql
      .exec<{ id: string }>(
        'SELECT id FROM devices WHERE secret_hash = ? AND role = ?',
        secretHash,
        role,
      )
      .toArray()[0];
    return row?.id ?? null;
  }

  private deviceExists(deviceId: string): boolean {
    return this.sql.exec('SELECT 1 FROM devices WHERE id = ?', deviceId).toArray().length > 0;
  }

  private phoneCount(): number {
    return this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE role = 'phone'")
      .one().n;
  }

  private activeCount(): number {
    return this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM creatures WHERE status = 'active'")
      .one().n;
  }

  private activeCreatures(): CreatureRow[] {
    return this.sql
      .exec<CreatureRow>(
        `SELECT ${CREATURE_COLUMNS} FROM creatures WHERE status = 'active' ORDER BY activated_at, id`,
      )
      .toArray();
  }

  private creatureRow(id: string): CreatureRow | null {
    return (
      this.sql
        .exec<CreatureRow>(`SELECT ${CREATURE_COLUMNS} FROM creatures WHERE id = ?`, id)
        .toArray()[0] ?? null
    );
  }

  private bumpRevision(): number {
    return this.sql
      .exec<{ revision: number }>('UPDATE meta SET revision = revision + 1 RETURNING revision')
      .one().revision;
  }

  private snapshot(meta: MetaRow): ServerMessage {
    return {
      type: 'snapshot',
      revision: meta.revision,
      creatures: this.activeCreatures().map(toCreature),
      phoneCount: this.phoneCount(),
    };
  }

  private async evictOverflow(): Promise<void> {
    const overflow = this.activeCount() - MAX_ACTIVE_CREATURES;
    if (overflow <= 0) return;
    const victims = this.sql
      .exec<{ id: string; object_key: string | null }>(
        "SELECT id, object_key FROM creatures WHERE status = 'active' ORDER BY activated_at, id LIMIT ?",
        overflow,
      )
      .toArray();
    for (const victim of victims) {
      this.sql.exec('DELETE FROM creatures WHERE id = ?', victim.id);
      this.broadcast({
        type: 'creature_removed',
        revision: this.bumpRevision(),
        id: victim.id,
        reason: 'capacity',
      });
    }
    const keys = victims.flatMap((victim) => (victim.object_key ? [victim.object_key] : []));
    if (keys.length > 0) await this.env.IMAGES.delete(keys);
  }

  private broadcastPhones(): void {
    this.broadcast({
      type: 'phones_changed',
      revision: this.bumpRevision(),
      phoneCount: this.phoneCount(),
    });
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.openSockets()) {
      if (!this.attachment(ws)?.deviceId) continue;
      try {
        ws.send(data);
      } catch {
        // The close handler cleans up.
      }
    }
  }

  private attachment(ws: WebSocket): SocketAttachment | null {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
  }

  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WS_OPEN);
  }

  private hasTvSocket(except?: WebSocket): boolean {
    return this.openSockets(except).some((ws) => this.attachment(ws)?.deviceId);
  }

  /** One alarm serves both the expiry deadline and the authentication timeout. */
  private async scheduleAlarm(except?: WebSocket): Promise<void> {
    const meta = this.meta();
    if (!meta) return;
    let next = meta.expires_at ?? Number.POSITIVE_INFINITY;
    for (const ws of this.openSockets(except)) {
      const attachment = this.attachment(ws);
      if (attachment && !attachment.deviceId) {
        next = Math.min(next, attachment.connectedAt + WS_AUTH_TIMEOUT_MS);
      }
    }
    if (next === Number.POSITIVE_INFINITY) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  /**
   * Ending and expiry share one path. Storage goes first: the R2 and registry calls below let
   * other requests in, and they must already find the aquarium gone. If the cleanup after it
   * is interrupted, the registry's daily sweep finishes it.
   */
  private async destroy(reason: EndReason): Promise<void> {
    const meta = this.meta();
    if (!meta) return;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.ready = false;
    const ended = JSON.stringify({ type: 'aquarium_ended', reason } satisfies ServerMessage);
    for (const ws of this.openSockets()) {
      if (this.attachment(ws)?.deviceId) {
        try {
          ws.send(ended);
        } catch {
          // Closing anyway.
        }
      }
      closeSocket(ws, WS_CLOSE.ended, 'Aquarium ended');
    }
    await this.env.REGISTRY.getByName(REGISTRY_NAME).unregister(meta.aquarium_id);
    await deletePrefix(this.env.IMAGES, `aquariums/${meta.aquarium_id}/`);
    log('aquarium_ended', { aquariumId: meta.aquarium_id, reason });
  }
}
