import { z } from 'zod';
import { transportModeSchema } from './bundle.js';

export const pairingModeSchema = z.enum(['folder-sync', 'direct']);

const legacyPairingPayloadSchema = z.object({
  type: z.literal('ohc-pairing'),
  version: z.literal(1),
  transportMode: transportModeSchema,
  keyB64: z.string().min(20),
  fingerprint: z.string().regex(/^[a-f0-9]{12}$/)
});

const folderSyncPairingPayloadSchema = z.object({
  type: z.literal('ohc-pairing'),
  version: z.literal(2),
  pairingMode: z.literal('folder-sync'),
  transportMode: transportModeSchema,
  keyB64: z.string().min(20),
  fingerprint: z.string().regex(/^[a-f0-9]{12}$/)
});

const directPairingPayloadSchema = z.object({
  type: z.literal('ohc-pairing'),
  version: z.literal(2),
  pairingMode: z.literal('direct'),
  directHostUrl: z.string().url(),
  directUploadToken: z.string().min(16),
  keyB64: z.string().min(20),
  fingerprint: z.string().regex(/^[a-f0-9]{12}$/)
});

export const pairingPayloadSchema = z.union([
  legacyPairingPayloadSchema,
  folderSyncPairingPayloadSchema,
  directPairingPayloadSchema
]);

export type PairingPayload = z.infer<typeof pairingPayloadSchema>;
export type LegacyPairingPayload = z.infer<typeof legacyPairingPayloadSchema>;
export type FolderSyncPairingPayload = z.infer<typeof folderSyncPairingPayloadSchema>;
export type DirectPairingPayload = z.infer<typeof directPairingPayloadSchema>;
