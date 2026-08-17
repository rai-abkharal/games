class AppConstants {
  static const String appName = 'Mini-Games';

  // Default base URL for API & CDN. Replace with an HTTPS CDN in production.
  static const String defaultBaseUrl = String.fromEnvironment(
    'GAMES_BASE_URL',
    defaultValue: 'http://162.243.197.241:3000',
  );

  // Keep only a bounded working set on device. The catalog can contain 200+
  // games without keeping every package in RAM or storage.
  static const int maxCacheSizeBytes = 150 * 1024 * 1024;
  static const int maxCachedGames = 12;
  static const int maxGamePackageBytes = 5 * 1024 * 1024;
  static const int preloadAheadCount = 1;

  static const Duration connectTimeout = Duration(seconds: 8);
  static const Duration requestTimeout = Duration(seconds: 20);

  // Storage keys
  static const String keyCachedCatalog = 'cached_catalog_json';
  static const String keySoundMuted = 'is_sound_muted';
  static const String keyHighScores = 'game_high_scores';
  static const String keyGameCacheIndex = 'game_cache_index';
}
