# ADR 002: webOS 4 TV client

- Status: accepted
- Date: 2026-11-07

## Context

The target TV is an LG 43UK6300PLB running webOS TV 4.4, whose web engine is Chromium 53. LG no
longer publishes API support charts for this engine, the TV's own browser is not a reliable runtime,
and the screensaver starts after a period without input unless a video plays full screen.

## Decision

1. Ship a packaged webOS app (IPK) with `id` `com.bwinkeler.aquarium`, installed in Developer Mode.
   A packaged app starts fast and offline, but runs on `file://` with origin `null` and no cookies.
2. Authenticate the TV with a bearer token, and allow CORS (`*`) only on `/api/tv/*`. Those routes
   ignore cookies, so the wildcard exposes nothing. List allowed headers explicitly, since
   Chromium 53 does not support the `*` wildcard there.
3. Build the TV bundle for `chrome53` as one IIFE with explicit polyfills, and check it with
   `es-check`. Shared code imported by the TV avoids post-ES2015 library APIs, and the TV uses
   hand-written message guards instead of Zod.
4. Keep the screen awake with a full-screen looping background video, the mechanism LG documents.
5. Validate WebGL performance, the video, TLS, WebSockets, IndexedDB and key codes on the real TV
   with a throwaway spike app before building the real one.
6. Put device-specific behavior behind a `TvPlatform` adapter so other TV systems can be added.
7. Renew Developer Mode on a schedule, since an expired session uninstalls the app.

## Consequences

- The TV app is not in a store; reinstalling after a Developer Mode lapse is an operations task.
- Any change to shared code must keep the TV bundle passing `es-check`.
- The same TV build can also be served at `/tv/` for modern browsers.
