class AppConstants {
  static const String appName = 'Mini-Games';

  // Default base URL for API & CDN
  static String get defaultBaseUrl {
    return 'http://162.243.197.241:3000';
  }

  // Cache configuration
  static const int maxCacheSizeBytes = 150 * 1024 * 1024; // 150 MB LRU Cache Cap
  static const Duration connectTimeout = Duration(seconds: 8);
  static const Duration requestTimeout = Duration(seconds: 15);

  // Storage keys
  static const String keyCachedCatalog = 'cached_catalog_json';
  static const String keySoundMuted = 'is_sound_muted';
  static const String keyHighScores = 'game_high_scores';

  // ---------------------------------------------------------------------------
  // Performance flags
  // ---------------------------------------------------------------------------

  /// Diagnostics HUD. Keep this false in release builds. The HUD polls the
  /// JS bridge and rebuilds on top of the platform view, which costs frames.
  static const bool enablePerformanceHud = false;

  /// Only one live WebView at a time. Neighbour pages show a static thumbnail
  /// and are pre-downloaded into the LRU cache instead of being pre-rendered.
  /// Set to false only if you want the old 3-WebView pool back.
  static const bool singleLiveWebView = true;

  /// Unmount the live WebView while a page swipe is in flight and show the
  /// thumbnail instead. Removes platform view compositing from the animation.
  static const bool hideWebViewWhileScrolling = true;

  /// Restrict the feed swipe to an edge strip instead of the whole screen.
  /// The full screen swipe gesture competes with taps going into the game,
  /// which is what makes taps feel delayed on Android.
  static const bool edgeSwipeOnly = true;

  /// Width of the swipe strip on the right edge, in logical pixels.
  static const double edgeSwipeStripWidth = 48.0;

  /// Delay before the live WebView is mounted after a swipe settles.
  static const Duration webViewMountDelay = Duration(milliseconds: 120);
}
