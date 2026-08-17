import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:convert/convert.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/game_manifest.dart';
import '../constants/app_constants.dart';

enum CachePreparationPriority { active, preload }

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

class _PreparationRecord {
  CachePreparationPriority priority;
  int requestGeneration;
  late final Future<CachedGameEntry> future;

  _PreparationRecord({
    required this.priority,
    required this.requestGeneration,
  });

  void promoteToActive(int currentRequestGeneration) {
    priority = CachePreparationPriority.active;
    requestGeneration = currentRequestGeneration;
  }

  bool shouldCancel(int currentRequestGeneration) {
    // A newly selected game supersedes both speculative preloads and an older
    // active download whose host widget has already left the screen.
    return requestGeneration != currentRequestGeneration;
  }
}

class _DownloadJob {
  final _PreparationRecord record;
  final Future<CachedGameEntry> Function() task;
  final Completer<CachedGameEntry> completer = Completer<CachedGameEntry>();

  _DownloadJob({required this.record, required this.task});
}

class _PreparationCancelled implements Exception {
  const _PreparationCancelled();

  @override
  String toString() => 'Game preload cancelled because an active game took priority.';
}

class GameCacheManager {
  final int maxCacheSize;
  final int maxCacheEntries;
  final http.Client client;

  Directory? _cacheBaseDir;
  final Map<String, CachedGameEntry> _entries = {};
  final Map<String, _PreparationRecord> _inFlightPreparations = {};
  final List<_DownloadJob> _downloadJobs = [];

  bool _initialized = false;
  bool _isPumpingDownloads = false;
  int _activeRequestGeneration = 0;
  Timer? _indexSaveDebounce;

  Directory? get cacheBaseDir => _cacheBaseDir;
  int get cachedGameCount => _entries.length;
  int get cachedBytes =>
      _entries.values.fold(0, (sum, item) => sum + item.sizeBytes);

  GameCacheManager({
    this.maxCacheSize = AppConstants.maxCacheSizeBytes,
    this.maxCacheEntries = AppConstants.maxCachedGames,
    http.Client? client,
  }) : client = client ?? http.Client();

  String _entryKey(String gameId, String version) => '${gameId}_$version';

  Future<void> initialize() async {
    if (_initialized) return;

    final appDir = await getApplicationSupportDirectory();
    _cacheBaseDir = Directory('${appDir.path}/game_cache');
    if (!await _cacheBaseDir!.exists()) {
      await _cacheBaseDir!.create(recursive: true);
    }

    final prefs = await SharedPreferences.getInstance();
    final rawIndex = prefs.getString(AppConstants.keyGameCacheIndex);
    if (rawIndex != null) {
      try {
        final decoded = jsonDecode(rawIndex) as Map<String, dynamic>;
        decoded.forEach((key, value) {
          final entry =
              CachedGameEntry.fromJson(value as Map<String, dynamic>);
          if (File(entry.entryFilePath).existsSync()) {
            _entries[key] = entry;
          }
        });
      } catch (_) {
        _entries.clear();
      }
    }

    await _removeOrphanedCacheDirectories();

    _initialized = true;
    _scheduleIndexSave();
  }

  Future<void> _removeOrphanedCacheDirectories() async {
    final indexedPaths =
        _entries.values.map((entry) => entry.localDirPath).toSet();

    await for (final gameEntity
        in _cacheBaseDir!.list(followLinks: false)) {
      if (gameEntity is! Directory) continue;

      await for (final versionEntity
          in gameEntity.list(followLinks: false)) {
        if (versionEntity is! Directory) continue;

        final isPartial = versionEntity.path.contains('.partial-');
        final isIndexed = indexedPaths.contains(versionEntity.path);
        if (isPartial || !isIndexed) {
          try {
            await versionEntity.delete(recursive: true);
          } catch (_) {}
        }
      }

      try {
        if (await gameEntity.list(followLinks: false).isEmpty) {
          await gameEntity.delete();
        }
      } catch (_) {}
    }
  }

  Future<void> _saveIndexNow() async {
    if (!_initialized) return;
    _indexSaveDebounce?.cancel();
    _indexSaveDebounce = null;

    final prefs = await SharedPreferences.getInstance();
    final map =
        _entries.map((key, value) => MapEntry(key, value.toJson()));
    await prefs.setString(
      AppConstants.keyGameCacheIndex,
      jsonEncode(map),
    );
  }

