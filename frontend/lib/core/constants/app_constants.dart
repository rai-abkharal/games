import 'dart:io';
import 'package:flutter/foundation.dart';

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
}
