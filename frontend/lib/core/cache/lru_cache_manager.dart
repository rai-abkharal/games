import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/game_manifest.dart';
import '../constants/app_constants.dart';

class CachedGameEntry {
  final String gameId;
  final String version;
  final String? sha256;
  final String localDirPath;
  final String entryFilePath;
  final int sizeBytes;
  final DateTime lastAccessedAt;

  CachedGameEntry({
    required this.gameId,
    required this.version,
    this.sha256,
    required this.localDirPath,
    required this.entryFilePath,
    required this.sizeBytes,
    required this.lastAccessedAt,
  });

  Map<String, dynamic> toJson() => {
        'gameId': gameId,
        'version': version,
        'sha256': sha256,
        'localDirPath': localDirPath,
        'entryFilePath': entryFilePath,
        'sizeBytes': sizeBytes,
        'lastAccessedAt': lastAccessedAt.toIso8601String(),
      };

  factory CachedGameEntry.fromJson(Map<String, dynamic> json) => CachedGameEntry(
        gameId: json['gameId'] as String,
        version: json['version'] as String,
        sha256: json['sha256'] as String?,
        localDirPath: json['localDirPath'] as String,
        entryFilePath: json['entryFilePath'] as String,
        sizeBytes: (json['sizeBytes'] as num).toInt(),
        lastAccessedAt: DateTime.parse(json['lastAccessedAt'] as String),
      );
}

class GameCacheManager {
  final int maxCacheSize;
  final http.Client client;
  Directory? _cacheBaseDir;
  final Map<String, CachedGameEntry> _entries = {};
  bool _initialized = false;

  Directory? get cacheBaseDir => _cacheBaseDir;

  GameCacheManager({
    this.maxCacheSize = AppConstants.maxCacheSizeBytes,
    http.Client? client,
  }) : client = client ?? http.Client();

  Future<void> initialize() async {
    if (_initialized) return;
    final appDir = await getApplicationSupportDirectory();
    _cacheBaseDir = Directory('${appDir.path}/game_cache');
    if (!await _cacheBaseDir!.exists()) {
      await _cacheBaseDir!.create(recursive: true);
    }

    final prefs = await SharedPreferences.getInstance();
    final rawIndex = prefs.getString('game_cache_index');
    if (rawIndex != null) {
      try {
        final decoded = jsonDecode(rawIndex) as Map<String, dynamic>;
        decoded.forEach((key, value) {
          _entries[key] = CachedGameEntry.fromJson(value as Map<String, dynamic>);
        });
      } catch (_) {}
    }

    _initialized = true;
  }

  Future<void> _saveIndex() async {
    final prefs = await SharedPreferences.getInstance();
    final map = _entries.map((k, v) => MapEntry(k, v.toJson()));
    await prefs.setString('game_cache_index', jsonEncode(map));
  }

  bool isGameCached(String gameId, String version, [String? expectedSha256]) {
    final key = '${gameId}_$version';
    final entry = _entries[key];
    if (entry == null) return false;
    
    // Invalidate if sha256 is missing or differs from expected
    if (expectedSha256 != null && expectedSha256.isNotEmpty) {
      if (entry.sha256 == null || entry.sha256 != expectedSha256) {
        return false;
      }
    }

    final file = File(entry.entryFilePath);
    return file.existsSync();
  }

  CachedGameEntry? getCachedEntry(String gameId, String version) {
    final key = '${gameId}_$version';
    return _entries[key];
  }

