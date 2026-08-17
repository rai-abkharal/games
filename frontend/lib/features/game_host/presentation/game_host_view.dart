import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../../../core/constants/app_constants.dart';
import '../../../models/game_manifest.dart';
import '../../feed/controllers/feed_controller.dart';

class GameHostView extends ConsumerStatefulWidget {
  final GameItem game;
  final bool isActive;

  const GameHostView({
    super.key,
    required this.game,
    required this.isActive,
  });

  @override
  ConsumerState<GameHostView> createState() => _GameHostViewState();
}

class _GameHostViewState extends ConsumerState<GameHostView> {
  late final WebViewController _controller;
  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';
  double _downloadProgress = 0;

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  void _initWebView() {
    final bridgeController = ref.read(gameBridgeControllerProvider);
    late final PlatformWebViewControllerCreationParams params;

    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    _controller = WebViewController.fromPlatformCreationParams(params);
    if (_controller.platform is AndroidWebViewController) {
      unawaited(AndroidWebViewController.enableDebugging(false));
      final androidController = _controller.platform as AndroidWebViewController;
      unawaited(androidController.setMediaPlaybackRequiresUserGesture(false));
    }

    _controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8F6F0))
      ..addJavaScriptChannel(
        'FlutterGameBridge',
        onMessageReceived: (JavaScriptMessage message) {
          if (widget.isActive) {
            bridgeController.handleIncomingMessage(message.message);
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            return uri != null && _isAllowedTopLevelNavigation(uri)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
          onPageStarted: (_) {
            if (mounted && !_isLoading) {
              setState(() => _isLoading = true);
            }
          },
          onPageFinished: (_) {
            if (!mounted) return;

            setState(() {
              _isLoading = false;
              _downloadProgress = 1;
            });

            if (widget.isActive) {
              bridgeController.attachController(_controller);
              final isMuted = ref.read(feedControllerProvider).isSoundMuted;
              unawaited(bridgeController.setSoundEnabled(!isMuted));
              unawaited(bridgeController.sendResume());
            } else {
              unawaited(_pauseThisWebView());
            }
          },
          onWebResourceError: (WebResourceError error) {
            // This callback also receives favicon/subresource failures. Only a
            // main-frame failure means the game itself failed to load.
            if (!mounted || error.isForMainFrame == false) return;
            setState(() {
              _isLoading = false;
              _hasError = true;
              _errorMessage = error.description;
            });
          },
        ),
      );

    unawaited(_loadGame());
  }


  bool _isAllowedTopLevelNavigation(Uri uri) {
    if (uri.scheme == 'about' ||
        uri.scheme == 'data' ||
        uri.scheme == 'blob' ||
        uri.scheme == 'file') {
      return true;
    }

    if (uri.host == '127.0.0.1' || uri.host == 'localhost') {
      return uri.scheme == 'http';
    }

    final trustedBase = Uri.tryParse(AppConstants.defaultBaseUrl);
    if (trustedBase == null || trustedBase.host.isEmpty) return false;

    int effectivePort(Uri value) {
      if (value.hasPort) return value.port;
      return value.scheme == 'https' ? 443 : 80;
    }

    final sameOrigin = uri.scheme == trustedBase.scheme &&
        uri.host == trustedBase.host &&
        effectivePort(uri) == effectivePort(trustedBase);
    if (!sameOrigin) return false;

    return uri.scheme == 'https' || uri.scheme == 'http';
  }

  Future<void> _loadGame() async {
    if (mounted) {
      setState(() {
        _isLoading = true;
        _hasError = false;
        _errorMessage = '';
        _downloadProgress = 0;
      });
    }

    final cacheManager = ref.read(gameCacheManagerProvider);
    final server = ref.read(embeddedGameServerProvider);
    var loadUrl = widget.game.entryUrl;

    try {
      final entry = await cacheManager.prepareGame(
        widget.game,
        protectedGameKeys: {
          '${widget.game.id}_${widget.game.version}',
        },
        onProgress: (progress) {
          if (!mounted) return;
          setState(() => _downloadProgress = progress.clamp(0.0, 1.0).toDouble());
        },
      );

      if (!server.isRunning && cacheManager.cacheBaseDir != null) {
        try {
          await server.start(cacheManager.cacheBaseDir!.path);
        } catch (_) {
          // Loading the verified file directly remains a local fallback.
        }
      }

      if (server.isRunning) {
        loadUrl = '${server.baseUrl}/${widget.game.id}/${widget.game.version}/index.html';
      } else {
        loadUrl = Uri.file(entry.entryFilePath).toString();
      }
    } catch (error) {
      if (kReleaseMode) {
        if (!mounted) return;
        setState(() {
          _isLoading = false;
          _hasError = true;
          _errorMessage = 'Could not prepare a verified game package: $error';
        });
        return;
      }

      // Direct remote loading is kept only as a development convenience.
      loadUrl = widget.game.entryUrl;
    }

    if (!mounted) return;

    final loadUri = Uri.tryParse(loadUrl);
    if (loadUri == null || !_isAllowedTopLevelNavigation(loadUri)) {
      setState(() {
        _isLoading = false;
        _hasError = true;
        _errorMessage = 'Blocked untrusted game URL: $loadUrl';
      });
      return;
    }

    try {
      await _controller.loadRequest(loadUri);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
        _errorMessage = error.toString();
      });
    }
  }

  Future<void> _pauseThisWebView() async {
    try {
      await _controller.runJavaScript('''
        if (window.GameBridge) {
          window.GameBridge.setSoundEnabled(false);
          window.GameBridge.pause();
        }
      ''');
    } catch (_) {}
  }

  @override
  void didUpdateWidget(covariant GameHostView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive == oldWidget.isActive) return;

    final bridgeController = ref.read(gameBridgeControllerProvider);
    if (widget.isActive) {
      bridgeController.attachController(_controller);
      final isMuted = ref.read(feedControllerProvider).isSoundMuted;
      unawaited(bridgeController.setSoundEnabled(!isMuted));
      unawaited(bridgeController.sendResume());
    } else {
      unawaited(_pauseThisWebView());
    }
  }

  @override
  void dispose() {
    final bridgeController = ref.read(gameBridgeControllerProvider);
    unawaited(bridgeController.sendDestroy(_controller));
    bridgeController.detachController(_controller);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_isLoading)
          Container(
            color: const Color(0xFFF8F6F0),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 44,
                    height: 44,
                    child: CircularProgressIndicator(
                      value: _downloadProgress > 0 && _downloadProgress < 1
                          ? _downloadProgress
                          : null,
                      valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _downloadProgress > 0 && _downloadProgress < 1
                        ? 'Preparing ${widget.game.title} ${(_downloadProgress * 100).round()}%'
                        : 'Loading ${widget.game.title}...',
                    style: const TextStyle(
                      color: Color(0xFF1E293B),
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (_hasError)
          Container(
            color: const Color(0xFFF8F6F0),
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    color: Color(0xFFEF4444),
                    size: 48,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Failed to load game',
                    style: TextStyle(
                      color: Color(0xFF1E293B),
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _errorMessage,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton.icon(
                    onPressed: _loadGame,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try Again'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
