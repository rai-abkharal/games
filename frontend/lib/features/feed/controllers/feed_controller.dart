import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/bridge/game_bridge.dart';
import '../../../core/cache/lru_cache_manager.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/server/embedded_server.dart';
import '../../../models/game_manifest.dart';

class FeedState {
  final bool isLoading;
  final String? errorMessage;
  final List<GameItem> games;
  final int currentIndex;
  final bool isSoundMuted;
  final int? preloadingIndex;
  final Map<String, dynamic>? lastGameOverPayload;
  final bool isGameOverVisible;
  final Map<String, int> highScores;

  const FeedState({
    this.isLoading = true,
    this.errorMessage,
    this.games = const [],
    this.currentIndex = 0,
    this.isSoundMuted = false,
    this.preloadingIndex,
    this.lastGameOverPayload,
    this.isGameOverVisible = false,
    this.highScores = const {},
  });

  GameItem? get currentGame =>
      (currentIndex >= 0 && currentIndex < games.length) ? games[currentIndex] : null;

  FeedState copyWith({
    bool? isLoading,
    String? errorMessage,
    List<GameItem>? games,
    int? currentIndex,
    bool? isSoundMuted,
    int? preloadingIndex,
    Map<String, dynamic>? lastGameOverPayload,
    bool clearLastGameOverPayload = false,
    bool? isGameOverVisible,
    Map<String, int>? highScores,
  }) {
    return FeedState(
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      games: games ?? this.games,
      currentIndex: currentIndex ?? this.currentIndex,
      isSoundMuted: isSoundMuted ?? this.isSoundMuted,
      preloadingIndex: preloadingIndex,
      lastGameOverPayload: clearLastGameOverPayload
          ? null
          : (lastGameOverPayload ?? this.lastGameOverPayload),
      isGameOverVisible: isGameOverVisible ?? this.isGameOverVisible,
      highScores: highScores ?? this.highScores,
    );
  }
}

class FeedController extends StateNotifier<FeedState> {
  final ApiClient apiClient;
  final GameCacheManager cacheManager;
  final EmbeddedGameServer server;
  final GameBridgeController bridgeController;

  Timer? _preloadTimer;
  int _preloadGeneration = 0;

  FeedController({
    required this.apiClient,
    required this.cacheManager,
    required this.server,
    required this.bridgeController,
  }) : super(const FeedState()) {
    _init();
  }

  Future<void> _init() async {
    final prefs = await SharedPreferences.getInstance();
    final isMuted = prefs.getBool(AppConstants.keySoundMuted) ?? false;

    Map<String, int> scores = {};
    final scoresJson = prefs.getString(AppConstants.keyHighScores);
    if (scoresJson != null) {
      try {
        final decoded = jsonDecode(scoresJson) as Map<String, dynamic>;
        scores = decoded.map((key, value) => MapEntry(key, (value as num).toInt()));
      } catch (_) {}
    }

    state = state.copyWith(isSoundMuted: isMuted, highScores: scores);
    bridgeController.addListener(_onBridgeMessage);

    await cacheManager.initialize();
    if (cacheManager.cacheBaseDir != null) {
      try {
        await server.start(cacheManager.cacheBaseDir!.path);
      } catch (_) {}
    }

    await loadFeed();
  }

  void _onBridgeMessage(String action, Map<String, dynamic> payload) {
    if (action == 'ready' || action == 'gameStarted') {
      _schedulePreloadAfterActiveGameStarts();
    }

    if (action == 'gameOver' || action == 'completed') {
      final score = (payload['score'] as num?)?.toInt() ?? 0;
      final game = state.currentGame;

      if (game != null) {
        final currentHigh = state.highScores[game.id] ?? 0;
        if (score > currentHigh) {
          final updated = Map<String, int>.from(state.highScores)..[game.id] = score;
          state = state.copyWith(highScores: updated);
          unawaited(_saveHighScores());
        }
      }

      state = state.copyWith(
        lastGameOverPayload: payload,
        isGameOverVisible: true,
      );
    }
  }

