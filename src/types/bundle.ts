import { z } from 'zod';

export const transportModeSchema = z.enum(['syncthing', 'nextcloud', 'tailscale']);

export const categorySchema = z.enum([
  'activity',
  'nutrition',
  'sleep',
  'medications',
  'mental_health',
  'sexual_health',
  'reproductive_health',
  'substance_use'
]);

export const eventSchema = z.object({
  id: z.string().min(1),
  category: categorySchema,
  ts: z.string().datetime(),
  payload: z.record(z.any())
});

export const manifestSchema = z.object({
  formatVersion: z.literal(1),
  bundleType: z.enum(['snapshot', 'delta']),
  bundleId: z.string().min(8),
  sequence: z.number().int().nonnegative(),
  prevBundleId: z.string().optional(),
  createdAt: z.string().datetime(),
  transportMode: transportModeSchema,
  integrity: z.object({
    algorithm: z.literal('sha256'),
    ciphertextSha256: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  encryption: z.object({
    algorithm: z.literal('xchacha20poly1305'),
    nonceB64: z.string().min(20)
  })
});

export type Manifest = z.infer<typeof manifestSchema>;
export type EventRecord = z.infer<typeof eventSchema>;
