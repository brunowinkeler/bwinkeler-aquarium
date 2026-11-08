export interface Config {
  publicOrigin: string;
  reconnectWindowMs: number;
  maxLiveAquariums: number;
  creationsPerIpPerDay: number;
  maxPhones: number;
  uploadsPerHour: number;
  ipHashKey: string | null;
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readConfig(env: Env): Config {
  // IP_HASH_KEY is a secret, so it is absent from the generated Env type.
  const secrets = env as { IP_HASH_KEY?: string };
  return {
    publicOrigin: env.PUBLIC_ORIGIN,
    reconnectWindowMs: positive(env.RECONNECT_WINDOW_HOURS, 4) * 60 * 60 * 1000,
    maxLiveAquariums: positive(env.MAX_LIVE_AQUARIUMS, 50),
    creationsPerIpPerDay: positive(env.CREATIONS_PER_IP_PER_DAY, 10),
    maxPhones: positive(env.MAX_PHONES, 10),
    uploadsPerHour: positive(env.UPLOADS_PER_HOUR, 60),
    ipHashKey: secrets.IP_HASH_KEY ? secrets.IP_HASH_KEY : null,
  };
}
