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
import { analytics } from '../../services/analytics';
import { localUrlFor, useDownloadStore, type BundleDownload } from '../../services/gameBundles';
import { GAME_VIEWPORT_SCRIPT } from '../../services/gameViewport';
import { usePlayerStore } from '../../store/playerStore';
import { GAME_SURFACE, GLASS, HUD, THEMES } from '../../theme/themes';
import type { GameToHostMessage } from '../../types/bridge';
import type { GameItem } from '../../types/game';
import { displayCategory } from '../../utils/misc';
import { buildGameEntryUrl } from '../../utils/url';
import { MessageView } from '../StateViews';

/**
 * What the page's WebView is doing. Deliberately not where the *download* is:
 * a bundle arriving and a document parsing are different questions with
 * different owners, and the feed's gating decisions (may a standby exist, is
 * the first game up) only ever ask about the WebView. What the player is told
 * about a download lives in `statusLabel`, which reads the download store
 * directly.
 */
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

type WebSource = { uri: string };
const BOOTSTRAP_SCRIPT = BRIDGE_BOOTSTRAP_SCRIPT + GAME_VIEWPORT_SCRIPT;

/**
 * One page of the feed — item_game_page.xml. Owns a WebView only while its
 * slot allows one:
 *
 *  - `active`  → creates the WebView as soon as `mayLoad` (after the pager has
 *                settled) and runs the game at full speed;
 *  - `ahead`   retains a previously visited view; cold pages stay placeholders;
 *  - `behind`  → keeps whatever it has (frozen) so swiping back is instant;
 *  - `leaving` → same as behind, for a page the pager is sliding out of the
 *                window; it is unmounted once the pager rests;
 *  - `far`     → tears the WebView down and frees its memory.
 *
 * A build stored on the device is loaded from the loopback origin; otherwise
 * the cache-busted entry URL is loaded straight from the server. Load failures,
 * timeouts and renderer crashes surface as a retry state instead of taking the
 * feed down.
 */