  void _scheduleIndexSave() {
    _indexSaveDebounce?.cancel();
    _indexSaveDebounce = Timer(const Duration(milliseconds: 750), () {
      unawaited(_saveIndexNow());
    });
  }

  bool isGameCached(
    String gameId,
    String version, [
    String? expectedSha256,
  ]) {
    final entry = _entries[_entryKey(gameId, version)];
    if (entry == null) return false;

    if (expectedSha256 != null && expectedSha256.isNotEmpty) {
      if (entry.sha256 == null || entry.sha256 != expectedSha256) {
        return false;
      }
    }

    return File(entry.entryFilePath).existsSync();
  }

  CachedGameEntry? getCachedEntry(String gameId, String version) {
    return _entries[_entryKey(gameId, version)];
  }

  Future<CachedGameEntry> prepareGame(
    GameItem game, {
    CachePreparationPriority priority = CachePreparationPriority.active,
    Set<String> protectedGameKeys = const {},
    void Function(double progress)? onProgress,
  }) async {
    await initialize();
    final key = _entryKey(game.id, game.version);

    // When the user swipes to a package that is already being prefetched,
    // promote that same work rather than cancelling and downloading it twice.
    final alreadyRunning = _inFlightPreparations[key];
    if (alreadyRunning != null) {
      if (priority == CachePreparationPriority.active) {
        _activeRequestGeneration++;
        alreadyRunning.promoteToActive(_activeRequestGeneration);
      }
      final result = await alreadyRunning.future;
      onProgress?.call(1.0);
      return result;
    }

    // The latest active request wins; it invalidates older active work and preloads.
    if (priority == CachePreparationPriority.active) {
      _activeRequestGeneration++;
    }

    if (isGameCached(game.id, game.version, game.sha256)) {
      final existing = _entries[key]!;
      final touched = CachedGameEntry(
        gameId: existing.gameId,
        version: existing.version,
        sha256: game.sha256 ?? existing.sha256,
        localDirPath: existing.localDirPath,
        entryFilePath: existing.entryFilePath,
        sizeBytes: existing.sizeBytes,
        lastAccessedAt: DateTime.now(),
      );
      _entries[key] = touched;
      _scheduleIndexSave();
      onProgress?.call(1.0);
      return touched;
    }

    final record = _PreparationRecord(
      priority: priority,
      requestGeneration: _activeRequestGeneration,
    );

    record.future = _enqueueDownload(
      record: record,
      task: () => _downloadAndInstall(
        game,
        protectedGameKeys: protectedGameKeys,
        shouldCancel: () =>
            record.shouldCancel(_activeRequestGeneration),
        onProgress: onProgress,
      ),
    );
    _inFlightPreparations[key] = record;

    try {
      return await record.future;
    } finally {
      if (identical(_inFlightPreparations[key], record)) {
        _inFlightPreparations.remove(key);
      }
    }
  }

  Future<CachedGameEntry> _enqueueDownload({
    required _PreparationRecord record,
    required Future<CachedGameEntry> Function() task,
  }) {
    final job = _DownloadJob(record: record, task: task);
    _downloadJobs.add(job);
    unawaited(_pumpDownloadQueue());
    return job.completer.future;
  }

  Future<void> _pumpDownloadQueue() async {
    if (_isPumpingDownloads) return;
    _isPumpingDownloads = true;

    try {
      while (_downloadJobs.isNotEmpty) {
        final activeIndex = _downloadJobs.indexWhere(
          (job) => job.record.priority == CachePreparationPriority.active,
        );
        final job = _downloadJobs.removeAt(
          activeIndex >= 0 ? activeIndex : 0,
        );

        if (job.record.shouldCancel(_activeRequestGeneration)) {
          job.completer.completeError(const _PreparationCancelled());
          continue;
        }

        try {
          job.completer.complete(await job.task());
        } catch (error, stackTrace) {
          job.completer.completeError(error, stackTrace);
        }
      }
    } finally {
      _isPumpingDownloads = false;
      if (_downloadJobs.isNotEmpty) {
        unawaited(_pumpDownloadQueue());
      }
    }
  }

