import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Vibration, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedDock, type FeedTab } from '../components/feed/FeedDock';
import { FeedHeader } from '../components/feed/FeedHeader';
import { GamePage, type GamePageHandle, type PagePhase } from '../components/feed/GamePage';
import { GamePager } from '../components/feed/GamePager';
import { MessageView } from '../components/StateViews';
import { FEED, GAMEPLAY } from '../config/env';
import {
  clampIndex,
  isNear,
  prefetchOrder,
  retainWindow,
  slotFor,
  type SwipeDirection,
} from '../feed/preloadPlanner';
import { useAppStateChange } from '../hooks/useAppState';
import { useIsOffline } from '../hooks/useNetworkStatus';
import type { RootScreenProps } from '../navigation/types';
import { adManager, useAdsStore } from '../services/adManager';
import { analytics } from '../services/analytics';
import { buildRewardScript, buildSoundScript } from '../services/gameBridge';
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
        `${game.id}|${game.version}|${game.updatedAt ?? ''}|${game.title}|${game.category}|${JSON.stringify(game.ads ?? null)}|${JSON.stringify(game.touchZones ?? [])}`,
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
 *   ahead page    → WebView created once the active game is ready (or after a
 *                   fallback), loads, renders its first frames, then is frozen
 *   behind page   → keeps its frozen WebView so going back is instant
 *   next 3 games  → entry HTML fetched into memory after the ahead page is
 *                   ready, so their WebViews later render without a network
 *                   round-trip
 *   everything else → nothing lives; WebViews two or more pages away are destroyed
 */