  Future<CachedGameEntry> prepareGame(
    GameItem game, {
    Set<String> protectedGameIds = const {},
    void Function(double progress)? onProgress,
  }) async {
    await initialize();
    final key = '${game.id}_${game.version}';

    // 1. Check if already cached and valid with matching sha256
    if (isGameCached(game.id, game.version, game.sha256)) {
      final existing = _entries[key]!;
      final updated = CachedGameEntry(
        gameId: existing.gameId,
        version: existing.version,
        sha256: game.sha256 ?? existing.sha256,
        localDirPath: existing.localDirPath,
        entryFilePath: existing.entryFilePath,
        sizeBytes: existing.sizeBytes,
        lastAccessedAt: DateTime.now(),
      );
      _entries[key] = updated;
      await _saveIndex();
      onProgress?.call(1.0);
      return updated;
    }

    // 2. Download or replace game package
    onProgress?.call(0.1);
    final targetDir = Directory('${_cacheBaseDir!.path}/${game.id}/${game.version}');
    if (await targetDir.exists()) {
      try {
        await targetDir.delete(recursive: true);
      } catch (_) {}
    }
    await targetDir.create(recursive: true);

    final entryHtmlPath = '${targetDir.path}/index.html';
    final entryFile = File(entryHtmlPath);

    try {
      final response = await client.get(Uri.parse(game.entryUrl));
      if (response.statusCode != 200) {
        throw Exception('Failed to download game HTML (${response.statusCode})');
      }

      onProgress?.call(0.6);
      String htmlContent = response.body;

      // Extract referenced script and css paths from HTML
      final scriptRegex = RegExp(r'<script[^>]+src="([^"]+)"');
      final scriptMatches = scriptRegex.allMatches(htmlContent);
      for (final match in scriptMatches) {
        var src = match.group(1);
        if (src != null && !src.startsWith('http')) {
          final assetUrl = Uri.parse(game.entryUrl).resolve(src).toString();
          // Normalize local path (e.g. "./assets/foo.js" -> "assets/foo.js")
          src = src.replaceFirst(RegExp(r'^\./'), '');
          try {
            final assetRes = await client.get(Uri.parse(assetUrl));
            if (assetRes.statusCode == 200) {
              final localAssetFile = File('${targetDir.path}/$src');
              await localAssetFile.parent.create(recursive: true);
              await localAssetFile.writeAsBytes(assetRes.bodyBytes);
            }
          } catch (_) {}
        }
      }

      await entryFile.writeAsString(htmlContent);
      onProgress?.call(0.9);

      // Measure total directory size
      int totalSize = 0;
      await for (final f in targetDir.list(recursive: true)) {
        if (f is File) {
          totalSize += await f.length();
        }
      }

      final newEntry = CachedGameEntry(
        gameId: game.id,
        version: game.version,
        sha256: game.sha256,
        localDirPath: targetDir.path,
        entryFilePath: entryHtmlPath,
        sizeBytes: totalSize > 0 ? totalSize : game.sizeBytes,
        lastAccessedAt: DateTime.now(),
      );

      _entries[key] = newEntry;
      await _saveIndex();

      // Trigger LRU eviction if cache exceeds cap
      await evictOldGamesIfNeeded(protectedGameIds: protectedGameIds);

      onProgress?.call(1.0);
      return newEntry;
    } catch (e) {
      // Clean up partial folder on error
      if (await targetDir.exists()) {
        try {
          await targetDir.delete(recursive: true);
        } catch (_) {}
      }
      rethrow;
    }
  }

  Future<void> evictOldGamesIfNeeded({Set<String> protectedGameIds = const {}}) async {
    int totalSize = _entries.values.fold(0, (sum, item) => sum + item.sizeBytes);
    if (totalSize <= maxCacheSize) return;

    // Sort entries by lastAccessedAt ascending (oldest first)
    final sorted = _entries.values.toList()
      ..sort((a, b) => a.lastAccessedAt.compareTo(b.lastAccessedAt));

    for (final entry in sorted) {
      if (protectedGameIds.contains(entry.gameId)) {
        continue; // Keep current and next games
      }

      final dir = Directory(entry.localDirPath);
      if (await dir.exists()) {
        try {
          await dir.delete(recursive: true);
        } catch (_) {}
      }

      final key = '${entry.gameId}_${entry.version}';
      _entries.remove(key);
      totalSize -= entry.sizeBytes;

      if (totalSize <= maxCacheSize) break;
    }

    await _saveIndex();
  }

  Future<void> clearAllCache() async {
    await initialize();
    if (_cacheBaseDir != null && await _cacheBaseDir!.exists()) {
      await _cacheBaseDir!.delete(recursive: true);
      await _cacheBaseDir!.create(recursive: true);
    }
    _entries.clear();
    await _saveIndex();
  }
}
