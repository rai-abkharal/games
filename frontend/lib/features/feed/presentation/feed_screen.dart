import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/lifecycle/app_lifecycle_handler.dart';
import '../../game_host/presentation/game_host_view.dart';
import '../controllers/feed_controller.dart';
import '../../download/controllers/download_controller.dart';
import 'widgets/feed_overlay.dart';
import 'widgets/game_over_dialog.dart';
import 'widgets/game_thumbnail.dart';
import 'widgets/mode_selection_dialog.dart';
import 'widgets/performance_hud.dart';

class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  late final PageController _pageController;
  late final AppLifecycleHandler _lifecycleHandler;

  /// True while a swipe or a page animation is in flight. The live WebView is
  /// unmounted during this window so the platform view never has to be
  /// composited while the page is moving.
  bool _isScrolling = false;
  Timer? _settleTimer;

  double _dragAccumulator = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _lifecycleHandler = AppLifecycleHandler(ref.read(gameBridgeControllerProvider));
    _lifecycleHandler.start();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final downloadState = ref.read(downloadControllerProvider);
      if (!downloadState.hasSelectedMode) {
        ModeSelectionDialog.show(context);
      }
    });
  }

  @override
  void dispose() {
    _settleTimer?.cancel();
    _pageController.dispose();
    _lifecycleHandler.stop();
    super.dispose();
  }

  void _onScrollStart() {
    _settleTimer?.cancel();
    if (!_isScrolling && AppConstants.hideWebViewWhileScrolling) {
      setState(() => _isScrolling = true);
    }
  }

  void _onScrollEnd() {
    _settleTimer?.cancel();
    // Small delay so the page animation finishes fully before the WebView is
    // attached. Mounting a platform view mid-animation is what drops frames.
    _settleTimer = Timer(AppConstants.webViewMountDelay, () {
      if (mounted && _isScrolling) {
        setState(() => _isScrolling = false);
      }
    });
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

  void _goToPreviousGame() {
    final state = ref.read(feedControllerProvider);
    if (state.currentIndex > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    }
  }

  Widget _buildLoading() {
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

  Widget _buildError(String message, VoidCallback onRetry) {
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
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
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

  /// Right edge strip that drives the feed.
  ///
  /// With the whole screen scrollable, every tap in the game area had to lose
  /// the gesture arena before it reached the WebView, which is what made taps
  /// feel late. Confining the swipe to this strip removes that contention.
  Widget _buildSwipeStrip(int currentIndex, int total) {
    return Positioned(
      top: 0,
      bottom: 0,
      right: 0,
      width: AppConstants.edgeSwipeStripWidth,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onVerticalDragStart: (_) => _dragAccumulator = 0,
        onVerticalDragUpdate: (details) => _dragAccumulator += details.delta.dy,
        onVerticalDragEnd: (details) {
          final velocity = details.primaryVelocity ?? 0;
          if (_dragAccumulator < -40 || velocity < -320) {
            _goToNextGame();
          } else if (_dragAccumulator > 40 || velocity > 320) {
            _goToPreviousGame();
          }
          _dragAccumulator = 0;
        },
        child: Align(
          alignment: Alignment.centerRight,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _StripButton(
                icon: Icons.keyboard_arrow_up_rounded,
                enabled: currentIndex > 0,
                onTap: _goToPreviousGame,
              ),
              const SizedBox(height: 10),
              Container(
                width: 4,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 10),
              _StripButton(
                icon: Icons.keyboard_arrow_down_rounded,
                enabled: currentIndex + 1 < total,
                onTap: _goToNextGame,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(feedControllerProvider);
    final feedNotifier = ref.read(feedControllerProvider.notifier);

    if (feedState.isLoading) return _buildLoading();
    if (feedState.errorMessage != null) {
      return _buildError(feedState.errorMessage!, () => feedNotifier.loadFeed());
    }

    final total = feedState.games.length;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F6F0),
      body: Stack(
        children: [
          // 1. Vertical feed
          NotificationListener<ScrollNotification>(
            onNotification: (notification) {
              if (notification is ScrollStartNotification) {
                _onScrollStart();
              } else if (notification is ScrollEndNotification) {
                _onScrollEnd();
              }
              return false;
            },
            child: PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.vertical,
              itemCount: total,
              physics: AppConstants.edgeSwipeOnly
                  ? const NeverScrollableScrollPhysics()
                  : const PageScrollPhysics(),
              onPageChanged: (idx) => feedNotifier.onPageChanged(idx),
              itemBuilder: (context, index) {
                final game = feedState.games[index];
                final isCurrent = (index == feedState.currentIndex);

                // Exactly one live WebView, and none at all while a page
                // change is animating. Neighbours are static thumbnails; they
                // are still pre-downloaded by the controller so the swap is
                // fast.
                final showLiveGame = AppConstants.singleLiveWebView
                    ? (isCurrent && !_isScrolling)
                    : ((index - feedState.currentIndex).abs() <= 1);

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    if (showLiveGame)
                      GameHostView(
                        key: ValueKey('${game.id}_${game.version}'),
                        game: game,
                        isActive: isCurrent,
                      )
                    else
                      GameThumbnail(game: game, showSpinner: isCurrent),

                    // Overlay UI
                    FeedOverlay(
                      game: game,
                      index: index,
                      totalGames: total,
                    ),
                  ],
                );
              },
            ),
          ),

          // 2. Swipe strip (only when the full screen gesture is disabled)
          if (AppConstants.edgeSwipeOnly)
            _buildSwipeStrip(feedState.currentIndex, total),

          // 3. Diagnostics HUD, off in release builds
          if (AppConstants.enablePerformanceHud) const PerformanceHud(),

          // 4. Game Over modal
          if (feedState.isGameOverVisible)
            GameOverModal(onNextGame: _goToNextGame),
        ],
      ),
    );
  }
}

class _StripButton extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  const _StripButton({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: const Color(0xFFFFFFFF),
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? const Color(0xFF1E293B) : const Color(0xFFCBD5E1),
        ),
      ),
    );
  }
}
