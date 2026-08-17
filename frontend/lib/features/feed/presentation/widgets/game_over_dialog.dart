import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../controllers/feed_controller.dart';

class GameOverModal extends ConsumerWidget {
  final VoidCallback onNextGame;

  const GameOverModal({
    super.key,
    required this.onNextGame,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedState = ref.watch(feedControllerProvider);
    final feedNotifier = ref.read(feedControllerProvider.notifier);
    final payload = feedState.lastGameOverPayload ?? {};
    final score = (payload['score'] as num?)?.toInt() ?? 0;
    final game = feedState.currentGame;
    final highScore = (game != null) ? (feedState.highScores[game.id] ?? score) : score;
    final isNewRecord = score >= highScore && score > 0;

    return Container(
      color: Colors.black.withValues(alpha: 0.4),
      child: Center(
        child: Container(
          width: MediaQuery.of(context).size.width * 0.85,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: isNewRecord ? const Color(0xFFF59E0B) : const Color(0xFFE2E8F0),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 32,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isNewRecord)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFFCD34D), width: 1),
                  ),
                  child: const Text(
                    '🎉 NEW BEST SCORE!',
                    style: TextStyle(
                      color: Color(0xFFB45309),
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),

              Text(
                game?.title ?? 'GAME OVER',
                style: const TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 14),

              Text(
                '$score',
                style: const TextStyle(
                  color: Color(0xFF2563EB),
                  fontSize: 54,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1,
                ),
              ),
              const Text(
                'POINTS SCORED',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                ),
              ),

              const SizedBox(height: 28),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => feedNotifier.restartCurrentGame(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF1E293B),
                        side: const BorderSide(color: Color(0xFFCBD5E1), width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: const Text('Replay', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        feedNotifier.dismissGameOver();
                        onNextGame();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: const Text('Next Game', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
