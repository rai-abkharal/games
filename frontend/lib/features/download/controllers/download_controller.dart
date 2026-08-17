import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/cache/lru_cache_manager.dart';
import '../../../core/network/api_client.dart';
import '../../../models/game_manifest.dart';
import '../../feed/controllers/feed_controller.dart';

enum PlayMode {
  onlineStream,      // Stream from CDN with background preloading
  offlineDownloaded, // Native local download & offline shelf server playback
}

enum GameDownloadStatus {
  notDownloaded,
  downloading,
  downloaded,
  error,
}

class DownloadState {
  final PlayMode playMode;
  final bool hasSelectedMode;
  final Map<String, GameDownloadStatus> gameStatuses;
  final Map<String, double> gameProgress;
  final bool isBatchDownloading;
  final double batchProgress;
  final String? batchCurrentGameTitle;

  const DownloadState({
    this.playMode = PlayMode.onlineStream,
    this.hasSelectedMode = false,
    this.gameStatuses = const {},
    this.gameProgress = const {},
    this.isBatchDownloading = false,
    this.batchProgress = 0.0,
    this.batchCurrentGameTitle,
  });

  DownloadState copyWith({
    PlayMode? playMode,
    bool? hasSelectedMode,
    Map<String, GameDownloadStatus>? gameStatuses,
    Map<String, double>? gameProgress,
    bool? isBatchDownloading,
    double? batchProgress,
    String? batchCurrentGameTitle,
  }) {
    return DownloadState(
      playMode: playMode ?? this.playMode,
      hasSelectedMode: hasSelectedMode ?? this.hasSelectedMode,
      gameStatuses: gameStatuses ?? this.gameStatuses,
      gameProgress: gameProgress ?? this.gameProgress,
      isBatchDownloading: isBatchDownloading ?? this.isBatchDownloading,
      batchProgress: batchProgress ?? this.batchProgress,
      batchCurrentGameTitle: batchCurrentGameTitle,
    );
  }
}

class DownloadController extends StateNotifier<DownloadState> {
  final GameCacheManager cacheManager;
  final ApiClient apiClient;

  DownloadController({
    required this.cacheManager,
    required this.apiClient,
  }) : super(const DownloadState()) {
    _init();
  }

  Future<void> _init() async {
    final prefs = await SharedPreferences.getInstance();
    final hasSelected = prefs.getBool('user_has_selected_play_mode') ?? false;
    final modeStr = prefs.getString('user_play_mode') ?? 'onlineStream';
    final playMode = modeStr == 'offlineDownloaded'
        ? PlayMode.offlineDownloaded
        : PlayMode.onlineStream;

    await cacheManager.initialize();

    state = state.copyWith(
      hasSelectedMode: hasSelected,
      playMode: playMode,
    );
  }

  Future<void> setPlayMode(PlayMode mode, {bool markSelected = true}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_play_mode', mode == PlayMode.offlineDownloaded ? 'offlineDownloaded' : 'onlineStream');
    if (markSelected) {
      await prefs.setBool('user_has_selected_play_mode', true);
    }

    state = state.copyWith(
      playMode: mode,
      hasSelectedMode: true,
    );
  }

  Future<void> downloadSingleGame(GameItem game) async {
    final statuses = Map<String, GameDownloadStatus>.from(state.gameStatuses);
    final progresses = Map<String, double>.from(state.gameProgress);

    statuses[game.id] = GameDownloadStatus.downloading;
    progresses[game.id] = 0.1;
    state = state.copyWith(gameStatuses: statuses, gameProgress: progresses);

    try {
      await cacheManager.prepareGame(
        game,
        onProgress: (p) {
          final upProgress = Map<String, double>.from(state.gameProgress);
          upProgress[game.id] = p;
          state = state.copyWith(gameProgress: upProgress);
        },
      );

      final upStatuses = Map<String, GameDownloadStatus>.from(state.gameStatuses);
      upStatuses[game.id] = GameDownloadStatus.downloaded;
      state = state.copyWith(gameStatuses: upStatuses);
    } catch (_) {
      final upStatuses = Map<String, GameDownloadStatus>.from(state.gameStatuses);
      upStatuses[game.id] = GameDownloadStatus.error;
      state = state.copyWith(gameStatuses: upStatuses);
    }
  }

  Future<void> downloadAllGames(List<GameItem> games) async {
    if (games.isEmpty || state.isBatchDownloading) return;

    state = state.copyWith(
      isBatchDownloading: true,
      batchProgress: 0.0,
    );

    for (int i = 0; i < games.length; i++) {
      final game = games[i];
      state = state.copyWith(
        batchCurrentGameTitle: game.title,
        batchProgress: (i / games.length),
      );

      await downloadSingleGame(game);
    }

    state = state.copyWith(
      isBatchDownloading: false,
      batchProgress: 1.0,
      batchCurrentGameTitle: null,
    );
  }

  GameDownloadStatus getStatus(GameItem game) {
    if (state.gameStatuses.containsKey(game.id)) {
      return state.gameStatuses[game.id]!;
    }
    if (cacheManager.isGameCached(game.id, game.version, game.sha256)) {
      return GameDownloadStatus.downloaded;
    }
    return GameDownloadStatus.notDownloaded;
  }
}

final downloadControllerProvider = StateNotifierProvider<DownloadController, DownloadState>((ref) {
  return DownloadController(
    cacheManager: ref.watch(gameCacheManagerProvider),
    apiClient: ref.watch(apiClientProvider),
  );
});
