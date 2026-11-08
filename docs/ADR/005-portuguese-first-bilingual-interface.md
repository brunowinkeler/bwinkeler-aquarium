# ADR 005: Portuguese-first bilingual interface

- Status: accepted
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

## Consequences

- Both catalogues change together, guarded by a test.
- The server never needs to know the user's language.
