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
      lastGameOverPayload: lastGameOverPayload ?? this.lastGameOverPayload,
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
    
    // Load stored high scores
    Map<String, int> scores = {};
    final scoresJson = prefs.getString(AppConstants.keyHighScores);
    if (scoresJson != null) {
      try {
        final decoded = jsonDecode(scoresJson) as Map<String, dynamic>;
        scores = decoded.map((k, v) => MapEntry(k, (v as num).toInt()));
      } catch (_) {}
    }

    state = state.copyWith(isSoundMuted: isMuted, highScores: scores);

    // Setup bridge listener
    bridgeController.addListener(_onBridgeMessage);

    // Initialize cache and embedded server
    await cacheManager.initialize();
    if (cacheManager.cacheBaseDir != null) {
      try {
        await server.start(cacheManager.cacheBaseDir!.path);
      } catch (_) {}
    }

    await loadFeed();
  }

  void _onBridgeMessage(String action, Map<String, dynamic> payload) {
    if (action == 'gameOver' || action == 'completed') {
      final score = (payload['score'] as num?)?.toInt() ?? 0;
      final game = state.currentGame;

      if (game != null) {
        final currentHigh = state.highScores[game.id] ?? 0;
        if (score > currentHigh) {
          final updated = Map<String, int>.from(state.highScores)..[game.id] = score;
          state = state.copyWith(highScores: updated);
          _saveHighScores();
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
      );

      // Preload window: current game (index 0) and next 2 games (index 1 & 2)
      if (catalog.games.isNotEmpty) {
        await _prepareGameAtIndex(0);
        _preloadUpcomingGames(0);
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to load games: $e',
      );
    }
  }

  Future<void> onPageChanged(int newIndex) async {
    if (newIndex == state.currentIndex || newIndex < 0 || newIndex >= state.games.length) {
      return;
    }

    // Pause previous game
    await bridgeController.sendPause();

    state = state.copyWith(
      currentIndex: newIndex,
      isGameOverVisible: false,
      lastGameOverPayload: null,
    );

    // Prepare current game and trigger background preload for upcoming 2-3 games
    await _prepareGameAtIndex(newIndex);
    _preloadUpcomingGames(newIndex);
  }

  Future<void> _prepareGameAtIndex(int index) async {
    if (index < 0 || index >= state.games.length) return;
    final game = state.games[index];

    // Protect window [index-1, index, index+1, index+2] from LRU eviction
    final protectedIds = <String>{game.id};
    for (int offset = -1; offset <= 2; offset++) {
      final targetIdx = index + offset;
      if (targetIdx >= 0 && targetIdx < state.games.length) {
        protectedIds.add(state.games[targetIdx].id);
      }
    }

    try {
      await cacheManager.prepareGame(
        game,
        protectedGameIds: protectedIds,
      );

      // Start embedded server on root cache directory if not running
      if (!server.isRunning && cacheManager.cacheBaseDir != null) {
        await server.start(cacheManager.cacheBaseDir!.path);
      }
    } catch (e) {
      // Fallback: will play from remote entryUrl directly if local cache fails
    }
  }

  void _preloadUpcomingGames(int currentIndex) {
    // Eagerly pre-cache next 1, 2, and 3 games in the background
    for (int step = 1; step <= 3; step++) {
      final nextIdx = currentIndex + step;
      if (nextIdx < state.games.length) {
        _preloadSingleGame(nextIdx);
      }
    }
  }

  void _preloadSingleGame(int targetIndex) {
    if (targetIndex >= state.games.length) return;
    final game = state.games[targetIndex];

    final protected = <String>{
      if (state.currentGame != null) state.currentGame!.id,
      game.id,
    };

    cacheManager
        .prepareGame(game, protectedGameIds: protected)
        .then((_) {})
        .catchError((_) {});
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
}

// Providers
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
final gameCacheManagerProvider = Provider<GameCacheManager>((ref) => GameCacheManager());
final embeddedGameServerProvider = Provider<EmbeddedGameServer>((ref) => EmbeddedGameServer());
final gameBridgeControllerProvider = Provider<GameBridgeController>((ref) => GameBridgeController());

final feedControllerProvider = StateNotifierProvider<FeedController, FeedState>((ref) {
  return FeedController(
    apiClient: ref.watch(apiClientProvider),
    cacheManager: ref.watch(gameCacheManagerProvider),
    server: ref.watch(embeddedGameServerProvider),
    bridgeController: ref.watch(gameBridgeControllerProvider),
  );
});
