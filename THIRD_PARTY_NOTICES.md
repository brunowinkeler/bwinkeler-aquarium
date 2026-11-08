# Third-party notices

The complete licence texts are included in each npm package distribution.

## Runtime code

Shipped in the phone PWA (`frontend/`):

- React and React DOM — MIT — https://github.com/facebook/react
- React Router — MIT — https://github.com/remix-run/react-router
- jsQR — Apache-2.0 — https://github.com/cozmo/jsQR
- Workbox (via `vite-plugin-pwa` and `workbox-window`) — MIT — https://github.com/GoogleChrome/workbox

Shipped in the TV bundle (`tv/`):

- qrcode-generator — MIT — https://github.com/kazuhikoarase/qrcode-generator

Shipped in the Worker (`backend/`) and the shared schemas:

- Zod — MIT — https://github.com/colinhacks/zod

## Data

- The marker codes in `extractor/src/template.ts` are IDs 0–19 of the `ARUCO_MIP_36h12`
  dictionary of the ArUco library (Rafael Muñoz-Salinas, University of Córdoba) — BSD — as
  listed by js-aruco2.

## Build and test dependencies

- js-aruco2 — MIT (its licence file also carries ArUco, OpenCV and AForge.NET notices) — used
  only by the extractor tests — https://github.com/damianofalcioni/js-aruco2
- TypeScript — Apache-2.0 — https://github.com/microsoft/TypeScript
- Vite and vite-plugin-pwa — MIT — https://github.com/vitejs/vite, https://github.com/vite-pwa/vite-plugin-pwa
- esbuild — MIT — https://github.com/evanw/esbuild
- Wrangler and the Workers Vitest integration — MIT or Apache-2.0 — https://github.com/cloudflare/workers-sdk
- Vitest — MIT — https://github.com/vitest-dev/vitest
- Playwright — Apache-2.0 — https://github.com/microsoft/playwright
- axe-core — MPL-2.0 — https://github.com/dequelabs/axe-core
- ESLint, typescript-eslint and Prettier — MIT
