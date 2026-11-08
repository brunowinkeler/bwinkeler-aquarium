# Aquarium operations

## Local setup

```text
npm ci
cp backend/.dev.vars.example backend/.dev.vars
npm run build
npm run dev -w @bwinkeler-aquarium/backend
```

`wrangler dev` runs the Worker, the three Durable Objects, R2 and the rate limiters locally on
`http://localhost:8787`, and serves the built PWA from `frontend/dist` (so build first); nothing
needs the Cloudflare account. For hot reload while working on the PWA, keep `wrangler dev` running
and start `npm run dev -w @bwinkeler-aquarium/frontend`: Vite proxies `/api`, `/ws` and `/health`
to the Worker. Local state lives in `backend/.wrangler/` and can be deleted at any time.

The `dev` script passes `--local-upstream localhost:8787`: without it, `wrangler dev` rewrites the
request URL and the `Origin` header to the Custom Domain, and the phone's CSRF check
(`Origin` = `PUBLIC_ORIGIN`) rejects every state-changing request. A quick check:

```text
curl -s http://localhost:8787/health/ready
curl -s -X POST http://localhost:8787/api/tv/aquariums
```

Run `npm run types -w @bwinkeler-aquarium/backend` after changing bindings or variables in
`backend/wrangler.jsonc`, and commit the regenerated `backend/worker-configuration.d.ts`. Generate it
without a `backend/.dev.vars` file present, so the committed types do not depend on local secrets.

## Validation

`npm run validate` runs Prettier, ESLint, the TypeScript projects of every workspace and of the
end-to-end tests, the builds (libraries, PWA, TV bundle, Worker with `wrangler deploy --dry-run`),
the unit tests (`shared`, `engine` and `extractor` in Node, `backend` inside the Workers runtime
through `@cloudflare/vitest-plugin`), `es-check es5` on the TV spike and `es-check es2016` on the TV
bundle.

`npm run test:e2e` (after `npm run build`) starts a clean local Worker (`dev:e2e`, port 8787) and
drives the whole flow in Chromium: the TV at `/tv/` creates an aquarium, a phone joins with the code,
sends a large photographed drawing, sees it confirmed on the TV and lists it, opens the printable
templates and sends a photographed template (corners and kind found automatically), sends a
cropped photo as it is, removes a creature, then the TV ends the aquarium; a second test drives
`/pc/` with clicks only (code panel, sound toggle, menu). axe checks the phone screens. Each run
creates two aquariums, so wait a minute between runs (3 creations per minute per IP). CI runs
`validate`, checks that the icons and the templates are reproducible and runs the end-to-end tests
on every push to `main` and on pull requests.

## Cloudflare resources (one-time, manual)

These steps touch the shared Cloudflare account; run them only when the first deploy is approved.
All four were done on 2026-11-08.

1. Create the private bucket: `npx wrangler r2 bucket create bwinkeler-aquarium-files`.
2. Set the IP hashing key from `backend/`: `npx wrangler secret put IP_HASH_KEY` with a random value
   such as the output of `openssl rand -base64 32`.
3. Create an API token limited to the account and the `bwinkeler.com` zone (Workers scripts, Workers
   R2 storage read, Custom Domains), and store `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in
   the GitHub `production` environment.
4. Record the service in `bwinkeler-infra` as listed in `docs/DESIGN.md` §14.4.

## Deploy and rollback

Releases follow the Listly flow. From a clean `main` that passed CI:

```text
npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version
git commit -am "chore(release): bump version to X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

If `npm version` rewrites `package-lock.json` beyond the version fields (it reifies the local
`node_modules`), restore the file and run `npm install --package-lock-only` before committing.

The tag starts `.github/workflows/deploy.yaml` in the `production` environment: it checks that the
tag matches `package.json`, runs `npm run validate`, deploys with `wrangler deploy` (the Worker
version is tagged with the release) and waits for `/health/ready`. A manual deploy from `backend/`
after `npm run validate` (`npx wrangler deploy`) remains possible with the local OAuth login.

After a deploy, run the end-to-end suite against production:
`E2E_BASE_URL=https://aquarium.bwinkeler.com npm run test:e2e`. It creates two short-lived
aquariums and ends them, like real sessions.

The first deploy created the Custom Domain and its certificate. Roll back with
`npx wrangler rollback` (list candidates with `npx wrangler versions list`). SQL migrations are
forward-only, so never roll back across a schema change; ship a new forward migration instead.

Hibernated TV WebSockets survive deploys. Any socket that drops reconnects and receives a fresh
snapshot.

## Secrets rotation

Rotating `IP_HASH_KEY` only resets the per-IP daily creation counters. No other secret exists at
runtime: TV tokens and phone sessions die with their aquariums.

## TV spike (Phase 0)

`spikes/tv-spike` is a throwaway webOS app that answers the open questions of `DESIGN.md` §4.4.

### Connect the TV

1. On the TV, install **Developer Mode** from the LG Content Store, sign in with the LG developer
   account, turn Developer Mode on, reboot, and turn on **Key Server**.
2. Register the TV once (replace the IP address):

   ```text
   npx ares-setup-device --add tv --info "{'host':'192.168.1.50','port':'9922','username':'prisoner'}"
   npx ares-novacom --device tv --getkey
   npx ares-device --system-info --device tv
   ```

   `--getkey` asks for the passphrase shown in the Developer Mode app.

3. Developer Mode expires; press **EXTEND** in the app before it runs out, or the installed apps are
   removed. The automated renewal workflow is planned for Phase 4.

### Run the spike

1. Copy a looping H.264 video to `spikes/tv-spike/background.mp4` (ignored by Git).
2. Check `spikes/tv-spike/spike-config.js`. The default base URL is production. To test before the
   first deploy, run `npx wrangler dev --ip 0.0.0.0` in `backend/` and use `http://<pc-ip>:8787`.
3. Package, install, launch and inspect:

   ```text
   npm run spike:tv:package
   npm run spike:tv:install
   npm run spike:tv:launch
   npm run spike:tv:inspect
   ```

Keys: Left/Right change the sprite count by 5, Up switches between full and two-thirds resolution,
Red switches WebGL and Canvas 2D, Green runs the network tests (health, create, WebSocket auth and
ping, join code, end), OK runs the IndexedDB Blob test, Yellow pauses the video, Blue hides the HUD,
and Back exits.

### Results to record

| Question                                                 | Result |
| -------------------------------------------------------- | ------ |
| WebGL FPS with 20 sprites at 1920×1080 / 1280×720        |        |
| Canvas 2D FPS with 20 sprites at 1920×1080 / 1280×720    |        |
| Video loop seam visible?                                 |        |
| Screensaver after 2 hours without input (video playing)? |        |
| Screensaver with the video paused (control)?             |        |
| HTTPS from `file://` (health, CORS preflight, create)    |        |
| WSS auth, snapshot and ping round trip                   |        |
| IndexedDB Blob round trip                                |        |
| Key codes for OK, Back, arrows and color keys            |        |
| JS heap after 8 hours                                    |        |
| Eco auto power-off behavior                              |        |
