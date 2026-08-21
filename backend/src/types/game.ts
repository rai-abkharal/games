import { z } from 'zod';

export const TouchZoneSchema = z.object({
  name: z.string().default('gameplay'),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const GameFeaturesSchema = z.object({
  sound: z.boolean().default(true),
  vibration: z.boolean().default(false),
  hint: z.boolean().optional().default(false),
}).default({ sound: true, vibration: false, hint: false });

export const AdsConfigSchema = z.object({
  bannerEnabled: z.boolean().default(true),
  interstitialEnabled: z.boolean().default(true),
  swipeInterval: z.number().int().min(1).default(10),
  levelCompleteAd: z.boolean().default(true),
  levelWinInterval: z.number().int().min(1).default(2),
  gameOverAdEnabled: z.boolean().default(true),
  cooldownSeconds: z.number().int().min(0).default(60),
  adMobAppId: z.string().default('ca-app-pub-3940256099942544~3347511713'),
  bannerUnitId: z.string().default('ca-app-pub-3940256099942544/6300978111'),
  interstitialUnitId: z.string().default('ca-app-pub-3940256099942544/1033173712'),
  rewardedUnitId: z.string().default('ca-app-pub-3940256099942544/5224354917'),
});

export type AdsConfig = z.infer<typeof AdsConfigSchema>;

export const GameOrientationSchema = z.string().nullish().transform((val) => {
  const lower = String(val || 'portrait').toLowerCase();
  if (lower === 'landscape') return 'landscape';
  return 'portrait';
}).default('portrait');

export const GameSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic versioning (e.g. 1.0.0)'),
  entryUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  sizeBytes: z.number().int().positive(),
  orientation: GameOrientationSchema,
  engine: z.string().default('phaser'),
  manifestUrl: z.string().url(),
  feedOrder: z.number().int().nonnegative(),
  category: z.string().default('Arcade'),
  description: z.string().default(''),
  sha256: z.string().optional(),
  controls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  ageRating: z.string().optional(),
  status: z.enum(['published', 'draft', 'archived', 'deactivated']).optional().default('published'),
  touchZones: z.array(TouchZoneSchema).optional().default([]),
  features: GameFeaturesSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const CatalogSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().datetime().optional(),
  games: z.array(GameSchema),
});

export type Game = z.infer<typeof GameSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
