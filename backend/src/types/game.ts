import { z } from 'zod';

export const GameFeaturesSchema = z.object({
  sound: z.boolean().default(true),
  vibration: z.boolean().default(false),
}).default({ sound: true, vibration: false });

export const GameSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic versioning (e.g. 1.0.0)'),
  entryUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  sizeBytes: z.number().int().positive(),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  engine: z.string().default('phaser'),
  manifestUrl: z.string().url(),
  feedOrder: z.number().int().nonnegative(),
  category: z.string().default('Arcade'),
  description: z.string().default(''),
  sha256: z.string().optional(),
  controls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  ageRating: z.string().optional(),
  features: GameFeaturesSchema,
});

export const CatalogSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().datetime().optional(),
  games: z.array(GameSchema),
});

export type Game = z.infer<typeof GameSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
