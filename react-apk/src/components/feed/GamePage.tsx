import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { FEED, NETWORK } from '../../config/env';
import type { PageSlot } from '../../feed/preloadPlanner';
import {
  BRIDGE_BOOTSTRAP_SCRIPT,
  DESTROY_SCRIPT,
  PAUSE_SCRIPT,
  buildPauseScript,
  buildResumeScript,
  buildSavedStateScript,
  parseGameMessage,
} from '../../services/gameBridge';
import { gamePrefetcher } from '../../services/gamePrefetcher';
import { usePlayerStore } from '../../store/playerStore';
import { GAME_SURFACE, GLASS, HUD, THEMES } from '../../theme/themes';
import type { GameToHostMessage } from '../../types/bridge';
import type { GameItem } from '../../types/game';
import { displayCategory } from '../../utils/misc';
import { buildGameEntryUrl } from '../../utils/url';
import { MessageView } from '../StateViews';

export type PagePhase = 'idle' | 'loading' | 'ready' | 'error';

export interface GamePageHandle {
  inject: (script: string) => void;
  /** Immediate freeze (app backgrounded, screen left). */
  pause: () => void;
  /** Wake with the current sound preference. */
  resume: () => void;
  retry: () => void;
  phase: () => PagePhase;
}

interface Props {
  game: GameItem;
  slot: PageSlot;
  /** Whether this page may create its WebView right now (see FeedScreen's load gating). */
  mayLoad: boolean;
  /** Render placeholder chrome (only for pages near the current one). */
  near: boolean;
  /**
   * The host cannot show gameplay right now (app in background, Settings on
   * top, full-screen ad). Even the active page stays frozen while this is set,
   * which also covers a load that finishes while the app is backgrounded.
   */
  suspended: boolean;
  /** Callbacks are keyed by game id, which stays valid across catalogue reorders. */
  onPhase: (gameId: string, phase: PagePhase) => void;
  onMessage: (gameId: string, message: GameToHostMessage) => void;
}

type WebSource = { uri: string } | { html: string; baseUrl: string };

/**
 * One page of the feed — item_game_page.xml. Owns a WebView only while its
 * slot allows one:
 *
 *  - `active`  → creates the WebView as soon as `mayLoad` (after the pager has
 *                settled) and runs the game at full speed;
 *  - `ahead`   → creates it once the feed says the active game is ready,
 *                loads, renders its first frames, then is frozen;
 *  - `behind`  → keeps whatever it has (frozen) so swiping back is instant;
 *  - `leaving` → same as behind, for a page the pager is sliding out of the
 *                window; it is unmounted once the pager rests;
 *  - `far`     → tears the WebView down and frees its memory.
 *
 * A prefetched document (GamePrefetcher) is rendered from memory via
 * `source.html`; otherwise the cache-busted entry URL is loaded, exactly like
 * GameFeedAdapter. Load failures, timeouts and renderer crashes surface as a
 * retry state instead of taking the feed down.
 */
