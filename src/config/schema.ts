import { z } from 'zod';
import { categorySchema } from '../types/bundle.js';

export const configSchema = z.object({
  dataDir: z.string().min(1),
  inboxDir: z.string().min(1),
  dbPath: z.string().min(1),
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(8787),
  encryptionKeyB64: z.string().min(20),
  hiddenCategoriesByDefault: z.array(categorySchema).default([
    'mental_health',
    'sexual_health',
    'reproductive_health',
    'substance_use'
  ])
});

export type AppConfig = z.infer<typeof configSchema>;
