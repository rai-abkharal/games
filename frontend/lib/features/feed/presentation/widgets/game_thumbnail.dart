import 'package:flutter/material.dart';
import '../../../../models/game_manifest.dart';

/// Static stand-in for a game page.
///
/// This replaces the old pre-rendered background WebViews. It is a plain
/// image, so it costs nothing to composite and it can be dragged during a
/// swipe without touching the GPU budget the live game needs.
class GameThumbnail extends StatelessWidget {
  final GameItem game;
  final bool showSpinner;

  const GameThumbnail({
    super.key,
    required this.game,
    this.showSpinner = false,
  });

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: Container(
        color: const Color(0xFFF8F6F0),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (game.thumbnailUrl.isNotEmpty)
              Image.network(
                game.thumbnailUrl,
                fit: BoxFit.cover,
                gaplessPlayback: true,
                filterQuality: FilterQuality.low,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showSpinner) ...[
                    const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 3,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFFFF),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Text(
                      game.title,
                      style: const TextStyle(
                        color: Color(0xFF1E293B),
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
