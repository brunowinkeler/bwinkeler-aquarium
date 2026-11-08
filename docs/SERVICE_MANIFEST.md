# Service Manifest: Aquarium

## Identity

- Platform architecture version: 1.3
- Service ID: `aquarium`
- Product name: Aquarium
- Repository: https://github.com/brunowinkeler/bwinkeler-aquarium (public)
- Owner: Bruno Winkeler
- Criticality: experimental

## Publication

- Production origin: https://aquarium.bwinkeler.com
- Hosting: Cloudflare Worker `bwinkeler-aquarium` on a Worker Custom Domain (ADR 001)
- VPS dependency: none; Caddy route: none
- API prefix: `/api` (phone, same origin) and `/api/tv` (TV, CORS `*`, bearer token)
- WebSocket path: `/ws/tv/{aquariumId}` (TV only)
- Static assets: none yet; the PWA and the `/tv/` browser build will be served by the same Worker
- TV client: packaged webOS app `com.bwinkeler.aquarium`, installed in Developer Mode (ADR 002)

## Containers

None. The service runs on Cloudflare Workers (ADR 001).

## Database

- Engine: SQLite inside Durable Objects, instead of the platform PostgreSQL (ADR 001)
- `AquariumDO`: one object per aquarium (`getByName(aquariumId)`): `meta`, `devices`, `creatures`,
  `upload_log`
- `JoinCodeDO`: one object per join code (`getByName(code)`), key-value storage, expires with an alarm
- `RegistryDO`: one object (`getByName("global")`): live aquariums and per-IP daily creation counters
- Migrations: forward-only SQL embedded in the code and tracked in `_sql_schema_migrations`;
  Durable Object classes are declared in `backend/wrangler.jsonc` (`migrations`, tag `v1`)
- Expected size: under 100 KB per aquarium; at most 50 live aquariums
- Backup class: none; data is short-lived by design (ADR 001)

## Redis/queue

- Required: no
- Reason: Durable Object alarms cover expiry, the authentication timeout and the daily sweep

## Object storage

- Required: yes
- Bucket: private R2 bucket `bwinkeler-aquarium-files`, binding `IMAGES` (no credentials in code)
- Keys: `aquariums/{aquariumId}/creatures/{creatureId}.png`
- Data classification: private; served only through the authorized proxy routes
- Lifecycle: deleted when a creature is removed or evicted and when its aquarium ends or expires;
  a daily sweep deletes prefixes of aquariums that are no longer live
- Upper bound with default limits: 50 aquariums × 20 creatures × 1.5 MB = 1.5 GB

## Configuration contract

| Variable                   | Secret | Required | Scope   | Description                                                     |
| -------------------------- | -----: | -------: | ------- | --------------------------------------------------------------- |
| `PUBLIC_ORIGIN`            |     no |      yes | runtime | Origin accepted for state-changing phone requests               |
| `RECONNECT_WINDOW_HOURS`   |     no |       no | runtime | Time an aquarium waits for its TV before expiring (default 4)   |
| `MAX_LIVE_AQUARIUMS`       |     no |       no | runtime | Live aquariums in the whole system (default 50)                 |
| `CREATIONS_PER_IP_PER_DAY` |     no |       no | runtime | Daily aquarium creations per IP (default 10)                    |
| `MAX_PHONES`               |     no |       no | runtime | Phones per aquarium (default 10)                                |
| `UPLOADS_PER_HOUR`         |     no |       no | runtime | Creatures per aquarium and hour (default 60)                    |
| `IP_HASH_KEY`              |    yes |      yes | runtime | HMAC key for per-IP quota keys; creation is disabled without it |
| `CLOUDFLARE_ACCOUNT_ID`    |     no |      yes | deploy  | GitHub `production` environment                                 |
| `CLOUDFLARE_API_TOKEN`     |    yes |      yes | deploy  | Workers scripts and Custom Domains on the `bwinkeler.com` zone  |

Bindings: `AQUARIUMS`, `JOIN_CODES`, `REGISTRY` (Durable Objects), `IMAGES` (R2), `CREATE_LIMITER`
(3 per minute) and `JOIN_LIMITER` (10 per minute) rate-limit bindings.

## Health and operations

- Liveness: `GET /health/live`
- Readiness: `GET /health/ready` (R2, a Durable Object round trip and the required secret, 2 s timeout)
- Smoke test: create an aquarium, issue a join code, join, send a creature, connect the TV WebSocket,
  end the aquarium (the TV spike app runs the TV half; see `OPERATIONS.md`)
- Graceful shutdown: not applicable; hibernated WebSockets survive deploys and the TV reconnects
- Expected CPU: well under the 10 ms Workers Free limit per request; images are never decoded
- Log format: JSON lines in Workers Logs (`observability.enabled`)

## Security

- Registration: none; aquariums are anonymous and short-lived (ADR 003)
- Session strategy: TV bearer token `{aquariumId}.{secret}`; phone cookie `aquarium_sid`
  (`Secure`, `HttpOnly`, `SameSite=Lax`, 30-day `Max-Age`, valid only while the aquarium lives);
  secrets are 32 random bytes stored as SHA-256 hashes
- CSRF: state-changing phone requests require `Origin` equal to `PUBLIC_ORIGIN` and the
  `X-Aquarium-Client: pwa` header
- CORS: only `/api/tv/*`, which ignores cookies
- Admin roles: none
- Sensitive data: children's drawings and optional author names; hashed IPs for at most one day
- Retention/deletion: everything is deleted when the aquarium ends or after the reconnection window

## Deploy

- CI workflow: `.github/workflows/ci.yaml` (`npm run validate`)
- Deployment workflow: planned `deploy.yaml` on `v*` tags in the `production` environment
- Release identifier: `vX.Y.Z` tag and the Worker version ID
- Migration order: Durable Object class migrations deploy with the Worker; SQL migrations run
  when each object starts
- Rollback: `npx wrangler rollback` to the previous version; SQL migrations are forward-only, so a
  rollback must not cross a schema change
- Database rollback limitation: not applicable beyond the rule above (no backups)

## Dependencies

- External services: Cloudflare Workers, Durable Objects, R2, Workers Logs, GitHub, LG Developer
  (Developer Mode)
- Infrastructure changes required: R2 bucket, deploy token, `IP_HASH_KEY` secret, infra repository
  entries (see `DESIGN.md` §14.4)
- Known portability constraints: the backend depends on Durable Objects; the TV app on webOS 4
  packaging and Developer Mode

## Open decisions

- Background video source (recommended: render our own loop from CC0 art).
- Review the abuse-limit defaults after the first weeks of use.
- TV renderer (WebGL or Canvas 2D) and render resolution, after the TV spike.
