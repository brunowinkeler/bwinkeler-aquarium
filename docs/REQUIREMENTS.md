# Aquarium — Requirements baseline

| Field                 | Value                                         |
| --------------------- | --------------------------------------------- |
| Document              | `BW-AQUARIUM-REQ-001`                         |
| Version               | 1.0                                           |
| Status                | Approved baseline; implementation in progress |
| Last review           | 2026-11-07                                    |
| Owner                 | Bruno Winkeler                                |
| Applies to            | `bwinkeler-aquarium` (`service_id: aquarium`) |
| Platform architecture | `BW-PLATFORM-ARCH-001` v1.3                   |

Aquarium turns children's paper drawings into sea creatures that swim on a TV. A TV creates a
short-lived aquarium, phones join it with a code shown on the TV, and each phone photographs a
drawing, removes the paper, previews the creature and sends it to the TV.

This document is the normative requirements baseline. The design that satisfies it is
[DESIGN.md](DESIGN.md); the platform contract is [PLATFORM_ARCHITECTURE.md](PLATFORM_ARCHITECTURE.md).
Where they conflict, the platform contract and its precedence rules prevail, and every deviation
is recorded in an ADR.

Legend: statements are mandatory (`shall`) unless marked otherwise. Verification methods:
**T** = Test, **A** = Analysis, **I** = Inspection, **D** = Demonstration.

## 1. Context and scope

### 1.1 Objectives

| ID  | Objective                                                                                     |
| --- | --------------------------------------------------------------------------------------------- |
| O1  | Let a child's drawing on white paper become an animated creature on the family TV in seconds. |
| O2  | Let several people in the same room join one TV aquarium from their phones with a short code. |
| O3  | Keep the TV app working on the target LG TV (webOS 4.x, Chromium 53).                         |
| O4  | Keep data short-lived: an aquarium and its drawings disappear when the session is over.       |
| O5  | Run within the Cloudflare Workers Free plan and without the platform VPS.                     |

### 1.2 Identity and publication

- Service ID `aquarium`; production origin `https://aquarium.bwinkeler.com`.
- One Cloudflare Worker serves the phone app, the API, the WebSocket endpoint and the health checks.
- The TV app is a packaged webOS app installed in Developer Mode; it is not published in a store.

### 1.3 Out of scope

Store publishing, accounts and login, permanent aquariums and backups, several TVs in one aquarium,
AI segmentation, TV brands other than LG webOS (unless they need no extra work), and sound.

## 2. Actors

| Actor | Description                                                                 |
| ----- | --------------------------------------------------------------------------- |
| TV    | The LG TV running the Aquarium app; it owns exactly one aquarium at a time. |
| Phone | A phone running the Aquarium PWA, joined to one aquarium.                   |
| Child | Draws on paper; does not need to operate any device.                        |

## 3. Functional requirements

### 3.1 Aquarium sessions

| ID        | Requirement                                                                                                                                   | Verification |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| FR-SES-01 | The TV app shall open on a home screen with a "New aquarium" action.                                                                          | D            |
| FR-SES-02 | Creating an aquarium shall need no account and shall return the aquarium ID and an opaque TV token.                                           | T            |
| FR-SES-03 | The TV shall show a join code of 6 Crockford Base32 characters and a QR code; a code shall be valid for 10 minutes and usable by many phones. | T            |
| FR-SES-04 | The TV shall be able to show a new join code at any time and shall show how many phones are joined.                                           | T, D         |
| FR-SES-05 | An aquarium shall have exactly one TV connection; a newer authenticated connection shall replace the older one.                               | T            |
| FR-SES-06 | The TV shall be able to disconnect every phone.                                                                                               | T            |
| FR-SES-07 | The TV shall be able to end the aquarium, which deletes all of its data immediately.                                                          | T            |
| FR-SES-08 | An aquarium whose TV stays disconnected for the reconnection window (default 4 hours) shall expire and all of its data shall be deleted.      | T            |
| FR-SES-09 | While the TV stays connected, an aquarium shall not expire.                                                                                   | T            |
| FR-SES-10 | Requests for an ended or expired aquarium shall get `410 Gone`, and the apps shall return to their start screens.                             | T, D         |
| FR-SES-11 | Creating a new aquarium with the previous TV token shall end the previous aquarium.                                                           | T            |
| FR-SES-12 | The TV app shall resume its aquarium on launch while the aquarium is still alive.                                                             | D            |

### 3.2 Joining

| ID         | Requirement                                                                                                                               | Verification |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| FR-JOIN-01 | A phone shall join by typing the code (case, spaces and hyphens ignored; `O`, `I`, `L` read as `0`, `1`, `1`) or by scanning the QR code. | T, D         |
| FR-JOIN-02 | An aquarium shall accept at most 10 phones (configurable).                                                                                | T            |
| FR-JOIN-03 | A phone that joins the same aquarium again shall keep its session; joining another aquarium shall leave the first.                        | T            |
| FR-JOIN-04 | A phone shall be able to leave the aquarium.                                                                                              | T            |

### 3.3 Capture and preview

