import { z } from 'zod';
import { CREATURE_KINDS, CREATURE_SIZES, FACINGS } from './enums.js';
import { MAX_AUTHOR_LENGTH, MAX_IMAGE_DIMENSION } from './limits.js';
import type { CreateCreatureRequest, JoinRequest, TvMessage } from './protocol.js';
import { isUlid } from './ulid.js';

export const ulidSchema = z.string().refine(isUlid, { message: 'Invalid ULID' });

export const authorSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().max(MAX_AUTHOR_LENGTH));

export const createCreatureRequestSchema: z.ZodType<CreateCreatureRequest> = z.strictObject({
  id: ulidSchema,
  kind: z.enum(CREATURE_KINDS),
  facing: z.enum(FACINGS),
  // Phones from before sizes existed send none; they showed today's small size.
  size: z.enum(CREATURE_SIZES).default('small'),
  author: authorSchema.nullish().transform((value) => (value ? value : null)),
  width: z.int().min(1).max(MAX_IMAGE_DIMENSION),
  height: z.int().min(1).max(MAX_IMAGE_DIMENSION),
});

export const joinRequestSchema: z.ZodType<JoinRequest> = z.strictObject({
  code: z.string().max(32),
});

export const tvMessageSchema: z.ZodType<TvMessage> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('auth'), token: z.string().max(256) }),
  z.strictObject({ type: z.literal('ping') }),
  z.strictObject({ type: z.literal('sync') }),
  z.strictObject({ type: z.literal('displayed'), id: ulidSchema }),
]);
