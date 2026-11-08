import { DurableObject } from 'cloudflare:workers';

interface JoinCodeEntry {
  aquariumId: string;
  expiresAt: number;
}

const ENTRY_KEY = 'entry';

/** One object per join code (`getByName(code)`); it forgets the code when it expires. */
export class JoinCodeDO extends DurableObject<Env> {
  async claim(aquariumId: string, expiresAt: number): Promise<boolean> {
    const current = this.ctx.storage.kv.get<JoinCodeEntry>(ENTRY_KEY);
    if (current && current.expiresAt > Date.now()) return false;
    this.ctx.storage.kv.put(ENTRY_KEY, { aquariumId, expiresAt } satisfies JoinCodeEntry);
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  resolve(): string | null {
    const entry = this.ctx.storage.kv.get<JoinCodeEntry>(ENTRY_KEY);
    return entry && entry.expiresAt > Date.now() ? entry.aquariumId : null;
  }

  override async alarm(): Promise<void> {
    const entry = this.ctx.storage.kv.get<JoinCodeEntry>(ENTRY_KEY);
    if (entry && entry.expiresAt > Date.now()) {
      await this.ctx.storage.setAlarm(entry.expiresAt);
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}
