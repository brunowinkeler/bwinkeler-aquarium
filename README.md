# Aquarium

Children draw sea creatures on paper; a phone photographs the drawing, removes the paper and sends
the creature to the TV, where it swims in an animated aquarium.

- Service ID `aquarium`, production origin `https://aquarium.bwinkeler.com`
- Part of the `bwinkeler.com` platform (`BW-PLATFORM-ARCH-001` v1.3)

## Status

| Part                                          | State                                        |
| --------------------------------------------- | -------------------------------------------- |
| `shared`: protocol, limits, identifiers       | Implemented                                  |
| `backend`: Worker, Durable Objects, R2        | Deployed by hand to `aquarium.bwinkeler.com` |
| `spikes/tv-spike`: webOS 4 feasibility app    | Ready to run on the TV                       |
| `engine`, `extractor`, `tv`, `frontend` (PWA) | Planned                                      |

## Repository layout

```text
shared/           Protocol types, TV-safe guards, Zod schemas (shared/schemas), limits
backend/          Cloudflare Worker, AquariumDO, JoinCodeDO, RegistryDO, tests
spikes/tv-spike/  Throwaway ES5 webOS app for the Phase 0 measurements
scripts/          Repository tooling
docs/             Design, requirements, manifest, operations, ADRs, platform contract
```

## Commands

```text
npm ci
npm run validate                                   # format, lint, typecheck, tests, build, es-check
npm run dev -w @bwinkeler-aquarium/backend         # local Worker on http://localhost:8787
npm run spike:tv:package && npm run spike:tv:install
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for local setup, deployment and the TV spike, and
[docs/DESIGN.md](docs/DESIGN.md) for the full design.

## License

[MIT](LICENSE)
