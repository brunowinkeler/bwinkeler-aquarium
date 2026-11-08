import { DurableObject } from 'cloudflare:workers';
import { deletePrefix, migrate } from './storage.js';

export const REGISTRY_NAME = 'global';

const DAY_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'aquariums/';

const MIGRATIONS = [
  `CREATE TABLE live (
    aquarium_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE creations (
    ip_key TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (ip_key, day)
  );`,
];

export interface RegistryLimits {
  maxLive: number;
  perIpPerDay: number;
}

export type RegisterResult = { ok: true } | { ok: false; reason: 'capacity' | 'quota' };

/** Single instance: live aquariums, per-IP daily creation quotas and the daily orphan sweep. */
export class RegistryDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage.sql, MIGRATIONS);
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  async register(
    aquariumId: string,
    ipKey: string,
    limits: RegistryLimits,
  ): Promise<RegisterResult> {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const live = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM live').one().n;
    if (live >= limits.maxLive) return { ok: false, reason: 'capacity' };
    const used =
      this.sql
        .exec<{ count: number }>(
          'SELECT count FROM creations WHERE ip_key = ? AND day = ?',
          ipKey,
          day,
        )
        .toArray()[0]?.count ?? 0;
    if (used >= limits.perIpPerDay) return { ok: false, reason: 'quota' };

    this.sql.exec(
      `INSERT INTO creations (ip_key, day, count) VALUES (?, ?, 1)
       ON CONFLICT (ip_key, day) DO UPDATE SET count = count + 1`,
      ipKey,
      day,
    );
    this.sql.exec('INSERT INTO live (aquarium_id, created_at) VALUES (?, ?)', aquariumId, now);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + DAY_MS);
    }
    return { ok: true };
  }

  unregister(aquariumId: string): void {
    this.sql.exec('DELETE FROM live WHERE aquarium_id = ?', aquariumId);
  }

  liveCount(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM live').one().n;
  }

  ping(): boolean {
    return true;
  }

  override async alarm(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    this.sql.exec('DELETE FROM creations WHERE day < ?', today);
    await this.forgetDeadAquariums();
    await this.sweepOrphans();
    await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }

  /** Safety net for an aquarium that ended without unregistering. */
  private async forgetDeadAquariums(): Promise<void> {
    const ids = this.sql
      .exec<{ aquarium_id: string }>('SELECT aquarium_id FROM live')
      .toArray()
      .map((row) => row.aquarium_id);
    for (const id of ids) {
      if (!(await this.env.AQUARIUMS.getByName(id).isAlive())) this.unregister(id);
    }
  }

  /** Deletes R2 prefixes that belong to no live aquarium (interrupted cleanups). */
  async sweepOrphans(): Promise<number> {
    let removed = 0;
    let cursor: string | undefined;
    do {
      const listing = await this.env.IMAGES.list({ prefix: PREFIX, delimiter: '/', cursor });
      for (const prefix of listing.delimitedPrefixes) {
        const aquariumId = prefix.slice(PREFIX.length, -1);
        const live =
          this.sql.exec('SELECT 1 FROM live WHERE aquarium_id = ?', aquariumId).toArray().length >
          0;
        if (!live) removed += await deletePrefix(this.env.IMAGES, prefix);
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
    return removed;
  }
}
