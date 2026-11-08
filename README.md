# Aquarium

Children draw sea creatures on paper; a phone photographs the drawing, removes the paper and sends
the creature to the TV, where it swims in an animated aquarium.

- Service ID `aquarium`, production origin `https://aquarium.bwinkeler.com`
- Part of the `bwinkeler.com` platform (`BW-PLATFORM-ARCH-001` v1.3)

## Status

| Part                                          | State                                        |
| --------------------------------------------- | -------------------------------------------- |
| `shared`: protocol, limits, identifiers       | Implemented                                  |
| `engine`: creature motion, Canvas 2D renderer | Implemented (WebGL renderer after the spike) |
| `extractor`: paper removal on the phone       | Implemented (ArUco templates pending)        |
| `frontend`: phone PWA (join, photo, preview)  | Implemented, served by the Worker            |
| `backend`: Worker, Durable Objects, R2        | Deployed by hand to `aquarium.bwinkeler.com` |
| `spikes/tv-spike`: webOS 4 feasibility app    | Ready to run on the TV                       |
| `tv`: TV app                                  | Planned                                      |

## Repository layout

```text
shared/           Protocol types, TV-safe guards, Zod schemas (shared/schemas), limits
engine/           Creature motion and rendering shared by the phone preview and the TV
extractor/        Paper detection, rectification and drawing segmentation (no AI)
frontend/         Phone PWA (React): join, photo, corners, animated preview, send
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
npm run icons                                      # regenerate the PWA icons
npm run spike:tv:package && npm run spike:tv:install
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for local setup, deployment and the TV spike, and
[docs/DESIGN.md](docs/DESIGN.md) for the full design.

## License

[MIT](LICENSE)
