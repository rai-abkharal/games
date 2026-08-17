import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../controllers/feed_controller.dart';

class PerformanceHud extends ConsumerStatefulWidget {
  const PerformanceHud({super.key});

  @override
  ConsumerState<PerformanceHud> createState() => _PerformanceHudState();
}

class _PerformanceHudState extends ConsumerState<PerformanceHud> {
  bool _isExpanded = false;
  double _fps = 60.0;
  double _frameTimeMs = 16.6;
  int _frameCount = 0;
  DateTime _lastFpsUpdate = DateTime.now();
  final List<double> _fpsHistory = [];

  Duration _lastFrameTimestamp = Duration.zero;
  int _bridgePingMs = 1;
  Timer? _pingTimer;

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addPersistentFrameCallback(_onFrame);

    // Periodic ping to test GameBridge response latency
    _pingTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      _testBridgeLatency();
    });
  }

  @override
  void dispose() {
    _pingTimer?.cancel();
    super.dispose();
  }

  void _onFrame(Duration timeStamp) {
    if (!mounted) return;

    if (_lastFrameTimestamp != Duration.zero) {
      final frameDuration = timeStamp - _lastFrameTimestamp;
      final ms = frameDuration.inMicroseconds / 1000.0;
      if (ms > 0 && ms < 200) {
        _frameTimeMs = ms;
      }
    }
    _lastFrameTimestamp = timeStamp;

    _frameCount++;
    final now = DateTime.now();
    final elapsed = now.difference(_lastFpsUpdate).inMilliseconds;

    if (elapsed >= 500) {
      final currentFps = (_frameCount * 1000.0) / elapsed;
      setState(() {
        _fps = currentFps.clamp(1.0, 120.0);
        _fpsHistory.add(_fps);
        if (_fpsHistory.length > 20) {
          _fpsHistory.removeAt(0);
        }
      });
      _frameCount = 0;
      _lastFpsUpdate = now;
    }
  }

  Future<void> _testBridgeLatency() async {
    final start = DateTime.now().microsecondsSinceEpoch;
    final bridge = ref.read(gameBridgeControllerProvider);
    try {
      await bridge.setSoundEnabled(
        !ref.read(feedControllerProvider).isSoundMuted,
      );
      final elapsed = (DateTime.now().microsecondsSinceEpoch - start) / 1000.0;
      if (mounted) {
        setState(() {
          _bridgePingMs = elapsed.round().clamp(0, 999);
        });
      }
    } catch (_) {}
  }

  Color _getFpsColor(double fps) {
    if (fps >= 55.0) return const Color(0xFF16A34A); // Emerald green
    if (fps >= 35.0) return const Color(0xFFD97706); // Amber
    return const Color(0xFFDC2626); // Red
  }

  @override
  Widget build(BuildContext context) {
    final feedState = ref.watch(feedControllerProvider);
    final cacheManager = ref.watch(gameCacheManagerProvider);
    final server = ref.watch(embeddedGameServerProvider);
    final currentGame = feedState.currentGame;

    final isCached = currentGame != null &&
        cacheManager.isGameCached(
          currentGame.id,
          currentGame.version,
          currentGame.sha256,
        );

    final fpsColor = _getFpsColor(_fps);

    return Positioned(
      top: 60,
      left: 16,
      right: 16,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. Compact Top Bar Pill Button
          GestureDetector(
            onTap: () {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: _isExpanded ? const Color(0xFF2563EB) : const Color(0xFFE2E8F0),
                  width: 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Pulse dot
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: fpsColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),

                  // FPS
                  Text(
                    '${_fps.toStringAsFixed(0)} FPS',
                    style: TextStyle(
                      color: fpsColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(width: 1, height: 12, color: const Color(0xFFCBD5E1)),
                  const SizedBox(width: 8),

                  // Frame Response Time
                  Text(
                    '${_frameTimeMs.toStringAsFixed(1)}ms',
                    style: const TextStyle(
                      color: Color(0xFF334155),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(width: 1, height: 12, color: const Color(0xFFCBD5E1)),
                  const SizedBox(width: 8),

                  // Cache tag
                  Text(
                    isCached ? '⚡ Cached' : '🌐 CDN',
                    style: TextStyle(
                      color: isCached ? const Color(0xFF059669) : const Color(0xFF2563EB),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 6),

                  Icon(
                    _isExpanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: const Color(0xFF64748B),
                  ),
                ],
              ),
            ),
          ),

          // 2. Expanded Real-Time Diagnostics Panel
          if (_isExpanded) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.96),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFCBD5E1), width: 1.2),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Title Bar
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.speed_rounded, color: Color(0xFF2563EB), size: 18),
                          SizedBox(width: 6),
                          Text(
                            'PERFORMANCE DIAGNOSTICS',
                            style: TextStyle(
                              color: Color(0xFF0F172A),
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          'v1.1.0 • Shelf :${server.isRunning ? "Active" : "Idle"}',
                          style: const TextStyle(
                            color: Color(0xFF475569),
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 20, color: Color(0xFFE2E8F0)),

                  // Performance Metrics Grid
                  Row(
                    children: [
                      _buildMetricCard(
                        'FRAME RATE',
                        '${_fps.toStringAsFixed(1)} FPS',
                        fpsColor,
                        'Target 60.0',
                      ),
                      const SizedBox(width: 8),
                      _buildMetricCard(
                        'RENDER LATENCY',
                        '${_frameTimeMs.toStringAsFixed(1)} ms',
                        _frameTimeMs <= 17.0 ? const Color(0xFF16A34A) : const Color(0xFFD97706),
                        'Ideal < 16.6ms',
                      ),
                      const SizedBox(width: 8),
                      _buildMetricCard(
                        'BRIDGE RESPONSE',
                        '$_bridgePingMs ms',
                        const Color(0xFF2563EB),
                        'IPC Latency',
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Architecture & Cache Info Rows
                  _buildInfoRow('Active Game', '${currentGame?.title ?? "N/A"} (${currentGame?.id ?? "N/A"})'),
                  _buildInfoRow('Feed Index', '${feedState.currentIndex + 1} / ${feedState.games.length} (Sliding Window Pool: 3)'),
                  _buildInfoRow(
                    'Preload Cache',
                    isCached ? 'Local Embedded Shelf Server (0ms)' : 'Streaming from Remote CDN',
                    valueColor: isCached ? const Color(0xFF059669) : const Color(0xFF2563EB),
                  ),
                  _buildInfoRow('Auto-Play State', 'Active & Unpaused (GameScene Direct Boot)'),
                  _buildInfoRow('Audio Channel', feedState.isSoundMuted ? 'Muted' : 'Unmuted / Active 🔊'),

                  const SizedBox(height: 12),

                  // Actions
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            await cacheManager.clearAllCache();
                            await ref.read(feedControllerProvider.notifier).loadFeed();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Cache wiped and re-downloading fresh!')),
                              );
                            }
                          },
                          icon: const Icon(Icons.delete_sweep_rounded, size: 16),
                          label: const Text('Clear Cache', style: TextStyle(fontSize: 12)),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFDC2626),
                            side: const BorderSide(color: Color(0xFFFCA5A5)),
                            padding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            ref.read(feedControllerProvider.notifier).restartCurrentGame();
                          },
                          icon: const Icon(Icons.replay_rounded, size: 16),
                          label: const Text('Re-Boot Game', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMetricCard(String label, String value, Color valueColor, String sub) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
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
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              style: TextStyle(
                color: valueColor,
                fontSize: 14,
                fontWeight: FontWeight.w900,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: 2),
            Text(
              sub,
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 9,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? const Color(0xFF0F172A),
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
