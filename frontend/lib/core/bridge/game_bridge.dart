import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

typedef BridgeEventListener = void Function(String action, Map<String, dynamic> payload);

class GameBridgeController {
  WebViewController? _webViewController;
  final Set<BridgeEventListener> _listeners = {};

  void attachController(WebViewController controller) {
    _webViewController = controller;
  }

  void detachController() {
    _webViewController = null;
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

      // Handle native actions
      if (action == 'haptic') {
        _triggerHaptic(payload['type'] as String?);
      }

      // Notify external listeners
      for (final listener in _listeners) {
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
}
