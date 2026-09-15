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
  retainWindow,
  slotFor,
  type PageSlot,
  type SwipeDirection,
} from '../feed/preloadPlanner';
import { useAppStateChange } from '../hooks/useAppState';
import { useIsOffline } from '../hooks/useNetworkStatus';
import type { RootScreenProps } from '../navigation/types';
import { adManager, useAdsStore } from '../services/adManager';
import { analytics } from '../services/analytics';
import { buildRewardScript, buildSoundScript } from '../services/gameBridge';
import { markFirstGameReady } from '../services/startup';
import { gamePrefetcher } from '../services/gamePrefetcher';
import { useCatalogStore } from '../store/catalogStore';
import { usePlayerStore } from '../store/playerStore';
import { toast } from '../store/toastStore';
import { useTheme } from '../theme/useTheme';
import type { GameToHostMessage, HapticType } from '../types/bridge';
import type { GameItem } from '../types/game';
import { displayCategory } from '../utils/misc';

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
        `${game.id}|${game.version}|${game.updatedAt ?? ''}|${game.title}|${game.category}|${game.ads?.enabled ? '1' : '0'}|${game.ads?.intervalMinutes ?? ''}|${JSON.stringify(game.touchZones ?? [])}|${game.entryUrl}|${game.sha256 ?? ''}|${game.sizeBytes}`,
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
 *   ahead page    ? placeholder only; never boot another engine during play
 *   behind page   → keeps its frozen WebView so going back is instant
 *   leaving page  → the page a swipe pushes out of the window stays frozen
 *                   until the snap ends; only then is its WebView destroyed
 *   next 3 games  ? cancellable HTML-only prefetch after an explicit game end
 *   everything else → nothing lives; WebViews two or more pages away are destroyed
 */