| ID        | Requirement                                                                                                                                  | Verification |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| FR-CAP-01 | The phone shall take a photo in the app or load one from the gallery.                                                                        | D            |
| FR-CAP-02 | The phone shall remove the white paper on the device, without AI, reaching IoU ≥ 0.95 on the reference fixtures.                             | T            |
| FR-CAP-03 | The user shall be able to adjust the paper corners by hand; a printed template with ArUco markers shall skip this.                           | D            |
| FR-CAP-04 | The enclosed white interior of an outline-only drawing shall stay opaque.                                                                    | T            |
| FR-CAP-05 | The preview shall animate the creature with the same engine and assets as the TV.                                                            | I            |
| FR-CAP-06 | The user shall choose the creature kind (`swim`, `pulse`, `walk`, `glide`), its facing and an optional author name of at most 24 characters. | T            |

### 3.4 Sending

| ID         | Requirement                                                                                                                                       | Verification |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| FR-SEND-01 | Sending shall reserve the creature with metadata and a phone-generated ULID, then upload the PNG; retries with the same ULID shall be idempotent. | T            |
| FR-SEND-02 | The server shall accept PNG images only, of at most 1.5 MB and 1024 × 1024 pixels, matching the reserved size.                                    | T            |
| FR-SEND-03 | The TV shall show exactly the pixels the phone previewed.                                                                                         | T, D         |
| FR-SEND-04 | The phone shall confirm when the TV has displayed the creature.                                                                                   | T            |
| FR-SEND-05 | An aquarium shall keep at most 20 creatures; the oldest shall leave the scene and be deleted.                                                     | T            |
| FR-SEND-06 | Any phone of the aquarium shall be able to remove a creature.                                                                                     | T            |
| FR-SEND-07 | An aquarium shall accept at most 60 creatures per hour (configurable).                                                                            | T            |

### 3.5 TV display

| ID       | Requirement                                                                                                        | Verification |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------ |
| FR-TV-01 | The TV shall play a full-screen looping underwater video behind the creatures, which keeps the screensaver away.   | D            |
| FR-TV-02 | Creatures shall move according to their kind, with smooth body deformation.                                        | D            |
| FR-TV-03 | The TV shall receive changes in real time, resynchronize after reconnecting and show a discreet offline indicator. | T, D         |
| FR-TV-04 | The TV shall be fully usable with the remote: OK, Back, arrows and the color keys.                                 | D            |

## 4. Non-functional requirements

| ID           | Requirement                                                                                                                                                                | Verification |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| NFR-COMP-01  | The TV app shall run as a packaged app on webOS 4.x (Chromium 53) from `file://`.                                                                                          | I, D         |
| NFR-COMP-02  | The phone app shall run as a PWA on current iOS Safari and Android Chrome.                                                                                                 | D            |
| NFR-PERF-01  | The TV shall render at least 50 FPS with 20 creatures and stay stable over an 8-hour run.                                                                                  | D            |
| NFR-PERF-02  | A creature shall appear on the TV less than 3 seconds after the user confirms on a home network.                                                                           | D            |
| NFR-PERF-03  | Every Worker request shall fit the Workers Free CPU limit; the Worker never decodes images.                                                                                | A            |
| NFR-SEC-01   | TV tokens and phone session secrets shall be 32 random bytes, stored only as SHA-256 hashes; the phone cookie is `Secure`, `HttpOnly`, `SameSite=Lax`.                     | T, I         |
| NFR-SEC-02   | Only `/api/tv/*` shall send CORS headers; state-changing phone requests shall require the app's `Origin` and the `X-Aquarium-Client` header.                               | T            |
| NFR-SEC-03   | Aquarium creation shall be limited to 3 per minute and 10 per day per IP and 50 live aquariums; join attempts to 10 per minute per IP.                                     | T            |
| NFR-SEC-04   | The TV WebSocket shall require `auth` as the first message within 5 seconds, limit messages to 1 KB and recheck the device on every message.                               | T            |
| NFR-SEC-05   | Images shall be served only to devices of the same aquarium, as `image/png` with `nosniff` and a private cache.                                                            | T            |
| NFR-PRIV-01  | The service shall store no personal data besides drawings and optional author names, delete them with the aquarium, and keep IPs only as keyed hashes for at most one day. | I            |
| NFR-PRIV-02  | Logs shall never contain tokens, cookies, join codes or IP addresses.                                                                                                      | I            |
| NFR-OPS-01   | The Worker shall expose `/health/live` and `/health/ready`.                                                                                                                | T            |
| NFR-OPS-02   | A release shall be deployable and revertible with Wrangler.                                                                                                                | D            |
| NFR-L10N-01  | The interface shall be in Brazilian Portuguese by default, with English available; code and documentation stay in English.                                                 | I            |
| NFR-MAINT-01 | `npm run validate` shall pass in CI for every change.                                                                                                                      | T            |

## 5. Traceability

| Area                                   | Evidence                                                   |
| -------------------------------------- | ---------------------------------------------------------- |
| Sessions, joining, limits and security | `backend/test/*.test.ts` (Workers runtime)                 |
| Protocol and identifiers               | `shared/test/*.test.ts`                                    |
| TV compatibility and performance       | `spikes/tv-spike` measurements recorded in `OPERATIONS.md` |
| Capture, preview and display           | Planned: `extractor`, `engine`, `frontend` and `tv` tests  |