export const GamePage = memo(
  forwardRef<GamePageHandle, Props>(function GamePageInner({ game, slot, mayLoad, near, suspended, onPhase, onMessage }, ref) {
    const webviewRef = useRef<WebView<object>>(null);
    const [live, setLive] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhaseState] = useState<PagePhase>('idle');
    const [errorText, setErrorText] = useState<string | null>(null);
    const [placeholderShown, setPlaceholderShown] = useState(true);
    const phaseRef = useRef<PagePhase>('idle');
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoRetried = useRef(false);
    const placeholderOpacity = useRef(new Animated.Value(1)).current;

    const setPhase = useCallback(
      (next: PagePhase) => {
        if (phaseRef.current === next) return;
        phaseRef.current = next;
        setPhaseState(next);
        onPhase(game.id, next);
      },
      [game.id, onPhase],
    );

    const clearTimer = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }, []);

    useEffect(() => {
      if (slot === 'far') {
        if (live) {
          // Tear the engine down while the view still exists (GameViewHolder.cleanup).
          try {
            webviewRef.current?.injectJavaScript(DESTROY_SCRIPT);
          } catch {
            /* ignore */
          }
          setLive(false);
        }
        return;
      }
      // "behind" and "leaving" only retain a WebView they already have;
      // starting a fresh load there would put another page on the shared
      // Blink main thread for a game the player has just left.
      if (slot === 'behind' || slot === 'leaving') return;
      if (mayLoad && !live) setLive(true);
    }, [slot, mayLoad, live]);

    // Source is decided once per WebView instance so a catalogue refresh (new
    // game object, same build) never reloads a running game.
    const sourceKey = `${game.id}:${game.version}:${game.updatedAt ?? game.sha256 ?? ''}`;
    const entryUrl = useMemo(() => buildGameEntryUrl(game), [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const source = useMemo<WebSource | null>(() => {
      if (!live) return null;
      const prefetched = gamePrefetcher.get(game);
      return prefetched ? { html: prefetched.html, baseUrl: prefetched.baseUrl } : { uri: entryUrl };
    }, [live, attempt, sourceKey, entryUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load lifecycle: a WebView instance appears → loading with a hard timeout.
    useEffect(() => {
      if (!source) {
        clearTimer();
        setErrorText(null);
        setPhase('idle');
        placeholderOpacity.setValue(1);
        setPlaceholderShown(true);
        return;
      }
      setErrorText(null);
      setPhase('loading');
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'loading') {
          setErrorText('The game is taking too long to load.');
          setPhase('error');
        }
      }, NETWORK.gameLoadTimeoutMs);
      return clearTimer;
    }, [source, clearTimer, setPhase, placeholderOpacity]);

    useEffect(() => () => clearTimer(), [clearTimer]);

    /* ---------------- host → game --------------------------------------------- */
    const inject = useCallback((script: string) => {
      try {
        webviewRef.current?.injectJavaScript(script);
      } catch {
        /* the view may already be gone */
      }
    }, []);

    const injectSavedState = useCallback(() => {
      const store = usePlayerStore.getState();
      inject(
        buildSavedStateScript({
          level: store.getSavedLevel(game.id),
          coins: store.coins,
          highScore: store.getHighScore(game.id),
        }),
      );
    }, [game.id, inject]);

    const isResumedRef = useRef(false);

    const resume = useCallback(() => {
      if (phaseRef.current !== 'ready' || isResumedRef.current) return;
      isResumedRef.current = true;
      try {
        (webviewRef.current as any)?.requestFocus?.();
      } catch {
        /* ignore */
      }
      inject(buildResumeScript(!usePlayerStore.getState().soundMuted));
    }, [inject]);

    const pause = useCallback(() => {
      isResumedRef.current = false;
      if (phaseRef.current !== 'ready') return;
      inject(PAUSE_SCRIPT);
    }, [inject]);

    const retry = useCallback(() => {
      isResumedRef.current = false;
      if (live) inject(DESTROY_SCRIPT);
      setErrorText(null);
      setAttempt(value => value + 1);
      if (!live) setLive(true);
    }, [live, inject]);

    useImperativeHandle(
      ref,
      () => ({ inject, pause, resume, retry, phase: () => phaseRef.current }),
      [inject, pause, resume, retry],
    );

    // Becoming the page on screen wakes the game (GameFeedAdapter.handlePageSelected
    // + MainActivity.onPageSelected's saved-state push); leaving it freezes it.
    // Right after a load, an offscreen page keeps a few frames of grace so its
    // title screen is rendered before the freeze (native pauses offscreen
    // pages in onPageFinished, after their first paint).
    // This effect is the single source of truth for the game's run state, so a
    // load that completes while the app is in the background (or an ad is up)
    // is frozen instead of resumed, and un-suspending wakes exactly the page on
    // screen.
    const justLoaded = useRef(false);
    useEffect(() => {
      if (phase !== 'ready') return;
      const fresh = justLoaded.current;
      justLoaded.current = false;
      if (slot === 'active' && !suspended) {
        injectSavedState();
        resume();
      } else if (fresh && slot !== 'active') {
        injectSavedState();
        inject(buildPauseScript(FEED.preloadGraceFrames));
      } else {
        pause();
      }
    }, [slot, phase, suspended, injectSavedState, resume, pause, inject]);

    // Safety fallback: once the page is ready, ensure placeholder cannot linger
    useEffect(() => {
      if (phase === 'ready') {
        const timer = setTimeout(() => {
          setPlaceholderShown(false);
        }, 150);
        return () => clearTimeout(timer);
      }
    }, [phase]);

    // A page that failed while it was being prepared gets one automatic retry
    // when the player actually reaches it (the network may be back).
    useEffect(() => {
      if (slot === 'active' && phase === 'error' && !autoRetried.current) {
        autoRetried.current = true;
        retry();
      }
    }, [slot, phase, retry]);

    /* ---------------- WebView callbacks --------------------------------------- */
    const handleLoadEnd = useCallback(() => {
      if (phaseRef.current !== 'loading') return;
      clearTimer();
      justLoaded.current = true;
      setPhase('ready');
      Animated.timing(placeholderOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        setPlaceholderShown(false);
      });
    }, [clearTimer, setPhase, placeholderOpacity]);

    // A game that navigates or reloads itself (some restart via location.reload)
    // goes back through the placeholder → ready cycle so it is re-primed with
    // saved state and the right pause/resume state, like onPageFinished does.
    const handleLoadStart = useCallback(() => {
      if (phaseRef.current !== 'ready') return;
      isResumedRef.current = false; // the new document must be resumed again
      placeholderOpacity.setValue(1);
      setPlaceholderShown(true);
      setPhase('loading');
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'loading') {
          setErrorText('The game is taking too long to load.');
          setPhase('error');
        }
      }, NETWORK.gameLoadTimeoutMs);
    }, [clearTimer, setPhase, placeholderOpacity]);

    const fail = useCallback(
      (message: string) => {
        if (phaseRef.current === 'error' || phaseRef.current === 'idle') return;
        clearTimer();
        setErrorText(message);
        setPhase('error');
      },
      [clearTimer, setPhase],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const parsed = parseGameMessage(event.nativeEvent.data);
        if (parsed) onMessage(game.id, parsed);
      },
      [game.id, onMessage],
    );

    const dark = THEMES.midnight_dark;
    const showPlaceholder = near && (placeholderShown || !live);
    const animateLoadLine = slot === 'active' && phase === 'loading';

    return (
      <View style={styles.root} collapsable={false}>
        {source ? (
          <WebView<object>
            key={`${sourceKey}:${attempt}`}
            ref={webviewRef}
            source={source}
            style={styles.web}
            containerStyle={styles.web}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scalesPageToFit
            allowFileAccess
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mixedContentMode="always"
            cacheEnabled
            cacheMode="LOAD_DEFAULT"
            overScrollMode="never"
            bounces={false}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            setSupportMultipleWindows={false}
            setBuiltInZoomControls={false}
            textZoom={100}
            // No forced hardware layer: WebView composites through its own draw
            // functor; a LAYER_TYPE_HARDWARE wrapper adds a full-screen GPU
            // texture per page and an extra copy per frame for the live game.
            // Let the pager intercept vertical drags exactly like ViewPager2 does
            // with a plain WebView child; touch zones are honoured by the pager.
            nestedScrollEnabled={false}
            injectedJavaScriptBeforeContentLoaded={BRIDGE_BOOTSTRAP_SCRIPT}
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly
            onMessage={handleMessage}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onError={event => fail(event.nativeEvent.description || 'The game could not be loaded.')}
            onHttpError={event => {
              if (event.nativeEvent.url === entryUrl || event.nativeEvent.url.startsWith(game.entryUrl)) {
                fail(`Server responded with HTTP ${event.nativeEvent.statusCode}.`);
              }
            }}
            onRenderProcessGone={() => fail('The game crashed. Tap retry to relaunch it.')}
            onContentProcessDidTerminate={() => fail('The game crashed. Tap retry to relaunch it.')}
            webviewDebuggingEnabled={__DEV__}
          />
        ) : null}

        {showPlaceholder ? (
          <Animated.View style={[styles.placeholder, { opacity: placeholderOpacity }]} pointerEvents="none">
            <View pointerEvents="none" style={styles.logoCircle}>
              <Text pointerEvents="none" style={styles.logoEmoji}>🎮</Text>
            </View>
            <Text pointerEvents="none" style={styles.placeholderTitle} numberOfLines={2} allowFontScaling={false}>
              {game.title}
            </Text>
            <Text pointerEvents="none" style={styles.placeholderMeta} allowFontScaling={false}>
              {displayCategory(game.category).toUpperCase()} • 120 FPS ENGINE
            </Text>
            <LoadingLine animate={animateLoadLine} />
          </Animated.View>
        ) : null}

        {phase === 'error' ? (
          <View style={styles.errorWrap}>
            <MessageView
              theme={dark}
              emoji="📡"
              title="Couldn't load this game"
              body={errorText ?? undefined}
              actionLabel="Retry"
              onAction={retry}
            />
          </View>
        ) : null}
      </View>
    );
  }),
);

