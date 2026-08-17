import 'dart:io';
import 'package:flutter/foundation.dart';

class AppConstants {
  static const String appName = 'Mini-Games';
  
  // Default base URL for API & CDN
  static String get defaultBaseUrl {
    if (kIsWeb) return 'http://localhost:3000';
    if (Platform.isAndroid) {
      // Connect to PC server over Wi-Fi IP
      return 'http://192.168.100.77:3000';
    }
    // iOS simulator & desktop reach host on localhost
    return 'http://localhost:3000';
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
