class AppConstants {
  static const String appName = 'Mini-Games';

  // Default base URL for API & CDN
  static String get defaultBaseUrl {
    return 'http://162.243.197.241:3000';
  }

  // Cache configuration
  static const int maxCacheSizeBytes = 250 * 1024 * 1024; // 250 MB LRU Cache Cap
  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration requestTimeout = Duration(seconds: 20);

  // Storage keys
  static const String keyCachedCatalog = 'cached_catalog_json';
  static const String keySoundMuted = 'is_sound_muted';
  static const String keyHighScores = 'game_high_scores';

  // ---------------------------------------------------------------------------
  // Performance & Transition flags
  // ---------------------------------------------------------------------------

  /// Diagnostics HUD.
  static const bool enablePerformanceHud = false;

  /// Sliding WebView pool ([N-1, N, N+1]). Keeps neighbouring games warm.
  static const bool singleLiveWebView = false;

  /// Never unmount live WebViews while scrolling to prevent blank screen flashes.
  static const bool hideWebViewWhileScrolling = false;

  /// Natural full-screen vertical swipe like TikTok / Reels.
  static const bool edgeSwipeOnly = false;

  /// Width of the swipe strip on the right edge, in logical pixels (if enabled).
  static const double edgeSwipeStripWidth = 48.0;

  /// Delay before mounting (if needed).
  static const Duration webViewMountDelay = Duration(milliseconds: 50);
}