/** The 4 dp indeterminate gradient line at the top of the placeholder. */
function LoadingLine({ animate }: { animate: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!animate || width <= 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, width, progress]);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width] });
  return (
    <View pointerEvents="none" style={styles.loadTrack} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {animate ? (
        <Animated.View pointerEvents="none" style={[styles.loadBar, { width: width * 0.6, transform: [{ translateX }] }]}>
          <View pointerEvents="none" style={[styles.loadSegment, styles.loadSky]} />
          <View pointerEvents="none" style={[styles.loadSegment, styles.loadIndigo]} />
          <View pointerEvents="none" style={[styles.loadSegment, styles.loadPink]} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GAME_SURFACE, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: GAME_SURFACE },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GAME_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GLASS.placeholderCircle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 36 },
  placeholderTitle: {
    marginTop: 20,
    color: HUD.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  placeholderMeta: {
    marginTop: 6,
    color: GLASS.placeholderAccent,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  loadTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: GLASS.placeholderCircle,
    overflow: 'hidden',
  },
  loadBar: { height: 4, flexDirection: 'row' },
  loadSegment: { flex: 1, height: 4 },
  loadSky: { backgroundColor: '#38BDF8' },
  loadIndigo: { backgroundColor: '#818CF8' },
  loadPink: { backgroundColor: '#EC4899' },
  errorWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GAME_SURFACE,
  },
});
