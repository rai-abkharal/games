import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

typedef BridgeEventListener = void Function(
  String action,
  Map<String, dynamic> payload,
);

class GameRuntimeMetrics {
  final double fps;
  final double frameTimeMs;
  final DateTime receivedAt;

  const GameRuntimeMetrics({
    required this.fps,
    required this.frameTimeMs,
    required this.receivedAt,
  });
}

class GameBridgeController {
  WebViewController? _webViewController;
  final Set<BridgeEventListener> _listeners = {};

  // Updated by the Phaser loop once per second. This is deliberately separate
  // from Riverpod feed state so metrics do not rebuild the whole PageView.
  final ValueNotifier<GameRuntimeMetrics?> runtimeMetrics =
      ValueNotifier<GameRuntimeMetrics?>(null);

  void attachController(WebViewController controller) {
    _webViewController = controller;
    runtimeMetrics.value = null;
  }

  void detachController([WebViewController? controller]) {
    if (controller == null || identical(_webViewController, controller)) {
      _webViewController = null;
      runtimeMetrics.value = null;
    }
  }

  void addListener(BridgeEventListener listener) {
    _listeners.add(listener);
  }

  void removeListener(BridgeEventListener listener) {
    _listeners.remove(listener);
  }

  void handleIncomingMessage(String rawMessage) {
    try {
      final decoded = jsonDecode(rawMessage) as Map<String, dynamic>;
      final action = decoded['action'] as String? ?? 'unknown';
      final payload = (decoded['payload'] as Map<String, dynamic>?) ?? {};

      if (action == 'haptic') {
        _triggerHaptic(payload['type'] as String?);
      } else if (action == 'metrics') {
        final fps = (payload['fps'] as num?)?.toDouble();
        final frameTimeMs = (payload['frameTimeMs'] as num?)?.toDouble();
        if (fps != null && frameTimeMs != null) {
          runtimeMetrics.value = GameRuntimeMetrics(
            fps: fps,
            frameTimeMs: frameTimeMs,
            receivedAt: DateTime.now(),
          );
        }
      }

      for (final listener in _listeners.toList(growable: false)) {
        try {
          listener(action, payload);
        } catch (_) {}
      }
    } catch (_) {}
  }

  void _triggerHaptic(String? type) {
    switch (type) {
      case 'light':
        HapticFeedback.lightImpact();
        break;
      case 'medium':
        HapticFeedback.mediumImpact();
        break;
      case 'heavy':
        HapticFeedback.heavyImpact();
        break;
      case 'success':
        HapticFeedback.lightImpact();
        break;
      case 'error':
        HapticFeedback.heavyImpact();
        break;
      default:
        HapticFeedback.selectionClick();
    }
  }

  Future<void> sendPause() async {
    if (_webViewController == null) return;
    try {
      await _webViewController!.runJavaScript('''
        if (window.GameBridge && window.GameBridge.pause) {
          window.GameBridge.pause();
        } else {
          window.dispatchEvent(new CustomEvent('flutter:pause'));
        }
      ''');
    } catch (_) {}
  }

  Future<void> sendResume() async {
    if (_webViewController == null) return;
    try {
      await _webViewController!.runJavaScript('''
        if (window.GameBridge && window.GameBridge.resume) {
          window.GameBridge.resume();
        } else {
          window.dispatchEvent(new CustomEvent('flutter:resume'));
        }
      ''');
    } catch (_) {}
  }

  Future<void> sendRestart() async {
    if (_webViewController == null) return;
    try {
      await _webViewController!.runJavaScript('''
        if (window.GameBridge && window.GameBridge.restart) {
          window.GameBridge.restart();
        } else {
          window.dispatchEvent(new CustomEvent('flutter:restart'));
        }
      ''');
    } catch (_) {}
  }

  Future<void> sendDestroy([WebViewController? controller]) async {
    final targetController = controller ?? _webViewController;
    if (targetController == null) return;
    runtimeMetrics.value = null;

    try {
      await targetController.runJavaScript('''
        try {
          if (window.GameBridge && window.GameBridge.destroy) {
            window.GameBridge.destroy();
          }
          if (window.__PHASER_GAME__) {
            window.__PHASER_GAME__.destroy(true);
            window.__PHASER_GAME__ = null;
          }
        } catch (_) {}
      ''');
    } catch (_) {}
  }

  Future<void> setSoundEnabled(bool enabled) async {
    if (_webViewController == null) return;
    try {
      await _webViewController!.runJavaScript('''
        if (window.GameBridge && window.GameBridge.setSoundEnabled) {
          window.GameBridge.setSoundEnabled($enabled);
        } else {
          window.dispatchEvent(new CustomEvent('flutter:sound', { detail: { enabled: $enabled } }));
        }
      ''');
    } catch (_) {}
  }

  void dispose() {
    _listeners.clear();
    runtimeMetrics.dispose();
  }
}
