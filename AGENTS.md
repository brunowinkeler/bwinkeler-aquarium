# Agent instructions

Read these files before changing this repository:

1. `docs/DESIGN.md`
2. `docs/REQUIREMENTS.md`
3. `docs/SERVICE_MANIFEST.md`
4. `docs/OPERATIONS.md`
5. the ADRs in `docs/ADR/`
6. `docs/PLATFORM_ARCHITECTURE.md` (verbatim platform contract; never edit it here)

## Language

Code, comments, documentation, metadata, commits, API error messages and domains are written in
English. The interfaces are bilingual: the phone app opens in Brazilian Portuguese and the site root
screen in English (ADR 005).

## Architecture

- The backend is one Cloudflare Worker with Durable Objects and R2 (ADR 001). Do not add a VPS,
  container, PostgreSQL or Redis dependency without an approved ADR.
- Validate and authenticate in the Worker; Durable Object RPC methods recheck the device secret.
- Images go to R2, never into Durable Object storage. The Worker never decodes images.
- Durable Object schemas change only through new forward-only entries in the `MIGRATIONS` arrays.
  New Durable Object classes need a new tag in `backend/wrangler.jsonc` `migrations`.
- An aquarium has exactly one TV. Ended or expired aquariums must answer `410 Gone` (WebSocket
  upgrades: close code 4010) and must never be recreated by a stray request.
- Only `/api/tv/*` sends CORS headers. Phone routes use the session cookie and the CSRF checks.

## TV compatibility

- Everything the TV loads must run on Chromium 53 (webOS 4). The `shared` entry point is imported
  by the TV: no post-ES2015 library APIs there (`Object.entries`, `padStart`, `globalThis`, ...), and
  Zod stays in `shared/schemas`.
- The spike under `spikes/tv-spike` is plain ES5 without a build step.

## Security and privacy

- Nothing secret in the PWA or TV bundles.
- Never log tokens, cookies, join codes or IP addresses.
- Keep every limit in `docs/DESIGN.md` §12.5 enforced and tested.

## Validation

Run `npm run validate` for every change. Update `docs/SERVICE_MANIFEST.md` when an operational
contract changes, and `docs/DESIGN.md` when the design changes.
