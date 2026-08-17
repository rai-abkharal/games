import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
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

class _GameHostViewState extends ConsumerState<GameHostView>
    with AutomaticKeepAliveClientMixin {
  late final WebViewController _controller;
  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';

  @override
  bool get wantKeepAlive => true;

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
      AndroidWebViewController.enableDebugging(false);
      final androidController = _controller.platform as AndroidWebViewController;
      androidController.setMediaPlaybackRequiresUserGesture(false);
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
          onPageStarted: (String url) {
            if (mounted) setState(() => _isLoading = true);
          },
          onPageFinished: (String url) {
            if (mounted) {
              setState(() => _isLoading = false);
              final isMuted = ref.read(feedControllerProvider).isSoundMuted;

              if (widget.isActive) {
                bridgeController.attachController(_controller);
                bridgeController.setSoundEnabled(!isMuted);
                bridgeController.sendResume();
              } else {
                // Background pre-rendered instance: keep silent and paused
                _controller.runJavaScript('''
                  if (window.GameBridge) {
                    window.GameBridge.setSoundEnabled(false);
                    window.GameBridge.pause();
                  }
                ''');
              }
            }
          },
          onWebResourceError: (WebResourceError error) {
            if (mounted) {
              setState(() {
                _isLoading = false;
                _hasError = true;
                _errorMessage = error.description;
              });
            }
          },
        ),
      );

    _loadGame();
  }

  Future<void> _loadGame() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });

    final cacheManager = ref.read(gameCacheManagerProvider);
    final server = ref.read(embeddedGameServerProvider);

    String loadUrl = widget.game.entryUrl;

    // Check if cached locally with valid hash
    if (cacheManager.isGameCached(widget.game.id, widget.game.version, widget.game.sha256)) {
      final entry = cacheManager.getCachedEntry(widget.game.id, widget.game.version);
      if (entry != null) {
        if (!server.isRunning && cacheManager.cacheBaseDir != null) {
          await server.start(cacheManager.cacheBaseDir!.path);
        }
        if (server.isRunning) {
          loadUrl = '${server.baseUrl}/${widget.game.id}/${widget.game.version}/index.html';
        }
      }
    }

    try {
      await _controller.loadRequest(Uri.parse(loadUrl));
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _hasError = true;
          _errorMessage = e.toString();
        });
      }
    }
  }

  @override
  void didUpdateWidget(covariant GameHostView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final bridgeController = ref.read(gameBridgeControllerProvider);

    if (widget.isActive != oldWidget.isActive) {
      if (widget.isActive) {
        // Became active in viewport: Wake up engine loop & resume
        _controller.runJavaScript('''
          if (window.__PHASER_GAME__ && window.__PHASER_GAME__.loop) {
            window.__PHASER_GAME__.loop.wake();
          }
        ''');
        bridgeController.attachController(_controller);
        final isMuted = ref.read(feedControllerProvider).isSoundMuted;
        bridgeController.setSoundEnabled(!isMuted);
        bridgeController.sendResume();
      } else {
        // Scrolled away: Sleep engine RAF loop for 0.0% background CPU/GPU load
        _controller.runJavaScript('''
          if (window.GameBridge) {
            window.GameBridge.setSoundEnabled(false);
            window.GameBridge.pause();
          }
          if (window.__PHASER_GAME__ && window.__PHASER_GAME__.loop) {
            window.__PHASER_GAME__.loop.sleep();
          }
        ''');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    if (widget.isActive) {
      ref.read(gameBridgeControllerProvider).attachController(_controller);
    }

    return Stack(
      children: [
        // 1. WebView Game View
        WebViewWidget(controller: _controller),

        // 2. Loading State
        if (_isLoading)
          Container(
            color: const Color(0xFFF8F6F0),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Loading ${widget.game.title}...',
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

        // 3. Error / Retry State
        if (_hasError)
          Container(
            color: const Color(0xFFF8F6F0),
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline_rounded, color: Color(0xFFEF4444), size: 48),
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
