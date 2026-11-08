# ADR 003: Anonymous short-lived aquariums

- Status: accepted
- Date: 2026-11-07

## Context

Platform §15 expects authenticated, invite-only family accounts. Aquarium is used like a game room:
someone turns on the TV, starts an aquarium, and the people in the room join from their phones. An
account system would add friction to every step and would protect very little, since the content is
a handful of drawings that disappear after the session.

## Decision

1. The TV creates an aquarium with one anonymous request and receives a TV token
   `{aquariumId}.{secret}`. Sending that token when creating a new aquarium ends the old one.
2. Each aquarium has exactly one TV. A newer authenticated TV connection replaces the older one.
3. The TV shows a 6-character Crockford Base32 join code, valid for 10 minutes and usable by several
   phones. A phone exchanges the code for an `HttpOnly` session cookie `{aquariumId}.{secret}`.
4. Secrets are 32 random bytes stored only as SHA-256 hashes. The aquarium ID inside each credential
   routes the request to its Durable Object without any lookup.
5. An aquarium expires when its TV has been disconnected for 4 hours (configurable). Ending or
   expiring an aquarium deletes its storage and images, and every later request gets `410 Gone`.
6. Abuse limits, all configurable: creations per IP (3 per minute and 10 per day, counted on keyed
   IP hashes), 50 live aquariums, join attempts per IP (10 per minute), 10 phones per aquarium,
   20 creatures, 60 uploads per hour, and strict image checks.

## Consequences

- Exception to platform §15, recorded in the service manifest.
- Anyone who sees the code on the TV can join for 10 minutes; the TV can disconnect every phone.
- Any phone in an aquarium can remove any creature: the room is the trust boundary.
- Per-code attempt counters are impossible without a code lookup, so guessing is bounded by the
  per-IP join limit and the size of the code space instead.
