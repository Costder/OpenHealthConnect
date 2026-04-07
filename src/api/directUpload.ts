import { z } from 'zod';
import type { AppConfig } from '../config/schema.js';

export const directUploadBodySchema = z.object({
  manifest: z.record(z.any()),
  payloadCiphertextB64: z.string().min(16)
});

export function hasDirectUploadAuth(authHeader: string | undefined, config: AppConfig): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${config.directUploadToken}`;
  return authHeader === expected;
}
