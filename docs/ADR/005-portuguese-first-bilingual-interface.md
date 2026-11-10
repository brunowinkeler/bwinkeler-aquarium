# ADR 005: Portuguese-first bilingual interface

- Status: accepted; amended 2026-11-10 (the site root opens in English)
- Date: 2026-11-07

## Context

Aquarium is used by a Brazilian family, as KeyPlay and Practice Companion are. The platform rule that
every repository artefact is written in English applies to code, identifiers, documentation and
commits; it was never meant to force the product interface into English.

## Decision

1. Ship the phone and TV interfaces in Brazilian Portuguese and English, with `pt-BR` as the default.
2. Keep every user-visible string in typed catalogues, so a missing translation is a type error.
3. Keep code, identifiers, comments, documentation, ADRs, commit messages and API error messages in
   English. The apps map API error codes to localized text.
4. Amendment (2026-11-10): the aquarium screen at the site root, the public face of the product,
   opens in English; `/tv/` follows the TV's language and the phone app keeps `pt-BR` first. The
   start screens of the site root and of the phone app switch language, and the choice is stored
   on the device under `aquarium.language`, which both apps read.

## Consequences

- Both catalogues change together, guarded by a test.
- The server never needs to know the user's language.
