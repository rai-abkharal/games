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
    _lifecycleHandler = AppLifecycleHandler(ref.read(gameBridgeControllerProvider));
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
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeInOut,
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
                style: TextStyle(color: Color(0xFF1E293B), fontSize: 16, fontWeight: FontWeight.w600),
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
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_rounded, color: Color(0xFFEF4444), size: 54),
                const SizedBox(height: 16),
                const Text(
                  'Feed Unavailable',
                  style: TextStyle(color: Color(0xFF1E293B), fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  feedState.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () => feedNotifier.loadFeed(),
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
          // 1. Vertical TikTok-style PageView
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            itemCount: feedState.games.length,
            onPageChanged: (idx) => feedNotifier.onPageChanged(idx),
            itemBuilder: (context, index) {
              final game = feedState.games[index];
              final isCurrent = (index == feedState.currentIndex);
              final isWithinWindow = (index - feedState.currentIndex).abs() <= 1;

              return Stack(
                fit: StackFit.expand,
                children: [
                  // 3-Window Sliding Pool: render WebViews for [N-1, N, N+1]
                  if (isWithinWindow)
                    GameHostView(
                      key: ValueKey('${game.id}_${game.version}'),
                      game: game,
                      isActive: isCurrent,
                    )
                  else
                    // Placeholder for distant items
                    Container(
                      color: const Color(0xFFF8F6F0),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CircularProgressIndicator(
                              valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              game.title,
                              style: const TextStyle(
                                color: Color(0xFF1E293B),
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Overlay UI
                  IgnorePointer(
                    ignoring: false,
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

          // 2. Performance Diagnostics HUD (FPS, Response Latency, Cache State)
          const PerformanceHud(),

          // 3. Game Over Modal Overlay
          if (feedState.isGameOverVisible)
            GameOverModal(
              onNextGame: _goToNextGame,
            ),
        ],
      ),
    );
  }
}