export const GamePage = memo(
  forwardRef<GamePageHandle, Props>(function GamePageInner({ game, slot, mayLoad, near, suspended, onPhase, onMessage }, ref) {
    const webviewRef = useRef<WebView<object>>(null);
    // The selected page can create its view in the first commit. Neighbors
    // still cannot initialize an engine, even when their load gate is open.
    const [live, setLive] = useState(() => slot === 'active' && mayLoad && !suspended);
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhaseState] = useState<PagePhase>('idle');
    const [errorText, setErrorText] = useState<string | null>(null);
    const [placeholderShown, setPlaceholderShown] = useState(true);
    const phaseRef = useRef<PagePhase>('idle');
    /**
     * Stage timings for the load in flight, in the order they happen:
     * the WebView being created, the document being fetched and parsed, and
     * (from the game's own side of the bridge) its engine booting and painting.
     * Reported once, as a single `game_load` event, when the load settles.
     */
    const timingRef = useRef<{
      startedAt: number;
      loadStartAt: number;
      source: 'local' | 'network';
      loadKey: string;
      domMs?: number;
      loadMs?: number;
      firstFrameMs?: number;
    } | null>(null);
    /** True once the player has actually been on this page, not just warmed it. */
    const visitedRef = useRef(false);
    const isResumedRef = useRef(false);
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
      if (slot === 'active') visitedRef.current = true;
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
      // Offscreen pages retain an existing view only. A cold engine cannot
      // be preempted by setting mayLoad=false after it has begun parsing.
      if (slot !== 'active') {
        // A fast swipe can leave the selected game before its load finishes.
        // Retain completed games only; otherwise that abandoned load competes
        // with the new foreground game. Slot changes occur after the snap.
        if (live && phaseRef.current === 'loading') {
          webviewRef.current?.stopLoading();
          setLive(false);
          return;
        }
        return;
      }
      if (mayLoad && !live) setLive(true);
    }, [slot, mayLoad, live, phase]);

    // Source is decided once per WebView instance so a catalogue refresh (new
    // game object, same build) never reloads a running game. `buildId` is part
    // of the key: a genuinely new build *should* replace the document.
    const sourceKey = `${game.id}:${game.version}:${game.buildId ?? game.updatedAt ?? game.sha256 ?? ''}`;
    const entryUrl = useMemo(() => buildGameEntryUrl(game), [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const localUrl = live ? localUrlFor(game) : null;
    const source = useMemo<WebSource | null>(() => {
      if (!live) return null;
      // Two possibilities, and only two: the build stored on this device
      // (served over the loopback origin — no network, and a real http origin
      // so module scripts, fonts, fetch and localStorage behave exactly as
      // they always have), or the server. There is no longer a third path
      // handing over a document held in JS memory.
      //
      // Read once, when this WebView comes to life. A bundle that finishes
      // downloading while the page is already running must *not* swap the
      // source underneath it — that would reload a game mid-play. The local
      // copy is picked up the next time the page is created.
      return { uri: localUrlFor(game) ?? entryUrl };
    }, [live, attempt, sourceKey, entryUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Publishes one `game_load` event for the attempt that just settled.
     *
     * Keyed by game + build + attempt, so a WebView that remounts or a React
     * re-render that replays an effect cannot turn a single load into several
     * rows — which is the usual way a load-time metric ends up wrong in the
     * direction that flatters it.
     */
    const reportLoad = useCallback(
      (outcome: 'ready' | 'error' | 'timeout', error?: string) => {
        const timing = timingRef.current;
        if (!timing) return;
        const finishedAt = Date.now();
        analytics.onGameLoad(game.id, {
          fallbackTitle: game.title,
          category: game.category,
          outcome,
          source: timing.source,
          loadKey: timing.loadKey,
          // Creating the view and getting the first byte of the document.
          webviewMs: timing.loadStartAt > 0 ? timing.loadStartAt - timing.startedAt : 0,
          // Document fetched and parsed to DOMContentLoaded, measured inside
          // the page so it excludes everything the host was doing around it.
          htmlMs: timing.domMs ?? 0,
          // DOMContentLoaded to window.load: scripts, the engine booting.
          engineMs: timing.domMs !== undefined && timing.loadMs !== undefined
            ? Math.max(0, timing.loadMs - timing.domMs)
            : 0,
          firstFrameMs: timing.firstFrameMs ?? 0,
          totalMs: finishedAt - timing.startedAt,
          error,
        });
        timingRef.current = null;
      },
      [game.id, game.title, game.category],
    );

    // Load lifecycle: a WebView instance appears → loading with a hard timeout.
    useEffect(() => {
      isResumedRef.current = false;
      if (!source) {
        clearTimer();
        timingRef.current = null;
        setErrorText(null);
        setPhase('idle');
        placeholderOpacity.setValue(1);
        setPlaceholderShown(true);
        return;
      }
      timingRef.current = {
        startedAt: Date.now(),
        loadStartAt: 0,
        // Decided here rather than at report time: the bundle may well finish
        // downloading while this very load is running, and the load being
        // measured is the one that started against the network.
        source: source.uri.startsWith('http://127.0.0.1') ? 'local' : 'network',
        loadKey: `${game.id}:${sourceKey}:${attempt}`,
      };
      setErrorText(null);
      setPhase('loading');
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'loading') {
          reportLoad('timeout', 'The game is taking too long to load.');
          setErrorText('The game is taking too long to load.');
          setPhase('error');
        }
      }, NETWORK.gameLoadTimeoutMs);
      return clearTimer;
    }, [source, clearTimer, setPhase, placeholderOpacity]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const activePrimed = useRef(false);
    useEffect(() => {
      if (slot !== 'active') activePrimed.current = false;
      if (phase !== 'ready') return;
      const fresh = justLoaded.current;
      justLoaded.current = false;
      if (slot === 'active' && !suspended) {
        // A cancelled swipe resumes the same session; replaying saved state
        // here could reset gameplay and repeats bridge work on every drag.
        if (fresh || !activePrimed.current) injectSavedState();
        activePrimed.current = true;
        resume();
      } else if (fresh && slot !== 'active' && !suspended) {
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
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [phase]);

    // A new build is a new chance: a game that could not be loaded at one build
    // must not stay un-retryable for the life of the process just because an
    // earlier build failed once.
    useEffect(() => {
      autoRetried.current = false;
    }, [sourceKey]);

    // A page that failed while it was being prepared gets one automatic retry
    // when the player actually reaches it (the network may be back).
    useEffect(() => {
      if (slot === 'active' && phase === 'error' && !autoRetried.current) {
        autoRetried.current = true;
        retry();
      }
    }, [slot, phase, retry]);

    const dismissPlaceholder = useCallback(() => {
      Animated.timing(placeholderOpacity, {
        toValue: 0,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setPlaceholderShown(false);
      });
    }, [placeholderOpacity]);

    /* ---------------- WebView callbacks --------------------------------------- */
    const handleLoadEnd = useCallback(() => {
      if (phaseRef.current !== 'loading') return;
      clearTimer();
      justLoaded.current = true;
      setPhase('ready');
      // The in-page probe usually beats this; when it does not (a game that
      // never paints, a frozen standby) the event still goes out with the
      // stages the host could see on its own.
      reportLoad('ready');
      dismissPlaceholder();
    }, [clearTimer, setPhase, dismissPlaceholder, reportLoad]);

    // A game that navigates or reloads itself (some restart via location.reload)
    // goes back through the placeholder → ready cycle so it is re-primed with
    // saved state and the right pause/resume state, like onPageFinished does.
    const handleLoadStart = useCallback(() => {
      // First load: the document has started arriving, which closes the
      // "creating the WebView" stage.
      if (phaseRef.current === 'loading' && timingRef.current && !timingRef.current.loadStartAt) {
        timingRef.current.loadStartAt = Date.now();
        return;
      }
      if (phaseRef.current !== 'ready') return;
      isResumedRef.current = false; // the new document must be resumed again
      // A game that reloads itself (several restart via location.reload) is a
      // fresh load and gets its own timings and its own event.
      timingRef.current = {
        startedAt: Date.now(),
        loadStartAt: Date.now(),
        source: timingRef.current?.source ?? 'network',
        loadKey: `${game.id}:${sourceKey}:${attempt}:${Date.now()}`,
      };
      placeholderOpacity.setValue(1);
      setPlaceholderShown(true);
      setPhase('loading');
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'loading') {
          reportLoad('timeout', 'The game is taking too long to load.');
          setErrorText('The game is taking too long to load.');
          setPhase('error');
        }
      }, NETWORK.gameLoadTimeoutMs);
    }, [clearTimer, setPhase, placeholderOpacity, reportLoad, game.id, sourceKey, attempt]);

    const fail = useCallback(
      (message: string) => {
        if (phaseRef.current === 'error' || phaseRef.current === 'idle') return;
        clearTimer();
        reportLoad('error', message);
        setErrorText(message);
        setPhase('error');
      },
      [clearTimer, setPhase, reportLoad],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const parsed = parseGameMessage(event.nativeEvent.data);
        if (!parsed) return;
        if (parsed.type === 'perf') {
          // Boot timings measured inside the document. They belong to this
          // page's load event, not to the feed, so they stop here.
          const timing = timingRef.current;
          if (timing) {
            timing.domMs = parsed.domMs;
            timing.loadMs = parsed.loadMs;
            timing.firstFrameMs = parsed.firstFrameMs;
            if (phaseRef.current === 'ready') reportLoad('ready');
          }
          dismissPlaceholder();
          return;
        }
        onMessage(game.id, parsed);
      },
      [game.id, onMessage, reportLoad, dismissPlaceholder],
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
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
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
            injectedJavaScriptBeforeContentLoaded={BOOTSTRAP_SCRIPT}
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly
            onMessage={handleMessage}
            onLoadStart={handleLoadStart}
            onLoad={handleLoadEnd}
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
            <LoadingStatus
              gameId={game.id}
              buildId={game.buildId}
              cached={localUrl !== null}
              live={live}
              phase={phase}
              show={slot === 'active'}
            />
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

/**
 * The one line of text that tells the player what the wait is for.
 *
 * It subscribes to the download store on its own, by game id, and nothing else
 * in the tree does. Progress lands four times a second while a bundle is in
 * flight; if the page — let alone the feed — re-rendered on each tick, the
 * frames that cost would come out of the game running next door. Here the
 * re-render is one `<Text>`.
 */
function LoadingStatus({
  gameId,
  buildId,
  cached,
  live,
  phase,
  show,
}: {
  gameId: string;
  buildId?: string;
  cached: boolean;
  live: boolean;
  phase: PagePhase;
  show: boolean;
}) {
  const download = useDownloadStore(
    useCallback((state: { active: Record<string, BundleDownload> }) => state.active[gameId], [gameId]),
  );
  if (!show) return null;
  const label = statusLabel({ download, cached, live, phase, buildId });
  if (!label) return null;
  return (
    <Text pointerEvents="none" style={styles.placeholderStatus} allowFontScaling={false}>
      {label}
    </Text>
  );
}

/**
 * A game already on the device never shows a download line at all — there is
 * nothing to download, and saying "preparing" about a file that is already
 * there is the kind of honest-looking noise that makes an app feel slow.
 */
export function statusLabel({
  download,
  cached,
  live,
  phase,
  buildId,
}: {
  download?: BundleDownload;
  cached: boolean;
  live: boolean;
  phase: PagePhase;
  buildId?: string;
}): string | null {
  if (phase === 'ready' || phase === 'error') return null;
  if (cached) return live ? 'Starting…' : null;
  if (download && download.buildId === buildId) {
    if (download.failed) return 'Connection problem — retrying…';
    if (download.fraction !== null) return `Downloading ${Math.round(download.fraction * 100)}%`;
    return 'Downloading…';
  }
  // No local copy and nothing downloading: the document itself is coming over
  // the network, which is the path this app falls back to and not a failure.
  return live ? 'Starting…' : 'Preparing…';
}

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
  placeholderStatus: {
    marginTop: 14,
    color: HUD.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    opacity: 0.85,
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
