import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../models/game_manifest.dart';
import '../../controllers/feed_controller.dart';
import 'download_sheet.dart';

/// Chrome drawn on top of the game.
///
/// Everything here is opaque and shadow free on purpose. Translucent, blurred
/// layers sitting on top of an Android platform view force extra composite
/// passes on every frame the game renders. Each block is also wrapped in a
/// RepaintBoundary so a state change in one does not repaint the other.
class FeedOverlay extends ConsumerStatefulWidget {
  final GameItem game;
  final int index;
  final int totalGames;

  const FeedOverlay({
    super.key,
    required this.game,
    required this.index,
    required this.totalGames,
  });

  @override
  ConsumerState<FeedOverlay> createState() => _FeedOverlayState();
}

class _FeedOverlayState extends ConsumerState<FeedOverlay> {
  /// The title bar drops away once play starts. That removes a full width
  /// layer from on top of the platform view and stops it covering the bottom
  /// of the play area.
  bool _showInfoBar = true;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    _scheduleHide();
  }

  @override
  void didUpdateWidget(covariant FeedOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.game.id != widget.game.id) {
      setState(() => _showInfoBar = true);
      _scheduleHide();
    }
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && _showInfoBar) setState(() => _showInfoBar = false);
    });
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final game = widget.game;
    final index = widget.index;
    final totalGames = widget.totalGames;
    final isMuted = ref.watch(
      feedControllerProvider.select((s) => s.isSoundMuted),
    );
    final highScore = ref.watch(
      feedControllerProvider.select((s) => s.highScores[game.id] ?? 0),
    );
    final feedNotifier = ref.read(feedControllerProvider.notifier);

    // Leave room for the swipe strip so overlay buttons never sit under it.
    final rightInset =
        AppConstants.edgeSwipeOnly ? AppConstants.edgeSwipeStripWidth + 8 : 16.0;

    return SafeArea(
      child: Stack(
        children: [
          // Top bar
          Positioned(
            top: 16,
            left: 16,
            right: rightInset,
            child: RepaintBoundary(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      _Pill(
                        child: Text(
                          '${index + 1} / $totalGames',
                          style: const TextStyle(
                            color: Color(0xFF1E293B),
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _Pill(
                        background: const Color(0xFF2563EB),
                        border: const Color(0xFF2563EB),
                        child: Text(
                          game.category.toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),

                  Row(
                    children: [
                      if (highScore > 0)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _Pill(
                            background: const Color(0xFFFEF3C7),
                            border: const Color(0xFFFCD34D),
                            child: Text(
                              '🏆 $highScore',
                              style: const TextStyle(
                                color: Color(0xFFB45309),
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                      _RoundButton(
                        icon: Icons.download_for_offline_rounded,
                        iconColor: const Color(0xFF16A34A),
                        onTap: () => DownloadSheet.show(context),
                      ),
                      const SizedBox(width: 6),
                      _RoundButton(
                        icon: isMuted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                        iconColor: isMuted ? const Color(0xFFEF4444) : const Color(0xFF1E293B),
                        onTap: () => feedNotifier.toggleSound(),
                      ),
                      const SizedBox(width: 6),
                      _RoundButton(
                        icon: Icons.refresh_rounded,
                        iconColor: const Color(0xFF1E293B),
                        onTap: () => feedNotifier.restartCurrentGame(),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // Bottom bar
          if (_showInfoBar)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: RepaintBoundary(
              child: IgnorePointer(
                child: Container(
                  padding: EdgeInsets.fromLTRB(20, 14, rightInset + 4, 18),
                  color: const Color(0xFFF8F6F0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              game.title,
                              style: const TextStyle(
                                color: Color(0xFF0F172A),
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              game.description,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xFF475569),
                                fontSize: 13,
                                height: 1.3,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.keyboard_arrow_up_rounded, color: Color(0xFF64748B), size: 26),
                          Text(
                            'Swipe',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final Widget child;
  final Color background;
  final Color border;

  const _Pill({
    required this.child,
    this.background = const Color(0xFFFFFFFF),
    this.border = const Color(0xFFE2E8F0),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: border, width: 1.2),
      ),
      child: child,
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final VoidCallback onTap;

  const _RoundButton({
    required this.icon,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: const Color(0xFFFFFFFF),
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFFE2E8F0), width: 1.2),
        ),
        child: Icon(icon, color: iconColor, size: 20),
      ),
    );
  }
}
