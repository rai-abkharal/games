import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/bridge/game_bridge.dart';
import '../../controllers/feed_controller.dart';

class _HostFrameMetrics {
  final double fps;
  final double frameTimeMs;

  const _HostFrameMetrics({
    this.fps = 60,
    this.frameTimeMs = 16.6,
  });
}

class PerformanceHud extends ConsumerStatefulWidget {
  const PerformanceHud({super.key});

  @override
  ConsumerState<PerformanceHud> createState() => _PerformanceHudState();
}

class _PerformanceHudState extends ConsumerState<PerformanceHud>
    with SingleTickerProviderStateMixin {
  final ValueNotifier<_HostFrameMetrics> _hostMetrics =
      ValueNotifier(const _HostFrameMetrics());

  Ticker? _ticker;
  Duration _lastTimestamp = Duration.zero;
  DateTime _sampleStartedAt = DateTime.now();
  int _sampleFrames = 0;
  double _latestHostFrameMs = 16.6;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    if (AppConstants.enablePerformanceHud && !kReleaseMode) {
      _ticker = createTicker(_onHostFrame)..start();
    }
  }

  void _onHostFrame(Duration timestamp) {
    if (_lastTimestamp != Duration.zero) {
      final elapsed = timestamp - _lastTimestamp;
      final milliseconds = elapsed.inMicroseconds / 1000;
      if (milliseconds > 0 && milliseconds < 250) {
        _latestHostFrameMs = milliseconds;
      }
    }
    _lastTimestamp = timestamp;
    _sampleFrames++;

    final now = DateTime.now();
    final sampleMs = now.difference(_sampleStartedAt).inMilliseconds;
    if (sampleMs < 500) return;

    _hostMetrics.value = _HostFrameMetrics(
      fps: ((_sampleFrames * 1000) / sampleMs).clamp(0, 240).toDouble(),
      frameTimeMs: _latestHostFrameMs,
    );
    _sampleFrames = 0;
    _sampleStartedAt = now;
  }

  @override
  void dispose() {
    _ticker?.dispose();
    _hostMetrics.dispose();
    super.dispose();
  }

  Color _fpsColor(double? fps) {
    if (fps == null) return const Color(0xFF64748B);
    if (fps >= 55) return const Color(0xFF16A34A);
    if (fps >= 35) return const Color(0xFFD97706);
    return const Color(0xFFDC2626);
  }

  @override
  Widget build(BuildContext context) {
    if (!AppConstants.enablePerformanceHud || kReleaseMode) {
      return const SizedBox.shrink();
    }
    final feed = ref.watch(feedControllerProvider);
    final cache = ref.read(gameCacheManagerProvider);
    final server = ref.read(embeddedGameServerProvider);
    final bridge = ref.read(gameBridgeControllerProvider);
    final currentGame = feed.currentGame;

    return Positioned(
      top: 56,
      left: 12,
      right: 12,
      child: SafeArea(
        bottom: false,
        child: ValueListenableBuilder<GameRuntimeMetrics?>(
          valueListenable: bridge.runtimeMetrics,
          builder: (context, gameMetrics, _) {
            return ValueListenableBuilder<_HostFrameMetrics>(
              valueListenable: _hostMetrics,
              builder: (context, hostMetrics, _) {
                final gameFps = gameMetrics?.fps;
                final cached = currentGame != null &&
                    cache.isGameCached(
                      currentGame.id,
                      currentGame.version,
                      currentGame.sha256,
                    );

                return Align(
                  alignment: Alignment.topCenter,
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => setState(() => _expanded = !_expanded),
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 620),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 9,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.94),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: const Color(0xFFCBD5E1)),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.10),
                              blurRadius: 12,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: _fpsColor(gameFps),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  gameFps == null
                                      ? 'Phaser FPS: waiting'
                                      : 'Phaser FPS: ${gameFps.toStringAsFixed(1)}',
                                  style: TextStyle(
                                    color: _fpsColor(gameFps),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(
                                  cached ? 'Verified cache' : 'Preparing / CDN',
                                  style: const TextStyle(
                                    color: Color(0xFF334155),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Icon(
                                  _expanded
                                      ? Icons.keyboard_arrow_up_rounded
                                      : Icons.keyboard_arrow_down_rounded,
                                  size: 18,
                                  color: const Color(0xFF64748B),
                                ),
                              ],
                            ),
                            if (_expanded) ...[
                              const Divider(height: 18),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  _metric(
                                    'PHASER / WEBGL',
                                    gameFps == null
                                        ? 'No sample'
                                        : '${gameFps.toStringAsFixed(1)} FPS',
                                  ),
                                  _metric(
                                    'PHASER DELTA',
                                    gameMetrics == null
                                        ? 'No sample'
                                        : '${gameMetrics.frameTimeMs.toStringAsFixed(1)} ms',
                                  ),
                                  _metric(
                                    'FLUTTER HOST',
                                    '${hostMetrics.fps.toStringAsFixed(1)} FPS',
                                  ),
                                  _metric(
                                    'HOST VSYNC DELTA',
                                    '${hostMetrics.frameTimeMs.toStringAsFixed(1)} ms',
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              _info(
                                'Active game',
                                currentGame == null
                                    ? 'None'
                                    : '${currentGame.title} (${currentGame.id})',
                              ),
                              _info(
                                'Runtime pool',
                                '1 WebView / 1 Phaser instance',
                              ),
                              _info(
                                'Feed position',
                                '${feed.currentIndex + 1} / ${feed.games.length}',
                              ),
                              _info(
                                'Local cache',
                                '${cache.cachedGameCount} games • '
                                    '${(cache.cachedBytes / 1024 / 1024).toStringAsFixed(1)} MB',
                              ),
                              _info(
                                'Local server',
                                server.isRunning ? 'Active' : 'Idle',
                              ),
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(
                                  'Phaser metrics come from game.loop.actualFps. '
                                  'Profile release-like builds on physical devices for final results.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 10,
                                    height: 1.3,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _metric(String label, String value) {
    return Container(
      width: 135,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 9,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _info(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
