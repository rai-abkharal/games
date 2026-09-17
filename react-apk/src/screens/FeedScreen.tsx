import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Vibration, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FeedDock, type FeedTab } from '../components/feed/FeedDock';
import { FeedHeader } from '../components/feed/FeedHeader';
import { GamePage, type GamePageHandle, type PagePhase } from '../components/feed/GamePage';
import { GamePager } from '../components/feed/GamePager';
import { MessageView } from '../components/StateViews';
import { FEED, GAMEPLAY } from '../config/env';
import {
  clampIndex,
  prefetchOrder,
  slotFor,
  type PageSlot,
  type SwipeDirection,
} from '../feed/preloadPlanner';
import { useAppStateChange } from '../hooks/useAppState';
import { useIsMetered, useIsOffline } from '../hooks/useNetworkStatus';
import type { RootScreenProps } from '../navigation/types';
import { adManager, useAdsStore } from '../services/adManager';
import { analytics } from '../services/analytics';
import {
  BundlePriority,
  markBundlePlayed,
  setBundleObserver,
  setBundlePaused,
  setBundlePlaying,
  setBundlePolicy,
  syncBundles,
  warmBundle,
  type BundlePriorityValue,
} from '../services/gameBundles';
import { buildRewardScript, buildSoundScript } from '../services/gameBridge';
import { markFirstGameReady, useStartupStore } from '../services/startup';
import { findJoystickZone, JoystickTutorial } from '../components/tutorial/JoystickTutorial';
import { SwipeTutorial } from '../components/tutorial/SwipeTutorial';
import { useCatalogStore } from '../store/catalogStore';
import { usePlayerStore } from '../store/playerStore';
import { useTutorialStore } from '../store/tutorialStore';
import { toast } from '../store/toastStore';
import { useTheme } from '../theme/useTheme';
import { useTranslation } from '../i18n/translations';
import type { GameToHostMessage, HapticType } from '../types/bridge';
import type { GameItem } from '../types/game';

const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [0, 15, 50, 25],
  warning: [0, 20, 40, 20],
  error: [0, 30, 40, 30],
};

interface FeedPosition {
  index: number;
  direction: SwipeDirection;
  /** True between a swipe's release and the end of its snap animation. */
  settling: boolean;
}

/** Fields that matter for rendering a page; anything else changing must not rebuild the feed. */
function listSignature(games: GameItem[]): string {
  return games
    .map(
      game =>
        `${game.id}|${game.version}|${game.updatedAt ?? ''}|${game.buildId ?? ''}|${game.title}|${game.category}|${game.ads?.enabled ? '1' : '0'}|${game.ads?.intervalMinutes ?? ''}|${JSON.stringify(game.touchZones ?? [])}|${game.entryUrl}|${game.sha256 ?? ''}|${game.sizeBytes}`,
    )
    .join('\n');
}

/** Keeps the previous array when the catalogue refresh produced an equivalent list. */
function useStableList(games: GameItem[]): GameItem[] {
  const ref = useRef<{ signature: string; list: GameItem[] }>({ signature: '', list: [] });
  const signature = useMemo(() => listSignature(games), [games]);
  if (ref.current.signature !== signature) ref.current = { signature, list: games };
  return ref.current.list;
}

/**
 * The main screen — MainActivity: header, vertical game pager, floating dock.
 *
 * Loading strategy (see preloadPlanner):
 *   active page   → WebView created once the pager rests on it, runs at full speed
 *   ahead page    → placeholder only while a game is being played; may be
 *                   warmed into a standby WebView only in the idle window
 *                   between an explicit game end and the next run, and gives
 *                   that WebView back as soon as play resumes
 *   behind page   → keeps its frozen WebView so going back is instant
 *   leaving page  → the page a swipe pushes out of the window stays frozen
 *                   until the snap ends; only then is its WebView destroyed
 *   downloads     → the native bundle store, ordered current-first; JavaScript
 *                   never holds a game document (see services/gameBundles)
 *   everything else → nothing lives; WebViews two or more pages away are destroyed
 */