  Future<CachedGameEntry> _downloadAndInstall(
    GameItem game, {
    required Set<String> protectedGameKeys,
    required bool Function() shouldCancel,
    void Function(double progress)? onProgress,
  }) async {
    if (game.sizeBytes <= 0 ||
        game.sizeBytes > AppConstants.maxGamePackageBytes) {
      throw StateError(
        '${game.id} advertises ${game.sizeBytes} bytes; the package limit is '
        '${AppConstants.maxGamePackageBytes} bytes.',
      );
    }

    final expectedHash = game.sha256;
    final validHash = expectedHash != null &&
        RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(expectedHash);
    if (kReleaseMode && !validHash) {
      throw StateError(
        'Release game packages require a complete SHA-256 checksum.',
      );
    }

    _throwIfCancelled(shouldCancel);

    final targetDir = Directory(
      '${_cacheBaseDir!.path}/${game.id}/${game.version}',
    );
    final tempDir = Directory(
      '${targetDir.path}.partial-${DateTime.now().microsecondsSinceEpoch}',
    );

    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
    await tempDir.create(recursive: true);

    try {
      onProgress?.call(0.05);
      var downloadedBytes = 0;
      final entryFile = File('${tempDir.path}/index.html');
      downloadedBytes += await _downloadFile(
        Uri.parse(game.entryUrl),
        entryFile,
        maxBytes: AppConstants.maxGamePackageBytes - downloadedBytes,
        shouldCancel: shouldCancel,
      );
      onProgress?.call(0.45);

      final htmlContent = await entryFile.readAsString();
      final assetReferences = _extractLocalAssetReferences(htmlContent);
      var completedAssets = 0;

      for (final reference in assetReferences) {
        _throwIfCancelled(shouldCancel);

        final assetUri = Uri.parse(game.entryUrl).resolve(reference);
        final relativePath = _safeRelativeAssetPath(reference);
        if (relativePath == null) continue;

        final localAsset = File('${tempDir.path}/$relativePath');
        await localAsset.parent.create(recursive: true);
        downloadedBytes += await _downloadFile(
          assetUri,
          localAsset,
          maxBytes: AppConstants.maxGamePackageBytes - downloadedBytes,
          shouldCancel: shouldCancel,
        );

        completedAssets++;
        final ratio = assetReferences.isEmpty
            ? 1.0
            : completedAssets / assetReferences.length;
        onProgress?.call(0.45 + (ratio * 0.35));
      }

      _throwIfCancelled(shouldCancel);
      final calculatedHash = await _calculateDirectoryHash(tempDir);
      if (validHash && calculatedHash.toLowerCase() != expectedHash.toLowerCase()) {
        throw StateError(
          'Integrity check failed for ${game.id}: expected $expectedHash, '
          'got $calculatedHash',
        );
      }
      onProgress?.call(0.85);

      final totalSize = await _directorySize(tempDir);
      if (totalSize > AppConstants.maxGamePackageBytes) {
        throw StateError('${game.id} exceeds the local package size limit.');
      }

      _throwIfCancelled(shouldCancel);
      if (await targetDir.exists()) {
        await targetDir.delete(recursive: true);
      }
      await targetDir.parent.create(recursive: true);
      await tempDir.rename(targetDir.path);

      final newEntry = CachedGameEntry(
        gameId: game.id,
        version: game.version,
        sha256: calculatedHash,
        localDirPath: targetDir.path,
        entryFilePath: '${targetDir.path}/index.html',
        sizeBytes: totalSize,
        lastAccessedAt: DateTime.now(),
      );

      _entries[_entryKey(game.id, game.version)] = newEntry;
      await evictOldGamesIfNeeded(
        protectedGameKeys: {
          ...protectedGameKeys,
          _entryKey(game.id, game.version),
        },
      );
      await _saveIndexNow();

      onProgress?.call(1.0);
      return newEntry;
    } catch (_) {
      if (await tempDir.exists()) {
        try {
          await tempDir.delete(recursive: true);
        } catch (_) {}
      }
      rethrow;
    }
  }

  void _throwIfCancelled(bool Function() shouldCancel) {
    if (shouldCancel()) throw const _PreparationCancelled();
  }

  Future<int> _downloadFile(
    Uri uri,
    File destination, {
    required int maxBytes,
    required bool Function() shouldCancel,
  }) async {
    _throwIfCancelled(shouldCancel);
    if (maxBytes <= 0) {
      throw StateError('Game package exceeds the download size limit.');
    }

    if (kReleaseMode && uri.scheme != 'https') {
      throw StateError(
        'Release builds only download game packages over HTTPS: $uri',
      );
    }

    final request = http.Request('GET', uri);
    final response = await client
        .send(request)
        .timeout(AppConstants.connectTimeout);

    if (response.statusCode != HttpStatus.ok) {
      throw HttpException(
        'Failed to download $uri (${response.statusCode})',
        uri: uri,
      );
    }

    final declaredLength = response.contentLength;
    if (declaredLength != null && declaredLength > maxBytes) {
      throw StateError('$uri exceeds the remaining package size limit.');
    }

    var writtenBytes = 0;
    final sink = destination.openWrite();
    try {
      await for (final chunk
          in response.stream.timeout(AppConstants.requestTimeout)) {
        _throwIfCancelled(shouldCancel);
        writtenBytes += chunk.length;
        if (writtenBytes > maxBytes) {
          throw StateError('$uri exceeds the remaining package size limit.');
        }
        sink.add(chunk);
      }
      await sink.flush();
    } finally {
      await sink.close();
    }

    return writtenBytes;
  }