export function FeedScreen({ navigation }: RootScreenProps<'Feed'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();

  const games = useCatalogStore(state => state.games);
  const status = useCatalogStore(state => state.status);
  const error = useCatalogStore(state => state.error);
  const refreshing = useCatalogStore(state => state.refreshing);
  const favorites = usePlayerStore(state => state.favorites);
  const playerId = usePlayerStore(state => state.playerId);
  const coins = usePlayerStore(state => state.coins);
  const highScores = usePlayerStore(state => state.highScores);
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
  const [position, setPosition] = useState<FeedPosition>({ index: 0, direction: 1, settling: false });
  const positionRef = useRef(position);
  positionRef.current = position;
  const listRef = useRef(list);
  listRef.current = list;
  const currentIdRef = useRef<string | null>(usePlayerStore.getState().lastPlayedGameId);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  // When the list changes (tab switch, catalogue update) stay on the same game
  // if it is still there, otherwise clamp (MainActivity.filterGamesByTab).
  useEffect(() => {
    if (list.length === 0) return;
    const wantedId = currentIdRef.current;
    let index = wantedId ? list.findIndex(game => game.id === wantedId) : -1;
    if (index < 0) index = clampIndex(positionRef.current.index, list.length);
    currentIdRef.current = list[index].id;
    if (index !== positionRef.current.index || positionRef.current.settling) {
      setPosition(prev => ({ index, direction: prev.direction, settling: false }));
    }
  }, [list]);

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
  const [warmGate, setWarmGate] = useState(false);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedFor = useRef<string | null>(null);

  const clearGateTimers = useCallback(() => {
    if (warmTimer.current) clearTimeout(warmTimer.current);
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    warmTimer.current = null;
    prefetchTimer.current = null;
  }, []);

  const aheadGame = useCallback((): GameItem | undefined => {
    const { index, direction } = positionRef.current;
    return listRef.current[index + direction];
  }, []);

  const runPrefetch = useCallback(() => {
    const key = currentIdRef.current;
    if (!key || prefetchedFor.current === key) return;
    prefetchedFor.current = key;
    const { index, direction } = positionRef.current;
    const pages = listRef.current;
    const wanted = prefetchOrder(index, direction, pages.length, FEED.prefetchAhead).map(i => pages[i]);
    gamePrefetcher.request(wanted);
  }, []);

  const schedulePrefetch = useCallback(() => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    const ahead = aheadGame();
    const aheadPhase = ahead ? phasesRef.current.get(ahead.id) : undefined;
    if (!ahead || aheadPhase === 'ready' || aheadPhase === 'error') {
      runPrefetch();
      return;
    }
    prefetchTimer.current = setTimeout(runPrefetch, FEED.prefetchFallbackMs);
  }, [aheadGame, runPrefetch]);

  const openWarmGate = useCallback(() => {
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = null;
    setWarmGate(true);
    schedulePrefetch();
  }, [schedulePrefetch]);

  const onPhase = useCallback(
    (gameId: string, phase: PagePhase) => {
      phasesRef.current.set(gameId, phase);
      if (gameId === currentIdRef.current) {
        if (phase === 'ready') {
          if (warmTimer.current) clearTimeout(warmTimer.current);
          warmTimer.current = setTimeout(openWarmGate, FEED.warmDelayMs);
        } else if (phase === 'error') {
          openWarmGate();
        }
      } else if (gameId === aheadGame()?.id && (phase === 'ready' || phase === 'error')) {
        if (prefetchTimer.current) runPrefetch();
      }
    },
    [openWarmGate, aheadGame, runPrefetch],
  );

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
    clearGateTimers();
    setWarmGate(false);
    setSwipeEnabled(true);
    showDock();
    usePlayerStore.getState().setLastPlayed(game.id);
    analytics.onGameStart(game.id, game.title);
    adManager.setCurrentGame(game);
    // A page that is already running (swiped back to) frees the gate quickly;
    // otherwise warm the next page even if this one is slow (native binds it
    // regardless).
    const alreadyReady = phasesRef.current.get(game.id) === 'ready';
    warmTimer.current = setTimeout(openWarmGate, alreadyReady ? FEED.warmDelayMs : FEED.warmFallbackMs);
    const { index, direction } = positionRef.current;
    const pages = listRef.current;
    gamePrefetcher.retain(retainWindow(index, direction, pages.length, FEED.prefetchAhead).map(i => pages[i]));
  }, [currentId, clearGateTimers, showDock, openWarmGate]);

  // Per-game ad rules may change on a catalogue refresh.
  useEffect(() => {
    if (current) adManager.setCurrentGame(current);
  }, [current]);

  /* ---------------- lifecycle: focus, background, ads, sound ------------------ */
  useFocusEffect(
    useCallback(() => {
      activePage()?.resume();
      void useCatalogStore.getState().refresh();
      return () => {
        activePage()?.pause();
      };
    }, [activePage]),
  );

  useAppStateChange(active => {
    const game = listRef.current[positionRef.current.index];
    if (active) {
      if (!useAdsStore.getState().fullScreenAdShowing) activePage()?.resume();
      if (game) analytics.onGameStart(game.id, game.title);
      void useCatalogStore.getState().refresh();
    } else {
      for (const page of pagesRef.current.values()) page.pause();
      if (game && !useAdsStore.getState().fullScreenAdShowing) {
        analytics.onGameExit(game.id, game.title, 'app_paused');
      }
    }
  });

  useEffect(() => {
    if (fullScreenAdShowing) activePage()?.pause();
    else activePage()?.resume();
  }, [fullScreenAdShowing, activePage]);

  useEffect(() => {
    activePage()?.inject(buildSoundScript(!soundMuted));
  }, [soundMuted, activePage]);

  useEffect(() => {
    gamePrefetcher.setOnline(!offline);
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
          resetDockTimer();
          break;
        case 'gameOver': {
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
          toast(`+${message.amount} 🪙 Coins Earned!`);
          break;
        case 'requestHint':
          void grantHint(message.action);
          break;
        case 'showRewardedAd':
          void grantHint(message.rewardType);
          break;
        case 'saveLevelState':
          store.saveLevel(game.id, message.level);
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
    [grantHint, resetDockTimer, showDock],
  );

  /* ---------------- pager callbacks ------------------------------------------ */
  const onIndexChange = useCallback((index: number, direction: SwipeDirection) => {
    setPosition({ index, direction, settling: true });
  }, []);
  const onSettled = useCallback((index: number) => {
    setPosition(prev => (prev.index === index && !prev.settling ? prev : { ...prev, index, settling: false }));
  }, []);
  const touchZonesFor = useCallback((index: number) => listRef.current[index]?.touchZones, []);

  const { index, direction, settling } = position;
  const renderPage = useCallback(
    (i: number) => {
      const game = list[i];
      if (!game) return null;
      const slot = slotFor(i, index, direction);
      const near = isNear(i, index, 2);
      if (slot === 'far' && !near) return null;
      const mayLoad = slot === 'active' ? !settling : slot === 'ahead' ? warmGate && !settling : false;
      return (
        <GamePage
          key={game.id}
          ref={refFor(game.id)}
          game={game}
          slot={slot}
          mayLoad={mayLoad}
          near={near}
          onPhase={onPhase}
          onMessage={onMessage}
        />
      );
    },
    [list, index, direction, settling, warmGate, refFor, onPhase, onMessage],
  );

  /* ---------------- dock actions --------------------------------------------- */
  const onAllGames = useCallback(() => {
    resetDockTimer();
    setTab('all');
  }, [resetDockTimer]);
  const onFavorites = useCallback(() => {
    resetDockTimer();
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
    toast(isFav ? `❤️ Added "${game.title}" to Favorites!` : 'Removed from Favorites');
  }, [resetDockTimer]);
  const onSettings = useCallback(() => {
    resetDockTimer();
    adManager.onNavigationEvent();
    navigation.navigate('Settings');
  }, [navigation, resetDockTimer]);

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  /* ---------------- render --------------------------------------------------- */
  const isFavorite = current ? favorites.includes(current.id) : false;
  const highScore = current ? (highScores[current.id] ?? 0) : 0;
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
        touchZonesFor={touchZonesFor}
        onIndexChange={onIndexChange}
        onSettled={onSettled}
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
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <FeedHeader
        theme={theme}
        insetTop={insets.top}
        bannerEnabled={bannerEnabled}
        playerId={playerId}
        coins={coins}
        title={current?.title ?? 'Swipe Play'}
        meta={meta}
        highScore={highScore}
      />
      <View style={styles.stage} onLayout={onStageLayout}>
        {body}
        <FeedDock
          theme={theme}
          visible={dockVisible}
          tab={tab}
          isFavorite={isFavorite}
          insetBottom={insets.bottom}
          onAllGames={onAllGames}
          onLike={onLike}
          onFavorites={onFavorites}
          onSettings={onSettings}
          onToggle={toggleDock}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
