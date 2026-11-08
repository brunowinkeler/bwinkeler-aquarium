import { describe, expect, it } from 'vitest';
import { WS_PING, WS_PONG, parseServerMessage, type Creature } from '../src/index.js';
import { createCreatureRequestSchema, tvMessageSchema } from '../src/schemas.js';

const creature: Creature = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  kind: 'swim',
  facing: 'right',
  size: 'medium',
  author: 'Olivia',
  width: 512,
  height: 384,
  createdAt: 1_700_000_000_000,
  displayedAt: null,
};

describe('parseServerMessage', () => {
  it('accepts every server message', () => {
    const messages = [
      { type: 'snapshot', revision: 3, creatures: [creature], phoneCount: 2 },
      { type: 'creature_added', revision: 4, creature },
      { type: 'creature_removed', revision: 5, id: creature.id, reason: 'capacity' },
      { type: 'phones_changed', revision: 6, phoneCount: 0 },
      { type: 'aquarium_ended', reason: 'expired' },
      { type: 'error', code: 'unauthorized' },
    ];
    for (const message of messages) {
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
    }
    expect(parseServerMessage(WS_PONG)).toEqual({ type: 'pong' });
  });

  it('rejects malformed messages', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('[]')).toBeNull();
    expect(parseServerMessage('{"type":"unknown"}')).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ type: 'creature_added', revision: -1, creature })),
    ).toBeNull();
    expect(
      parseServerMessage(
        JSON.stringify({
          type: 'creature_added',
          revision: 1,
          creature: { ...creature, width: 0 },
        }),
      ),
    ).toBeNull();
    expect(
      parseServerMessage(
        JSON.stringify({
          type: 'creature_added',
          revision: 1,
          creature: { ...creature, size: 'xl' },
        }),
      ),
    ).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ type: 'creature_removed', revision: 1, id: 'x' })),
    ).toBeNull();
  });
});

describe('schemas', () => {
  it('validates TV messages, including the exact ping string', () => {
    expect(tvMessageSchema.parse(JSON.parse(WS_PING))).toEqual({ type: 'ping' });
    expect(tvMessageSchema.safeParse({ type: 'auth', token: 'a.b' }).success).toBe(true);
    expect(tvMessageSchema.safeParse({ type: 'displayed', id: 'nope' }).success).toBe(false);
    expect(tvMessageSchema.safeParse({ type: 'ping', extra: true }).success).toBe(false);
  });

  it('cleans the author name and enforces creature limits', () => {
    const parsed = createCreatureRequestSchema.parse({
      id: creature.id,
      kind: 'pulse',
      facing: 'left',
      author: '  Olivia\u0007   W. ',
      width: 1024,
      height: 1,
    });
    expect(parsed.author).toBe('Olivia W.');

    const base = { id: creature.id, kind: 'swim', facing: 'right', width: 10, height: 10 };
    expect(createCreatureRequestSchema.parse(base).size).toBe('small');
    expect(createCreatureRequestSchema.parse({ ...base, size: 'large' }).size).toBe('large');
    expect(createCreatureRequestSchema.safeParse({ ...base, size: 'huge' }).success).toBe(false);
    expect(createCreatureRequestSchema.parse({ ...base, author: '   ' }).author).toBeNull();
    expect(createCreatureRequestSchema.parse(base).author).toBeNull();
    expect(createCreatureRequestSchema.safeParse({ ...base, author: 'x'.repeat(25) }).success).toBe(
      false,
    );
    expect(createCreatureRequestSchema.safeParse({ ...base, width: 1025 }).success).toBe(false);
    expect(createCreatureRequestSchema.safeParse({ ...base, kind: 'fly' }).success).toBe(false);
    expect(createCreatureRequestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
