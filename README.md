# Aquarium

Children draw sea creatures on paper; a phone photographs the drawing, removes the paper and sends
the creature to the TV, where it swims in an animated aquarium.

- Service ID `aquarium`, production origin `https://aquarium.bwinkeler.com`
- Part of the `bwinkeler.com` platform (`BW-PLATFORM-ARCH-001` v1.3)

## Status

| Part                                          | State                                             |
| --------------------------------------------- | ------------------------------------------------- |
| `shared`: protocol, limits, identifiers       | Implemented                                       |
| `engine`: creature motion, Canvas 2D renderer | Implemented (WebGL renderer after the spike)      |
| `extractor`: paper removal on the phone       | Implemented (free sheet and printed templates)    |
| `frontend`: phone PWA under `/join/`          | Implemented, with printable templates             |
| `backend`: Worker, Durable Objects, R2        | Deployed to `aquarium.bwinkeler.com` on `v*` tags |
| `spikes/tv-spike`: webOS 4 feasibility app    | Ready to run on the TV                            |
| `tv`: aquarium screen at `/` and `/tv/`       | Implemented; webOS package after the spike        |

## Repository layout

```text
shared/           Protocol types, TV-safe guards, Zod schemas (shared/schemas), limits
engine/           Creature motion and rendering shared by the phone preview and the TV
extractor/        Paper and template detection, rectification and drawing segmentation (no AI)
frontend/         Phone PWA (React) under /join/: join, photo or drawing, corners, sizes, preview,
                  send, templates; site/ holds the origin's _headers, _redirects and robots.txt
tv/               Aquarium screen (Chromium 53 bundle): create, join code and QR, live aquarium,
                  ambience; / for a mouse or touch screen, /tv/ for a remote
backend/          Cloudflare Worker, AquariumDO, JoinCodeDO, RegistryDO, tests
spikes/tv-spike/  Throwaway ES5 webOS app for the Phase 0 measurements
scripts/          Repository tooling
docs/             Design, requirements, manifest, operations, ADRs, platform contract
```

## Commands

```text
npm ci
npm run validate                                   # format, lint, typecheck, build, tests, es-check
npm run build && npm run dev -w @bwinkeler-aquarium/backend   # PWA + Worker on http://localhost:8787
npm run dev -w @bwinkeler-aquarium/frontend        # PWA with hot reload, proxied to the Worker
npm run test:e2e                                   # phone app + Worker + / + /tv/ in Chromium (after build)
npm run icons                                      # regenerate the PWA icons
npm run templates                                  # regenerate the printable templates (SVG + PDF)
npm run spike:tv:package && npm run spike:tv:install
```

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for how to use it,
[docs/OPERATIONS.md](docs/OPERATIONS.md) for local setup, deployment and the TV spike, and
[docs/DESIGN.md](docs/DESIGN.md) for the full design.

## License

[MIT](LICENSE). Third-party code and data: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