export function FeedScreen({ navigation }: RootScreenProps<'Feed'>) {
  const theme = useTheme();
  const { t } = useTranslation();
  // Resolve insets relative to this screen, not the outer navigation window.
  const offline = useIsOffline();
  const metered = useIsMetered();

  const games = useCatalogStore(state => state.games);
  const status = useCatalogStore(state => state.status);
  const error = useCatalogStore(state => state.error);
  // Only the empty-feed retry view shows this; selecting it unconditionally
  // re-rendered the whole feed twice on every background catalogue refresh.
  const refreshing = useCatalogStore(state => state.refreshing && state.games.length === 0);
  const favorites = usePlayerStore(state => state.favorites);
  // Player name, coins and best score are read by FeedHeader itself, so coins
  // changing during a game re-render the header, not the feed and its pager.
  const soundMuted = usePlayerStore(state => state.soundMuted);
  const bannerEnabled = useAdsStore(state => state.bannerEnabled);
  const fullScreenAdShowing = useAdsStore(state => state.fullScreenAdShowing);

  const [tab, setTab] = useState<FeedTab>('all');
  const filtered = useMemo(() => {
    if (tab !== 'favorites') return games;
    const set = new Set(favorites);
    return games.filter(game => set.has(game.id));
  }, [games, tab, favorites]);
  const list = useStableList(filtered);

  /* ---------------- position ------------------------------------------------- */
  const [position, setPosition] = useState<FeedPosition>(() => ({
    index: Math.max(0, list.findIndex(game => game.id === usePlayerStore.getState().lastPlayedGameId)),
    direction: 1, settling: false,
  }));
  const [committedIndex, setCommittedIndex] = useState<number | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const listRef = useRef(list);
  listRef.current = list;
  const currentIdRef = useRef<string | null>(usePlayerStore.getState().lastPlayedGameId);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [appActive, setAppActive] = useState(true);
  const [focused, setFocused] = useState(true);
  const suspended = !appActive || !focused || fullScreenAdShowing;
  const loop = list.length > 2;

  // Reconcile before committing children: starting page zero then correcting
  // in an effect used to create and abandon the wrong WebView at launch.
  const [positionList, setPositionList] = useState(list);
  if (positionList !== list) {
    setPositionList(list);
    if (list.length) {
      const wanted = list.findIndex(game => game.id === currentIdRef.current);
      const next = wanted >= 0 ? wanted : clampIndex(position.index, list.length);
      currentIdRef.current = list[next].id;
      setPosition({ index: next, direction: position.direction, settling: false });
    }
  }

  const current = list[position.index] ?? null;
  const currentId = current?.id ?? null;

  /* ---------------- page registry & phases ----------------------------------- */
  const pagesRef = useRef(new Map<string, GamePageHandle>());
  const refCallbacks = useRef(new Map<string, (handle: GamePageHandle | null) => void>());
  const refFor = useCallback((id: string) => {
    let callback = refCallbacks.current.get(id);
    if (!callback) {
      callback = handle => {
        if (handle) pagesRef.current.set(id, handle);
        else {
          pagesRef.current.delete(id);
          refCallbacks.current.delete(id);
        }
      };
      refCallbacks.current.set(id, callback);
    }
    return callback;
  }, []);
  const activePage = useCallback(() => (currentIdRef.current ? pagesRef.current.get(currentIdRef.current) : undefined), []);

  const phasesRef = useRef(new Map<string, PagePhase>());
  /** A finger is on the feed or the pages are moving (GamePager.onBusyChange). */
  const pagerBusyRef = useRef(false);
  /**
   * True while the game on screen owns the renderer: from the moment a page is
   * selected (or a finger touches the feed) until the game reports an explicit
   * end. Mirrored into state because two decisions have to be *re-rendered*
   * when it changes, not just read: whether a standby WebView may exist, and
   * whether the ad SDK may start loading a creative. Both of those boot a
   * second document inside the one renderer process Android gives the app, so
   * neither may happen while a game is running.
   */
  const [playing, setPlayingState] = useState(true);
  const playingRef = useRef(true);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  const setPlaying = useCallback((next: boolean) => {
    playingRef.current = next;
    setPlayingState(prev => (prev === next ? prev : next));
  }, []);

  /**
   * A finger is down or the pages are moving. Two things still read this: the
   * standby-release gate (which must never fire mid-gesture) and the play
   * state, since touching the feed means the player is engaged. Nothing
   * schedules a fetch off it any more — there is no JS-side speculative fetch
   * left to schedule.
   */
  const onPagerBusy = useCallback((busy: boolean) => {
    pagerBusyRef.current = busy;
    if (busy) setPlaying(true);
  }, [setPlaying]);

  const onPhase = useCallback((gameId: string, phase: PagePhase) => {
    phasesRef.current.set(gameId, phase);
    if (phase === 'ready' && gameId === currentIdRef.current) markFirstGameReady();
  }, []);

  /* ---------------- dock auto-hide (5 s) -------------------------------------- */
  const [dockVisible, setDockVisible] = useState(true);
  const dockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDockHide = useCallback(() => {
    if (dockTimer.current) clearTimeout(dockTimer.current);
    dockTimer.current = setTimeout(() => setDockVisible(false), FEED.dockAutoHideMs);
  }, []);
  const showDock = useCallback(() => {
    setDockVisible(true);
    scheduleDockHide();
  }, [scheduleDockHide]);
  const resetDockTimer = useCallback(() => {
    if (dockTimer.current) scheduleDockHide();
  }, [scheduleDockHide]);
  const toggleDock = useCallback(() => {
    setDockVisible(visible => {
      if (visible) {
        if (dockTimer.current) clearTimeout(dockTimer.current);
        dockTimer.current = null;
        return false;
      }
      scheduleDockHide();
      return true;
    });
  }, [scheduleDockHide]);

  useEffect(
    () => () => {
      if (dockTimer.current) clearTimeout(dockTimer.current);
    },
    [],
  );

  /* ---------------- first-run coach marks ------------------------------------ */
  // Two one-time overlays (see components/tutorial): the feed gesture over the
  // first ready game, and the joystick hint over games that declare a joystick
  // touch zone. Both are transparent to touches, so the pager and the game
  // behave exactly as if they were not there; the first real touch dismisses
  // them, and each is persisted as seen so it never shows twice.
  const tutorialsHydrated = useTutorialStore(state => state.hydrated);
  const swipeTutSeen = useTutorialStore(state => state.swipeSeen);
  const joyTutSeen = useTutorialStore(state => state.joystickSeen);
  const firstGameReady = useStartupStore(state => state.gameReady);
  const [swipeTut, setSwipeTut] = useState(false);
  const [joyTut, setJoyTut] = useState(false);
  const swipeTutRef = useRef(false);
  swipeTutRef.current = swipeTut;
  const joyTutRef = useRef(false);
  joyTutRef.current = joyTut;

  const dismissSwipeTut = useCallback((reason: string) => {
    if (!swipeTutRef.current) return;
    setSwipeTut(false);
    useTutorialStore.getState().markSwipeSeen();
    analytics.onGameAction('global', 'Feed', 'tutorial_swipe_done', reason);
  }, []);

  const dismissJoyTut = useCallback((reason: string) => {
    if (!joyTutRef.current) return;
    setJoyTut(false);
    useTutorialStore.getState().markJoystickSeen();
    analytics.onGameAction(currentIdRef.current ?? 'global', undefined, 'tutorial_joystick_done', reason);
  }, []);

  // The overlays never intercept the feed, so dismissal listens at the stage:
  // the first touch — a tap into the game or the very swipe being taught —
  // retires whichever coach mark is up.
  const onStageTouch = useCallback(() => {
    if (swipeTutRef.current) dismissSwipeTut('gesture');
    if (joyTutRef.current) dismissJoyTut('gesture');
  }, [dismissSwipeTut, dismissJoyTut]);

  // Swipe coach: once, over the first game that is actually ready and visible,
  // and only when there is something to swipe to.
  useEffect(() => {
    if (swipeTutSeen || !tutorialsHydrated || !firstGameReady || suspended) return;
    if (list.length < 2 || swipeTutRef.current) return;
    const timer = setTimeout(() => {
      setSwipeTut(true);
      analytics.onGameAction('global', 'Feed', 'tutorial_swipe_shown');
    }, 650);
    return () => clearTimeout(timer);
  }, [swipeTutSeen, tutorialsHydrated, firstGameReady, suspended, list.length]);

  // Joystick coach: the first time a game that declares a joystick zone is on
  // screen and ready. Waits its turn behind the swipe coach, and polls the
  // page phase briefly because phases live in a ref, not in state.
  const joyZone = useMemo(() => (current ? findJoystickZone(current) : null), [current]);
  useEffect(() => {
    if (!joyZone || joyTutSeen || !tutorialsHydrated || suspended || joyTutRef.current) return;
    if (!swipeTutSeen && list.length > 1) return; // swipe coach goes first
    const gameId = currentId;
    const tryShow = () => {
      if (phasesRef.current.get(gameId ?? '') !== 'ready') return false;
      setJoyTut(true);
      analytics.onGameAction(gameId ?? 'global', current?.title, 'tutorial_joystick_shown');
      return true;
    };
    if (tryShow()) return;
    const poll = setInterval(() => {
      if (tryShow()) clearInterval(poll);
    }, 300);
    const stop = setTimeout(() => clearInterval(poll), 12000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joyZone, joyTutSeen, tutorialsHydrated, suspended, swipeTutSeen, list.length, currentId]);

  // The joystick hint sits over a live game, so it also retires on its own.
  useEffect(() => {
    if (!joyTut) return;
    const timer = setTimeout(() => dismissJoyTut('timeout'), 9000);
    return () => clearTimeout(timer);
  }, [joyTut, dismissJoyTut]);

  /* ---------------- page selected (MainActivity.onPageSelected) -------------- */
  useEffect(() => {
    if (!currentId) return;
    const game = listRef.current[positionRef.current.index];
    if (!game) return;
    currentIdRef.current = game.id;
    setPlaying(true);
    setSwipeEnabled(true);
    showDock();
    usePlayerStore.getState().setLastPlayed(game.id);
    // Least-recently-played is what the on-device store evicts by, so it has to
    // hear about every selection, not just the ones that persist a profile.
    markBundlePlayed(game.id);
    // Reach, counted once per game per session: a page is selected, left and
    // come back to many times in a sitting, and an impression that counted
    // every one of those would measure restlessness, not reach.
    analytics.onGameScreenView(game.id, game.title, game.entryUrl);
    analytics.onGameImpression(game.id, game.title, game.category, positionRef.current.index);
    analytics.onGameSelect(game.id, game.title, game.category);
    void analytics.onGameStart(game.id, game.title, game.category);
    adManager.setCurrentGame(game);
  }, [currentId, showDock, setPlaying]);

  // Per-game ad rules may change on a catalogue refresh.
  useEffect(() => {
    if (current) adManager.setCurrentGame(current);
  }, [current]);

  /**
   * Download outcomes reach analytics from here rather than from the store,
   * because this is the layer that knows the catalogue — and a download event
   * without the game's name in it is not much use in a report. Progress ticks
   * are deliberately not forwarded: four events a second per download would be
   * the loudest thing in the property and would say nothing the finished
   * download's byte count and duration do not.
   */
  useEffect(() => {
    setBundleObserver({
      onReady: bundle => {
        const game = listRef.current.find(item => item.id === bundle.gameId);
        analytics.onGameDownload(bundle.gameId, {
          fallbackTitle: game?.title,
          outcome: 'complete',
          bytes: bundle.bytes,
          durationMs: bundle.elapsedMs,
        });
      },
      onFailed: event => {
        const game = listRef.current.find(item => item.id === event.gameId);
        analytics.onGameDownload(event.gameId, {
          fallbackTitle: game?.title,
          outcome: 'failed',
          error: event.reason,
          retryInMs: event.retryInMs,
        });
      },
    });
    return () => setBundleObserver({});
  }, []);

  /* ---------------- lifecycle: focus, background, ads, sound ------------------ */
  // Run state is driven declaratively through the `suspended` prop (see
  // GamePage): Settings on top, app in background, or a full-screen ad all
  // freeze the page on screen, and clearing them wakes exactly that page —
  // even when its load only finished while the host was away.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      analytics.onScreenView('Feed');
      void useCatalogStore.getState().refresh();
      return () => setFocused(false);
    }, []),
  );

  useAppStateChange(active => {
    setAppActive(active);
    const game = listRef.current[positionRef.current.index];
    if (active) {
      analytics.resumeAfterBackground();
      if (game) analytics.onGameStart(game.id, game.title, game.category);
      void useCatalogStore.getState().refresh();
    } else if (game && !useAdsStore.getState().fullScreenAdShowing) {
      analytics.pauseForBackground();
      analytics.onGameExit(game.id, game.title, 'app_paused');
    }
  });

  useEffect(() => {
    activePage()?.inject(buildSoundScript(!soundMuted));
  }, [soundMuted, activePage]);

  // An interstitial load spins up its own WebView in the renderer the game is
  // drawing from, so the ad SDK is told when that renderer is busy. Suspended
  // counts as free: the game is frozen, so nothing is competing for frames.
  // The bundle downloader gets the same signal, but only throttles on it — it
  // keeps making progress during play, slowly, so a player who never reaches a
  // game over still fills their library.
  useEffect(() => {
    const active = playing && !suspended;
    adManager.setPlaying(active);
    setBundlePlaying(active);
  }, [playing, suspended]);

  /**
   * The download wish-list, in priority order, rebuilt on every settled swipe.
   *
   * The page on screen comes first — storing it is what makes its *next* open
   * instant — then the game one swipe away, then the short lookahead, then the
   * rest of the catalogue. Each entry carries its tier, and the native queue
   * runs strictly in that order *and* re-scores the download already in flight
   * against it: a distant bundle that started three swipes ago is paused (its
   * partial file kept) rather than allowed to hold up the game about to open.
   *
   * The native side drops anything already stored at the advertised build, so a
   * relaunch against an unchanged catalogue issues no requests at all.
   */
  useEffect(() => {
    // Only while the pager is at rest: re-scoring the queue is cheap, but it
    // has no business running during a snap animation.
    if (!list.length || position.settling) return;
    const count = list.length;
    const at = position.index;
    const heading = position.direction;
    const ordered: GameItem[] = [];
    const seen = new Set<string>();
    const push = (game?: GameItem) => {
      if (!game || seen.has(game.id)) return;
      seen.add(game.id);
      ordered.push(game);
    };
    // The same planner the feed uses to choose which pages own a WebView, so
    // downloads and WebViews agree on what "next" means.
    const lookahead = prefetchOrder(at, heading, count, FEED.prefetchAhead, count > 1);
    push(list[at]);
    for (const i of lookahead) push(list[i]);
    // Then the rest of the ring, alternating directions, then anything left.
    for (let step = 1; step <= count; step++) {
      push(list[(((at + heading * step) % count) + count) % count]);
      push(list[(((at - heading * step) % count) + count) % count]);
    }
    for (const game of list) push(game);

    // Tiers as a lookup rather than a scan, so tagging the wish-list stays
    // linear however long the catalogue gets.
    const tiers = new Map<string, BundlePriorityValue>();
    const currentGame = list[at];
    if (currentGame) tiers.set(currentGame.id, BundlePriority.current);
    lookahead.forEach((index, step) => {
      const game = list[index];
      if (!game || tiers.has(game.id)) return;
      tiers.set(game.id, step === 0 ? BundlePriority.next : BundlePriority.near);
    });

    syncBundles(ordered, game => tiers.get(game.id) ?? BundlePriority.rest);

    // The next game's bytes may already be on disk from an earlier session, in
    // which case nothing above will touch it. Pulling them through the page
    // cache now is the one preparation left that costs the running game
    // nothing: no WebView, no renderer work, just a background read of files
    // the next WebView is about to ask for.
    const nextIndex = lookahead[0];
    const nextGame = nextIndex === undefined ? undefined : list[nextIndex];
    if (nextGame) warmBundle(nextGame.id);
  }, [list, position.index, position.direction, position.settling]);

  // Ceilings apply to speculation only, and the game one swipe away barely
  // counts as speculation: it gets several times the distant catalogue's
  // allowance on both link types. The page on screen is exempt from all of
  // them natively.
  useEffect(() => {
    setBundlePolicy({ metered });
  }, [metered]);

  // Downloads stop entirely only when there is no network to use. Being
  // backgrounded is not a reason to stop: it is the best time to finish a
  // bundle, and `setBundlePlaying` above already lifts the speculative ceiling.
  useEffect(() => {
    setBundlePaused(offline);
    return () => setBundlePaused(true);
  }, [offline]);

  /* ---------------- bridge messages from the active game --------------------- */
  const grantHint = useCallback(
    async (rewardType: string) => {
      const game = listRef.current[positionRef.current.index];
      if (!game) return;
      const { granted, viaAd } = await adManager.showRewarded();
      if (!granted) {
        toast('No reward this time — finish the video to unlock the hint.');
        return;
      }
      usePlayerStore.getState().addCoins(GAMEPLAY.rewardedHintCoins);
      activePage()?.inject(buildRewardScript(rewardType));
      toast(
        viaAd
          ? `🎉 Hint Unlocked & +${GAMEPLAY.rewardedHintCoins} 🪙 Coins Granted!`
          : `💡 Hint Unlocked! +${GAMEPLAY.rewardedHintCoins} 🪙 Coins Granted!`,
      );
    },
    [activePage],
  );

  const onMessage = useCallback(
    (gameId: string, message: GameToHostMessage) => {
      if (gameId !== currentIdRef.current) return; // a background page must never affect the live game
      const game = listRef.current[positionRef.current.index];
      if (!game || game.id !== gameId) return;
      const store = usePlayerStore.getState();
      switch (message.type) {
        case 'gameStarted':
          setPlaying(true);
          resetDockTimer();
          break;
        case 'gameOver': {
          setPlaying(false);
          analytics.onGameOver(game.id, game.title, message.score, message.stats);
          store.saveHighScore(game.id, message.score);
          const earned = message.score > 0 ? Math.max(Math.floor(message.score / 10), 5) : 2;
          store.addCoins(earned);
          toast(`+${earned} 🪙 Coins Earned for ${message.score} PTS!`);
          showDock();
          adManager.onGameOver();
          break;
        }
        case 'completed': {
          setPlaying(false);
          analytics.onGameCompleted(game.id, game.title, message.score, message.level);
          store.saveHighScore(game.id, message.score);
          store.saveLevel(game.id, message.level + 1);
          const earned = 50 + (message.score > 0 ? Math.floor(message.score / 10) : 0);
          store.addCoins(earned);
          toast(`🎉 Level Clear! +${earned} 🪙 Coins Earned!`);
          showDock();
          adManager.onLevelCompleted();
          break;
        }
        case 'earnCoins':
          store.addCoins(message.amount);
          analytics.onGameAction(game.id, game.title, 'earn_coins', message.amount);
          toast(`+${message.amount} 🪙 Coins Earned!`);
          break;
        case 'requestHint':
          analytics.onGameAction(game.id, game.title, 'request_hint', message.action);
          void grantHint(message.action);
          break;
        case 'showRewardedAd':
          analytics.onGameAction(game.id, game.title, 'rewarded_ad_request', message.rewardType);
          void grantHint(message.rewardType);
          break;
        case 'saveLevelState':
          store.saveLevel(game.id, message.level);
          analytics.onLevelStart(game.id, game.title, message.level);
          break;
        case 'setSwipeEnabled':
          setSwipeEnabled(message.enabled);
          break;
        case 'haptic':
          if (usePlayerStore.getState().vibrationEnabled) Vibration.vibrate(HAPTIC_PATTERNS[message.haptic]);
          break;
        default:
          break;
      }
    },
    [grantHint, resetDockTimer, showDock, setPlaying],
  );

  /* ---------------- pager callbacks ------------------------------------------ */
  const onSwipeStart = useCallback(() => {
    setPlaying(true);
    setPosition(prev => ({ ...prev, settling: true }));
  }, [setPlaying]);

  const onSwipeCommit = useCallback((targetIndex: number, commitDirection: SwipeDirection) => {
    setCommittedIndex(targetIndex);
    setPosition(prev => ({ ...prev, direction: commitDirection }));
  }, []);

  const onIndexChange = useCallback((index: number, direction: SwipeDirection) => {
    // A performed swipe is the lesson itself: whoever changed the page on
    // their own never needs the swipe coach mark, shown yet or not.
    useTutorialStore.getState().markSwipeSeen();
    setPosition({ index, direction, settling: true });
  }, []);

  const onSettled = useCallback((index: number) => {
    setCommittedIndex(null);
    setPosition(prev => (prev.index === index && !prev.settling ? prev : { ...prev, index, settling: false }));
  }, []);

  const touchZonesFor = useCallback((index: number) => listRef.current[index]?.touchZones, []);

  // WebViews are created and destroyed only while the pager is at rest or in standby.
  // Derived rather than kept in state, which cost two extra feed renders per swipe.
  const { index, direction, settling } = position;
  const rested = !settling;

  // Identify the immediate ahead game for warm standby pre-rendering
  const aheadIdx = loop && list.length > 2
    ? ((index + direction) % list.length + list.length) % list.length
    : (index + direction >= 0 && index + direction < list.length ? index + direction : null);
  const aheadGameId = aheadIdx !== null ? list[aheadIdx]?.id : null;
  const activeReady = phasesRef.current.get(currentIdRef.current ?? '') === 'ready';
  /**
   * A standby page is a second document inside the one renderer process the
   * app gets, so booting one costs the running game frames. It is allowed only
   * in the idle window between an explicit game end and the next run — never
   * while `playing`, and never mid-swipe.
   */
  const allowStandby = rested && !suspended && !playing && activeReady && aheadGameId !== null;
  /**
   * The mirror of `allowStandby`: once play resumes, a speculative page that
   * was never actually visited gives its WebView back. Deliberately biased
   * towards *not* releasing — it requires the pager to be at rest with no
   * finger down, because a touch is just as likely to become a swipe onto that
   * very page as it is to be a tap inside the running game. Skipping a release
   * only leaves a frozen page alive (exactly what a visited `behind` page does
   * today); releasing one too eagerly would blank the page sliding in.
   */
  const releaseStandby = rested && !suspended && playing && !pagerBusyRef.current;

  const renderPage = useCallback(
    (i: number) => {
      const count = list.length;
      if (count === 0) return null;
      const actualIdx = ((i % count) + count) % count;
      const game = list[actualIdx];
      if (!game) return null;
      let slot: PageSlot = slotFor(actualIdx, index, direction, loop ? count : undefined);
      if (slot === 'far') {
        // Leaving → cleanup: pages the pager is sliding away from stay
        // mounted and frozen until it rests, then unmount (WebView freed).
        if (!settling) return null;
        slot = 'leaving';
      }
      const isCommittedTarget = committedIndex !== null && actualIdx === committedIndex;
      if (isCommittedTarget) {
        slot = 'active';
      } else if (committedIndex !== null && actualIdx === index) {
        slot = 'leaving';
      }
      const isStandby = allowStandby && slot === 'ahead' && game.id === aheadGameId;
      const mayLoad = !suspended && (slot === 'active' || isStandby);
      return (
        <GamePage
          key={game.id}
          ref={refFor(game.id)}
          game={game}
          slot={slot}
          mayLoad={mayLoad}
          near={true}
          warmStandby={isStandby}
          releaseStandby={releaseStandby}
          suspended={suspended}
          onPhase={onPhase}
          onMessage={onMessage}
        />
      );
    },
    [list, index, direction, loop, settling, rested, suspended, allowStandby, releaseStandby, aheadGameId, committedIndex, refFor, onPhase, onMessage],
  );

  /* ---------------- dock actions --------------------------------------------- */
  const onAllGames = useCallback(() => {
    resetDockTimer();
    setTab('all');
  }, [resetDockTimer]);
  const onFavorites = useCallback(() => {
    resetDockTimer();
    analytics.onGameAction('global', 'Feed', 'view_favorites');
    if (usePlayerStore.getState().favorites.length === 0) {
      toast(t('favoriteHintToast'), 3200);
    }
    setTab('favorites');
  }, [resetDockTimer, t]);
  const onLike = useCallback(() => {
    resetDockTimer();
    const game = listRef.current[positionRef.current.index];
    if (!game) return;
    const isFav = usePlayerStore.getState().toggleFavorite(game.id);
    analytics.onGameAction(game.id, game.title, isFav ? 'favorite_add' : 'favorite_remove');
    toast(isFav ? `❤️ Added "${game.title}" to Favorites!` : t('removedFromFavorites'));
  }, [resetDockTimer, t]);
  const onSettings = useCallback(() => {
    resetDockTimer();
    adManager.onNavigationEvent();
    analytics.onScreenView('Settings');
    navigation.navigate('Settings');
  }, [navigation, resetDockTimer]);

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  /* ---------------- render --------------------------------------------------- */
  const isFavorite = current ? favorites.includes(current.id) : false;

  let body: React.ReactNode = null;
  if (list.length > 0 && stage.height > 0) {
    body = (
      <GamePager
        count={list.length}
        index={index}
        pageHeight={stage.height}
        width={stage.width}
        swipeEnabled={swipeEnabled && !fullScreenAdShowing}
        loop={loop}
        touchZonesFor={touchZonesFor}
        onSwipeStart={onSwipeStart}
        onIndexChange={onIndexChange}
        onSettled={onSettled}
        onSwipeCommit={onSwipeCommit}
        onBusyChange={onPagerBusy}
        renderPage={renderPage}
      />
    );
  } else if (games.length === 0 && (status === 'booting' || status === 'loading')) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size={48} color="#6366F1" />
      </View>
    );
  } else if (games.length === 0) {
    body = (
      <MessageView
        theme={theme}
        emoji={offline ? '📴' : '🛰️'}
        title={offline ? t('offlineTitle') : t('serverErrorTitle')}
        body={offline ? t('offlineBody') : error ?? undefined}
        actionLabel={t('tryAgain')}
        onAction={() => {
          void useCatalogStore.getState().refresh({ force: true });
        }}
        busy={refreshing}
      />
    );
  } else if (list.length === 0) {
    body = (
      <MessageView
        theme={theme}
        emoji="❤️"
        title={t('noFavoritesTitle')}
        body={t('noFavoritesBody')}
        actionLabel={t('browseAllGames')}
        onAction={onAllGames}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
        <FeedHeader
          theme={theme}
          insetTop={0}
          bannerEnabled={bannerEnabled}
          title={current?.title ?? 'Swipe Play'}
        />
        <View style={styles.stage} onLayout={onStageLayout} onTouchStart={onStageTouch}>
          {body}
          <FeedDock
            theme={theme}
            visible={dockVisible}
            tab={tab}
            isFavorite={isFavorite}
            // The stage already ends above the navigation bar, like the native dock.
            insetBottom={0}
            onAllGames={onAllGames}
            onLike={onLike}
            onFavorites={onFavorites}
            onSettings={onSettings}
            onToggle={toggleDock}
          />
          {joyZone && stage.width > 0 ? (
            <JoystickTutorial
              visible={joyTut}
              zone={joyZone}
              stageWidth={stage.width}
              stageHeight={stage.height}
              onGotIt={() => dismissJoyTut('button')}
            />
          ) : null}
          <SwipeTutorial visible={swipeTut} onGotIt={() => dismissSwipeTut('button')} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Clips the hidden dock at the stage edge the way the native window edge
  // does, instead of letting it show through a translucent navigation bar.
  stage: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
