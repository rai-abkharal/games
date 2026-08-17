import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/lifecycle/app_lifecycle_handler.dart';
import '../../game_host/presentation/game_host_view.dart';
import '../controllers/feed_controller.dart';
import 'widgets/feed_overlay.dart';
import 'widgets/game_over_dialog.dart';
import 'widgets/performance_hud.dart';

class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  late final PageController _pageController;
  late final AppLifecycleHandler _lifecycleHandler;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _lifecycleHandler = AppLifecycleHandler(
      ref.read(gameBridgeControllerProvider),
    );
    _lifecycleHandler.start();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _lifecycleHandler.stop();
    super.dispose();
  }

  void _goToNextGame() {
    final state = ref.read(feedControllerProvider);
    if (state.currentIndex + 1 < state.games.length) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(feedControllerProvider);
    final feedNotifier = ref.read(feedControllerProvider.notifier);

    if (feedState.isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFFF8F6F0),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
              ),
              SizedBox(height: 16),
              Text(
                'Initializing Game Feed...',
                style: TextStyle(
                  color: Color(0xFF1E293B),
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (feedState.errorMessage != null) {
      return Scaffold(
        backgroundColor: const Color(0xFFF8F6F0),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.cloud_off_rounded,
                  color: Color(0xFFEF4444),
                  size: 54,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Feed Unavailable',
                  style: TextStyle(
                    color: Color(0xFF1E293B),
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  feedState.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: feedNotifier.loadFeed,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF8F6F0),
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            allowImplicitScrolling: false,
            itemCount: feedState.games.length,
            onPageChanged: feedNotifier.onPageChanged,
            itemBuilder: (context, index) {
              final game = feedState.games[index];
              final isCurrent = index == feedState.currentIndex;

              return Stack(
                fit: StackFit.expand,
                children: [
                  // Only one native WebView / Phaser runtime exists at a time.
                  // Adjacent pages remain lightweight while their package bytes
                  // are pre-cached after the active game reaches ready state.
                  if (isCurrent)
                    RepaintBoundary(
                      child: GameHostView(
                        key: ValueKey('${game.id}_${game.version}'),
                        game: game,
                        isActive: true,
                      ),
                    )
                  else
                    _GamePagePlaceholder(title: game.title),
                  RepaintBoundary(
                    child: FeedOverlay(
                      game: game,
                      index: index,
                      totalGames: feedState.games.length,
                    ),
                  ),
                ],
              );
            },
          ),
          if (kDebugMode) const PerformanceHud(),
          if (feedState.isGameOverVisible)
            GameOverModal(onNextGame: _goToNextGame),
        ],
      ),
    );
  }
}

class _GamePagePlaceholder extends StatelessWidget {
  final String title;

  const _GamePagePlaceholder({required this.title});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFFF8F6F0),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.sports_esports_rounded,
              size: 52,
              color: Color(0xFF94A3B8),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(
                color: Color(0xFF1E293B),
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