export function FeedScreen({ navigation }: RootScreenProps<'Feed'>) {
  const theme = useTheme();
  // Resolve insets relative to this screen, not the outer navigation window.
  const offline = useIsOffline();

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
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedFor = useRef<string | null>(null);
  /** A finger is on the feed or the pages are moving (GamePager.onBusyChange). */
  const pagerBusyRef = useRef(false);
  // No input is not proof of idleness: several games auto-start without a bridge event.
  // Only gameOver/completed permits speculative work.
  const playingRef = useRef(true);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  const clearGateTimers = useCallback(() => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  }, []);

  const onPagerBusy = useCallback((busy: boolean) => {
    pagerBusyRef.current = busy;
    if (busy) playingRef.current = true;
    gamePrefetcher.setPaused(busy || playingRef.current || suspendedRef.current || positionRef.current.settling);
  }, []);

  const runPrefetch = useCallback(() => {
    const phase = phasesRef.current.get(currentIdRef.current ?? '');
    if (phase !== 'ready' && phase !== 'error') return;
    if (pagerBusyRef.current || playingRef.current || suspendedRef.current || positionRef.current.settling) return;
    const key = currentIdRef.current;
    if (!key || prefetchedFor.current === key) return;
    prefetchedFor.current = key;
    const { index, direction } = positionRef.current;
    const pages = listRef.current;
    const wanted = prefetchOrder(index, direction, pages.length, FEED.prefetchAhead, pages.length > 1).map(i => pages[i]);
    gamePrefetcher.saveLaunch();
    // Next swipe first, then the last-played launch document and further games.
    // This path is still restricted to an explicit game-end window.
    gamePrefetcher.request(wanted.length ? [wanted[0], pages[index], ...wanted.slice(1)] : [pages[index]]);
  }, []);

  const schedulePrefetch = useCallback(() => {
    if (playingRef.current || suspendedRef.current) return;
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => {
      prefetchTimer.current = null;
      runPrefetch();
    }, FEED.prefetchFallbackMs);
  }, [runPrefetch]);

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
      clearGateTimers();
    },
    [clearGateTimers],
  );

  /* ---------------- page selected (MainActivity.onPageSelected) -------------- */
  useEffect(() => {
    if (!currentId) return;
    const game = listRef.current[positionRef.current.index];
    if (!game) return;
    currentIdRef.current = game.id;
    gamePrefetcher.setLaunchGame(game);
    playingRef.current = true;
    gamePrefetcher.setPaused(true);
    // Replace obsolete wishes while paused, before a future game-end can resume them.
    gamePrefetcher.request([]);
    prefetchedFor.current = null;
    clearGateTimers();
    setSwipeEnabled(true);
    showDock();
    usePlayerStore.getState().setLastPlayed(game.id);
    analytics.onGameSelect(game.id, game.title, game.category);
    analytics.onGameStart(game.id, game.title, game.category);
    adManager.setCurrentGame(game);
    schedulePrefetch();
    const { index, direction } = positionRef.current;
    const pages = listRef.current;
    gamePrefetcher.retain(retainWindow(index, direction, pages.length, FEED.prefetchAhead, pages.length > 1).map(i => pages[i]));
  }, [currentId, clearGateTimers, showDock, schedulePrefetch]);

  // Per-game ad rules may change on a catalogue refresh.
  useEffect(() => {
    if (current) adManager.setCurrentGame(current);
  }, [current]);

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

  useEffect(() => {
    gamePrefetcher.setOnline(!offline);
  }, [offline]);

  useEffect(() => {
    gamePrefetcher.setPaused(suspended || playingRef.current || pagerBusyRef.current || position.settling);
    if (suspended) clearGateTimers();
    else if (!position.settling) schedulePrefetch();
    return () => gamePrefetcher.setPaused(true);
  }, [suspended, position.settling, currentId, clearGateTimers, schedulePrefetch]);

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
          playingRef.current = true;
          clearGateTimers();
          gamePrefetcher.setPaused(true);
          resetDockTimer();
          break;
        case 'gameOver': {
          playingRef.current = false;
          gamePrefetcher.setPaused(pagerBusyRef.current || suspendedRef.current);
          schedulePrefetch();
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
          playingRef.current = false;
          gamePrefetcher.setPaused(pagerBusyRef.current || suspendedRef.current);
          schedulePrefetch();
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
    [grantHint, resetDockTimer, showDock, clearGateTimers, schedulePrefetch],
  );

  /* ---------------- pager callbacks ------------------------------------------ */
  const onSwipeStart = useCallback(() => {
    playingRef.current = true;
    clearGateTimers();
    gamePrefetcher.setPaused(true);
    setPosition(prev => ({ ...prev, settling: true }));
  }, [clearGateTimers]);
  const onIndexChange = useCallback((index: number, direction: SwipeDirection) => {
    clearGateTimers();
    setPosition({ index, direction, settling: true });
  }, [clearGateTimers]);
  const onSettled = useCallback((index: number) => {
    setPosition(prev => (prev.index === index && !prev.settling ? prev : { ...prev, index, settling: false }));
  }, []);
  const touchZonesFor = useCallback((index: number) => listRef.current[index]?.touchZones, []);

  // WebViews are created and destroyed only while the pager is at rest: never
  // during the snap animation (UI-thread inflation/teardown would drop its
  // frames), and never for pages a rapid flick flies past. Derived rather
  // than kept in state, which cost two extra feed renders per swipe.
  const { index, direction, settling } = position;
  const rested = !settling;
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
      // An offscreen WebView cannot be safely preempted once its engine starts.
      // Keep loaded neighbors, but initialize cold games only when selected.
      const mayLoad = !suspended && slot === 'active' && rested;
      return (
        <GamePage
          key={game.id}
          ref={refFor(game.id)}
          game={game}
          slot={slot}
          mayLoad={mayLoad}
          near={true}
          suspended={suspended || settling}
          onPhase={onPhase}
          onMessage={onMessage}
        />
      );
    },
    [list, index, direction, loop, settling, rested, suspended, refFor, onPhase, onMessage],
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
      toast('⭐ Tap the Heart ❤️ on any game to add it to Favorites!', 3200);
    }
    setTab('favorites');
  }, [resetDockTimer]);
  const onLike = useCallback(() => {
    resetDockTimer();
    const game = listRef.current[positionRef.current.index];
    if (!game) return;
    const isFav = usePlayerStore.getState().toggleFavorite(game.id);
    analytics.onGameAction(game.id, game.title, isFav ? 'favorite_add' : 'favorite_remove');
    toast(isFav ? `❤️ Added "${game.title}" to Favorites!` : 'Removed from Favorites');
  }, [resetDockTimer]);
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
  const meta = current ? `${index + 1} of ${list.length} • ${displayCategory(current.category)}` : '';

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
        title={offline ? "You're offline" : "Can't reach the game server"}
        body={offline ? 'Connect to the internet to download the game catalogue.' : error ?? undefined}
        actionLabel="Try again"
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
        title="No favourites yet"
        body="Tap Like on any game to keep it here."
        actionLabel="Browse all games"
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
          gameId={currentId}
          title={current?.title ?? 'Swipe Play'}
          meta={meta}
        />
        <View style={styles.stage} onLayout={onStageLayout}>
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
