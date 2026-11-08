# ADR 001: Cloudflare Workers, Durable Objects and R2 instead of the VPS stack

- Status: accepted
- Date: 2026-11-07

## Context

The platform default for an application with a backend is the shared VPS: containers behind Caddy,
the shared PostgreSQL, images in GHCR and nightly `pg_dump` backups (platform §11, §18, §20).

Aquarium's backend is different from Listly's. Each aquarium is a short-lived real-time room: one
TV, a few phones, at most 20 small images, and no data worth keeping once the TV has been gone for a
few hours. The TV needs a WebSocket that survives idle hours cheaply, and the images need private
object storage. The owner already runs Pages projects on the same Cloudflare account.

## Decision

1. Run the backend as one Cloudflare Worker, `bwinkeler-aquarium`, on the Worker Custom Domain
   `aquarium.bwinkeler.com`.
2. Keep each aquarium in its own SQLite-backed Durable Object (`AquariumDO`), with join codes in
   `JoinCodeDO` and global counters in a single `RegistryDO`.
3. Store images in the private R2 bucket `bwinkeler-aquarium-files` through a binding, never in
   Durable Object storage, as platform §16 requires for files.
4. Use the WebSocket Hibernation API so idle TV connections cost nothing.
5. Embed forward-only SQL migrations in the code instead of a migration tool and a migrator role.
6. Deploy with `wrangler deploy` and roll back with `wrangler rollback` instead of versioned images.
7. Keep no backups: data is deleted by design when an aquarium ends or expires.

## Consequences

- Exceptions to platform §11 (PostgreSQL), §18 (images and CI) and §20 (backups), listed in the
  service manifest. The platform contract does not change; if a second application adopts Workers,
  propose a v1.4 that lists it as an allowed backend.
- Nothing runs on the VPS, in Caddy, in PostgreSQL or in GHCR.
- Local development needs only `wrangler dev`; tests run inside the Workers runtime.
- The Workers Free plan limits CPU to 10 ms per request, so the Worker checks images without
  decoding them. Workers Paid is the escape hatch if the limit is ever hit.
- Durable Objects tie the backend to Cloudflare; the protocol in `shared/` stays portable.
