import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../download/controllers/download_controller.dart';
import '../../controllers/feed_controller.dart';

class ModeSelectionDialog extends ConsumerWidget {
  const ModeSelectionDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const ModeSelectionDialog(),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final downloadNotifier = ref.read(downloadControllerProvider.notifier);
    final feedState = ref.watch(feedControllerProvider);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header Icon & Title
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFBFDBFE), width: 1.5),
              ),
              child: const Icon(Icons.videogame_asset_rounded, color: Color(0xFF2563EB), size: 28),
            ),
            const SizedBox(height: 16),
            const Text(
              'HOW DO YOU WANT TO PLAY?',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: Color(0xFF0F172A),
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Choose your preferred gaming experience. You can switch anytime!',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Color(0xFF64748B),
                height: 1.35,
              ),
            ),
            const SizedBox(height: 20),

            // Option 1: Native Download & Offline Play (Recommended)
            _buildModeCard(
              context: context,
              title: '⚡ Download & Play Offline',
              badge: 'RECOMMENDED',
              badgeColor: const Color(0xFF16A34A),
              description: 'Downloads games to device storage. Locked 60 FPS, 0ms network latency, and 100% offline play.',
              borderColor: const Color(0xFF16A34A),
              buttonColor: const Color(0xFF16A34A),
              buttonText: 'Download & Play (60 FPS)',
              onSelect: () async {
                await downloadNotifier.setPlayMode(PlayMode.offlineDownloaded);
                if (context.mounted) Navigator.of(context).pop();
                // Start background batch download
                downloadNotifier.downloadAllGames(feedState.games);
              },
            ),

            const SizedBox(height: 12),

            // Option 2: Instant Online Stream Mode
            _buildModeCard(
              context: context,
              title: '🌐 Instant Online Stream',
              badge: 'LIGHTWEIGHT',
              badgeColor: const Color(0xFF2563EB),
              description: 'Streams directly from cloud CDN. Saves phone storage space and starts playing immediately.',
              borderColor: const Color(0xFFCBD5E1),
              buttonColor: const Color(0xFF2563EB),
              buttonText: 'Play Online Stream',
              onSelect: () async {
                await downloadNotifier.setPlayMode(PlayMode.onlineStream);
                if (context.mounted) Navigator.of(context).pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildModeCard({
    required BuildContext context,
    required String title,
    required String badge,
    required Color badgeColor,
    required String description,
    required Color borderColor,
    required Color buttonColor,
    required String buttonText,
    required VoidCallback onSelect,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: 1.4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    color: badgeColor,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF64748B),
              height: 1.3,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onSelect,
              style: ElevatedButton.styleFrom(
                backgroundColor: buttonColor,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
              child: Text(
                buttonText,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