  Future<void> _saveHighScores() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyHighScores, jsonEncode(state.highScores));
  }

  Future<void> loadFeed() async {
    _cancelPendingPreload();
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      final catalog = await apiClient.fetchCatalog();
      if (catalog.games.isEmpty) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'No games found in catalog.',
        );
        return;
      }

      state = state.copyWith(
        isLoading: false,
        games: catalog.games,
        currentIndex: 0,
        clearLastGameOverPayload: true,
        isGameOverVisible: false,
      );
    } catch (error) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to load games: $error',
      );
    }
  }

  Future<void> onPageChanged(int newIndex) async {
    if (newIndex == state.currentIndex ||
        newIndex < 0 ||
        newIndex >= state.games.length) {
      return;
    }

    _cancelPendingPreload();
    unawaited(bridgeController.sendPause());

    state = state.copyWith(
      currentIndex: newIndex,
      isGameOverVisible: false,
      clearLastGameOverPayload: true,
    );
  }

  void _schedulePreloadAfterActiveGameStarts() {
    final sourceIndex = state.currentIndex;
    final generation = ++_preloadGeneration;
    _preloadTimer?.cancel();

    // Let the active WebView finish its first frames before disk/network work.
    _preloadTimer = Timer(const Duration(milliseconds: 900), () {
      unawaited(_preloadUpcomingSequentially(sourceIndex, generation));
    });
  }

  Future<void> _preloadUpcomingSequentially(
    int sourceIndex,
    int generation,
  ) async {
    for (var step = 1; step <= AppConstants.preloadAheadCount; step++) {
      if (generation != _preloadGeneration || state.currentIndex != sourceIndex) {
        return;
      }

      final targetIndex = sourceIndex + step;
      if (targetIndex >= state.games.length) return;

      state = state.copyWith(preloadingIndex: targetIndex);
      await _prepareGameAtIndex(targetIndex, sourceIndex: sourceIndex);
    }

    if (generation == _preloadGeneration) {
      state = state.copyWith(preloadingIndex: null);
    }
  }

  Future<void> _prepareGameAtIndex(
    int index, {
    required int sourceIndex,
  }) async {
    if (index < 0 || index >= state.games.length) return;

    final game = state.games[index];
    final protectedKeys = <String>{'${game.id}_${game.version}'};
    if (sourceIndex >= 0 && sourceIndex < state.games.length) {
      final sourceGame = state.games[sourceIndex];
      protectedKeys.add('${sourceGame.id}_${sourceGame.version}');
    }

    try {
      await cacheManager.prepareGame(
        game,
        priority: CachePreparationPriority.preload,
        protectedGameKeys: protectedKeys,
      );

      if (!server.isRunning && cacheManager.cacheBaseDir != null) {
        await server.start(cacheManager.cacheBaseDir!.path);
      }
    } catch (_) {
      // The active host can still fall back to the remote entry URL.
    }
  }

  void _cancelPendingPreload() {
    _preloadGeneration++;
    _preloadTimer?.cancel();
    _preloadTimer = null;
  }

  Future<void> toggleSound() async {
    final newMuted = !state.isSoundMuted;
    state = state.copyWith(isSoundMuted: newMuted);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.keySoundMuted, newMuted);
    await bridgeController.setSoundEnabled(!newMuted);
  }

  Future<void> restartCurrentGame() async {
    state = state.copyWith(isGameOverVisible: false);
    await bridgeController.sendRestart();
  }

  void dismissGameOver() {
    state = state.copyWith(isGameOverVisible: false);
  }

  @override
  void dispose() {
    _cancelPendingPreload();
    bridgeController.removeListener(_onBridgeMessage);
    super.dispose();
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient();
  ref.onDispose(client.dispose);
  return client;
});

final gameCacheManagerProvider = Provider<GameCacheManager>((ref) {
  final manager = GameCacheManager();
  ref.onDispose(manager.dispose);
  return manager;
});

final embeddedGameServerProvider = Provider<EmbeddedGameServer>((ref) {
  final server = EmbeddedGameServer();
  ref.onDispose(() => unawaited(server.stop()));
  return server;
});

final gameBridgeControllerProvider = Provider<GameBridgeController>((ref) {
  final controller = GameBridgeController();
  ref.onDispose(controller.dispose);
  return controller;
});

final feedControllerProvider = StateNotifierProvider<FeedController, FeedState>((ref) {
  return FeedController(
    apiClient: ref.watch(apiClientProvider),
    cacheManager: ref.watch(gameCacheManagerProvider),
    server: ref.watch(embeddedGameServerProvider),
    bridgeController: ref.watch(gameBridgeControllerProvider),
  );
});