  List<String> _extractLocalAssetReferences(String html) {
    final references = <String>{};
    final attributeRegex = RegExp(
      r'''(?:src|href)\s*=\s*["']([^"']+)["']''',
      caseSensitive: false,
    );

    for (final match in attributeRegex.allMatches(html)) {
      final value = match.group(1)?.trim();
      if (value == null || value.isEmpty) continue;

      final lower = value.toLowerCase();
      if (lower.startsWith('http://') ||
          lower.startsWith('https://') ||
          lower.startsWith('//') ||
          lower.startsWith('data:') ||
          lower.startsWith('blob:') ||
          lower.startsWith('javascript:') ||
          lower.startsWith('#')) {
        continue;
      }
      references.add(value);
    }

    return references.toList()..sort();
  }

  String? _safeRelativeAssetPath(String reference) {
    final uri = Uri.tryParse(reference);
    if (uri == null || uri.path.isEmpty || uri.path.startsWith('/')) {
      return null;
    }

    final segments = uri.pathSegments
        .where((segment) => segment.isNotEmpty && segment != '.')
        .toList();
    if (segments.isEmpty || segments.any((segment) => segment == '..')) {
      return null;
    }
    return segments.join('/');
  }

  Future<String> _calculateDirectoryHash(Directory directory) async {
    final output = AccumulatorSink<Digest>();
    final input = sha256.startChunkedConversion(output);
    final prefix = '${directory.path}${Platform.pathSeparator}';

    Future<void> walk(Directory current) async {
      final entities = await current
          .list(followLinks: false)
          .where((entity) => entity is Directory || entity is File)
          .toList();
      entities.sort((a, b) => a.path.compareTo(b.path));

      for (final entity in entities) {
        if (entity is Directory) {
          await walk(entity);
          continue;
        }

        final file = entity as File;
        final relativePath = file.path
            .substring(prefix.length)
            .replaceAll('\\', '/');
        input.add(utf8.encode(relativePath));
        await for (final chunk in file.openRead()) {
          input.add(chunk);
        }
      }
    }

    await walk(directory);
    input.close();
    return output.events.single.toString();
  }

  Future<int> _directorySize(Directory directory) async {
    var total = 0;
    await for (final entity
        in directory.list(recursive: true, followLinks: false)) {
      if (entity is File) total += await entity.length();
    }
    return total;
  }

  Future<void> evictOldGamesIfNeeded({
    Set<String> protectedGameKeys = const {},
  }) async {
    var totalSize = cachedBytes;
    var totalEntries = _entries.length;

    if (totalSize <= maxCacheSize && totalEntries <= maxCacheEntries) {
      return;
    }

    final sorted = _entries.values.toList()
      ..sort((a, b) => a.lastAccessedAt.compareTo(b.lastAccessedAt));

    for (final entry in sorted) {
      final key = _entryKey(entry.gameId, entry.version);
      if (protectedGameKeys.contains(key)) continue;

      final directory = Directory(entry.localDirPath);
      if (await directory.exists()) {
        try {
          await directory.delete(recursive: true);
        } catch (_) {}
      }

      _entries.remove(key);
      totalSize -= entry.sizeBytes;
      totalEntries--;

      if (totalSize <= maxCacheSize && totalEntries <= maxCacheEntries) {
        break;
      }
    }

    await _saveIndexNow();
  }

  Future<void> clearAllCache() async {
    await initialize();
    _activeRequestGeneration++;
    _indexSaveDebounce?.cancel();
    _indexSaveDebounce = null;

    if (_cacheBaseDir != null && await _cacheBaseDir!.exists()) {
      await _cacheBaseDir!.delete(recursive: true);
      await _cacheBaseDir!.create(recursive: true);
    }

    _entries.clear();
    await _saveIndexNow();
  }

  void dispose() {
    _activeRequestGeneration++;
    _indexSaveDebounce?.cancel();
    client.close();
  }
}
