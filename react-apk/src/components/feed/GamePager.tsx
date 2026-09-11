import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { FEED } from '../../config/env';
import {
  dragAxis,
  dragOffset,
  pointInZones,
  resolveTarget,
  settleDuration,
  shouldClaimSwipe,
  type DragAxis,
} from '../../feed/pagerGesture';
import type { SwipeDirection } from '../../feed/preloadPlanner';
import type { TouchZone } from '../../types/game';
import { GAME_SURFACE } from '../../theme/themes';

interface Props {
  count: number;
  /** Controlled current page (actual index). Changing it from outside jumps without animation. */
  index: number;
  pageHeight: number;
  width: number;
  swipeEnabled: boolean;
  /** Wrap around like the native LOOP_FACTOR pager. Needs at least three games. */
  loop?: boolean;
  touchZonesFor: (index: number) => readonly TouchZone[] | undefined;
  /** Fired right after a swipe's destination is known (ViewPager2's onPageSelected). */
  onIndexChange: (index: number, direction: SwipeDirection) => void;
  /** Fired when the settle animation finishes and the pager is at rest. */
  onSettled: (index: number) => void;
  /**
   * `true` while a finger is on the pager or the pages are moving, `false`
   * once it is at rest with no finger down. UI-thread-heavy work (creating a
   * WebView) should wait for `false` so it never lands mid-gesture.
   */
  onBusyChange?: (busy: boolean) => void;
  renderPage: (index: number) => React.ReactNode;
}

const SETTLE_EASING = Easing.out(Easing.cubic);

/** The snap in flight, so the track position is known without a per-frame listener. */
interface Motion {
  from: number;
  to: number;
  startedAt: number;
  duration: number;
}

/**
 * Vertical, one-page-per-swipe pager for WebView pages — the React Native
 * counterpart of the vertical ViewPager2 in MainActivity.
 *
 * Pages live on an unbounded *virtual* strip: page `v` sits at `v × height`
 * inside one translated container (native-driver transform). In loop mode
 * virtual index `v` shows game `v mod count`, so wrapping never re-bases the
 * translation — no jump, no blank frame.
 *
 * The pager is a plain responder on the pages' ancestor: taps and small drags
 * reach the game, and only once a drag is clearly vertical (RecyclerView's
 * slop + dominant-axis rule) — and did not start in one of the game's
 * `touchZones` — does the pager claim it, which cancels the touch inside the
 * WebView exactly like a ViewPager2 intercept. The axis is locked per touch:
 * a drag that first leaves the slop sideways stays with the game until the
 * finger lifts, so a slider that wanders vertically never changes the game.
 * Games can switch swiping off through the bridge.
 *
 * Threads: the drag follows the finger through the JS thread (PanResponder →
 * one native `setValue` per move); nothing else in the feed does JS work
 * while a finger is down. The snap runs on the UI thread and is handed over
 * before any React work for the page change, which is published a frame
 * later. No WebView is created or destroyed while pages move: pages leaving
 * the window stay mounted, frozen, until the pager rests.
 */
export function GamePager({
  count,
  index,
  pageHeight,
  width,
  swipeEnabled,
  loop = false,
  touchZonesFor,
  onIndexChange,
  onSettled,
  onBusyChange,
  renderPage,
}: Props) {
  const isLoop = loop && count > 2;
  const toActual = useCallback((virtual: number) => (isLoop ? ((virtual % count) + count) % count : virtual), [isLoop, count]);

  const translateY = useRef(new Animated.Value(-index * pageHeight)).current;
  const valueRef = useRef(-index * pageHeight);
  const virtualRef = useRef(index);
  const [virtual, setVirtual] = useState(index);
  /** The page the pager last came to rest on; its window stays mounted until the next rest. */
  const [restCenter, setRestCenter] = useState(index);
  const touchStartRef = useRef({ x: 0, y: 0 });
  /** Axis the current touch committed to; reset when the first finger goes down and when the last one lifts. */
  const axisRef = useRef<DragAxis>('none');
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const motionRef = useRef<Motion | null>(null);
  const gesture = useRef({ base: 0, dyAtGrant: 0, active: false });
  const fingerDownRef = useRef(false);
  const busyRef = useRef(false);
  const pendingSelect = useRef<{ target: number; direction: SwipeDirection } | null>(null);
  const selectFrame = useRef<number | null>(null);

  const latest = useRef({ count, pageHeight, width, swipeEnabled, isLoop, touchZonesFor, onIndexChange, onSettled, onBusyChange, toActual });
  latest.current = { count, pageHeight, width, swipeEnabled, isLoop, touchZonesFor, onIndexChange, onSettled, onBusyChange, toActual };

  // Put the value on the native driver before the first drag. A value that
  // has never run a native animation is JS-driven, and on Fabric every
  // JS-driven update re-renders the animated pages — the first swipe of a
  // session would pay that on every touch move.
  useEffect(() => {
    Animated.timing(translateY, { toValue: valueRef.current, duration: 0, useNativeDriver: true }).start();
  }, [translateY]);

  const updateBusy = useCallback(() => {
    const busy = fingerDownRef.current || gesture.current.active || animationRef.current !== null;
    if (busy === busyRef.current) return;
    busyRef.current = busy;
    latest.current.onBusyChange?.(busy);
  }, []);

  /**
   * Where the track is now, including a snap in progress. Computed from the
   * snap's own curve instead of an Animated listener, which would stream every
   * animation frame from the UI thread back to JS during each snap.
   */
  const trackPosition = useCallback(() => {
    const motion = motionRef.current;
    if (!motion) return valueRef.current;
    const t = motion.duration > 0 ? Math.min(1, (Date.now() - motion.startedAt) / motion.duration) : 1;
    return motion.from + (motion.to - motion.from) * SETTLE_EASING(t);
  }, []);

  const stopAnimation = useCallback(() => {
    const animation = animationRef.current;
    if (!animation) return;
    valueRef.current = trackPosition();
    animationRef.current = null;
    motionRef.current = null;
    animation.stop();
  }, [trackPosition]);

  /** Publishes a page change decided at release (see onPanResponderRelease). */
  const flushSelection = useCallback(() => {
    if (selectFrame.current !== null) {
      cancelAnimationFrame(selectFrame.current);
      selectFrame.current = null;
    }
    const pending = pendingSelect.current;
    if (!pending) return;
    pendingSelect.current = null;
    setVirtual(pending.target);
    latest.current.onIndexChange(latest.current.toActual(pending.target), pending.direction);
  }, []);

  const jumpTo = useCallback(
    (target: number) => {
      flushSelection();
      stopAnimation();
      virtualRef.current = target;
      setVirtual(target);
      setRestCenter(target);
      const value = -target * latest.current.pageHeight;
      valueRef.current = value;
      translateY.setValue(value);
      updateBusy();
    },
    [flushSelection, stopAnimation, translateY, updateBusy],
  );

  // External changes (tab switch, catalogue reorder, initial page, page
  // height) jump instantly. The parent echoing an index this pager itself
  // reported must not interrupt the settle animation, hence the comparison
  // against the virtual position's actual index; and between a release and
  // the page change being published a frame later, `index` is still stale.
  const lastHeight = useRef(pageHeight);
  useEffect(() => {
    const heightChanged = lastHeight.current !== pageHeight;
    lastHeight.current = pageHeight;
    if (gesture.current.active) return;
    if (heightChanged) jumpTo(pendingSelect.current ? virtualRef.current : index);
    else if (!pendingSelect.current && toActual(virtualRef.current) !== index) jumpTo(index);
  }, [index, pageHeight, jumpTo, toActual]);

  useEffect(
    () => () => {
      if (selectFrame.current !== null) cancelAnimationFrame(selectFrame.current);
      animationRef.current?.stop();
    },
    [],
  );

  const settleTo = useCallback(
    (target: number, velocity: number) => {
      stopAnimation();
      const { pageHeight: h } = latest.current;
      const from = valueRef.current;
      const toValue = -target * h;
      const distance = toValue - from;
      const duration = settleDuration({
        distance,
        // Finger speed along the direction the track still has to travel.
        velocity: distance === 0 ? 0 : velocity * Math.sign(distance),
        pageHeight: h,
        baseMs: FEED.settleDurationMs,
        minMs: FEED.settleMinDurationMs,
      });
      const animation = Animated.timing(translateY, { toValue, duration, easing: SETTLE_EASING, useNativeDriver: true });
      animationRef.current = animation;
      motionRef.current = { from, to: toValue, startedAt: Date.now(), duration };
      animation.start(({ finished }) => {
        if (animationRef.current !== animation) return; // stopped by a new drag or a jump
        animationRef.current = null;
        motionRef.current = null;
        if (finished) {
          valueRef.current = toValue;
          flushSelection();
          setRestCenter(target);
          latest.current.onSettled(latest.current.toActual(target));
        }
        updateBusy();
      });
      updateBusy();
    },
    [flushSelection, stopAnimation, translateY, updateBusy],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: event => {
          // The touch target is the page (WebView wrapper) that fills the
          // viewport, so its local coordinates are page-relative.
          touchStartRef.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
          // A new gesture starts with the first finger (PanResponder resets
          // dx/dy at the same point); a second finger joins the current one.
          if (event.nativeEvent.touches.length <= 1) axisRef.current = 'none';
          return false;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, state) => {
          const { swipeEnabled: enabled, count: total, pageHeight: h, width: w, touchZonesFor: zonesFor } = latest.current;
          if (!enabled || total <= 1 || h <= 0 || w <= 0) return false;
          if (axisRef.current === 'none') axisRef.current = dragAxis(state.dx, state.dy, FEED.swipeSlopPx);
          // Sideways first → the game keeps this touch until the finger lifts.
          if (axisRef.current === 'horizontal') return false;
          const startedInZone = pointInZones(
            touchStartRef.current.x / w,
            touchStartRef.current.y / h,
            zonesFor(latest.current.toActual(virtualRef.current)),
          );
          return shouldClaimSwipe({
            dx: state.dx,
            dy: state.dy,
            slopPx: FEED.swipeSlopPx,
            enabled: true,
            startedInZone,
          });
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (_event, state) => {
          flushSelection();
          stopAnimation();
          gesture.current = { base: valueRef.current, dyAtGrant: state.dy, active: true };
          updateBusy();
        },
        onPanResponderMove: (_event, state) => {
          if (!gesture.current.active) return;
          const { count: total, pageHeight: h, isLoop: wrap } = latest.current;
          const rest = -virtualRef.current * h;
          // Distance from the resting position, including any interrupted settle.
          const dy = gesture.current.base - rest + (state.dy - gesture.current.dyAtGrant);
          const offset = dragOffset({
            dy,
            current: virtualRef.current,
            count: total,
            pageHeight: h,
            resistance: FEED.overscrollResistance,
            maxOverscroll: FEED.overscrollMaxPx,
            loop: wrap,
          });
          const value = rest + offset;
          valueRef.current = value;
          translateY.setValue(value);
        },
        onPanResponderRelease: (_event, state) => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          fingerDownRef.current = false;
          const { count: total, pageHeight: h, isLoop: wrap } = latest.current;
          const current = virtualRef.current;
          const dy = valueRef.current + current * h;
          const target = resolveTarget({
            dy,
            vy: state.vy,
            current,
            count: total,
            pageHeight: h,
            thresholdRatio: FEED.swipeThresholdRatio,
            flingVelocity: FEED.swipeFlingVelocity,
            loop: wrap,
          });
          // The snap goes first: its start reaches the UI thread in a
          // microtask queued here. Setting React state before it would queue
          // the page-change render ahead of it, delaying the snap by a whole
          // render + commit. That render (header, slots, new neighbour's
          // chrome) is published on the next frame instead.
          settleTo(target, state.vy);
          if (target !== current) {
            virtualRef.current = target;
            pendingSelect.current = { target, direction: target > current ? 1 : -1 };
            if (selectFrame.current === null) {
              selectFrame.current = requestAnimationFrame(() => {
                selectFrame.current = null;
                flushSelection();
              });
            }
          }
        },
        onPanResponderTerminate: () => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          settleTo(virtualRef.current, 0);
        },
      }),
    [flushSelection, settleTo, stopAnimation, translateY, updateBusy],
  );

  // ViewPager2 offscreenPageLimit = 1: the current page and its two
  // neighbours — plus, until the pager rests, the pages of the window it is
  // leaving ("leaving" pages keep their frozen WebView; tearing one down is
  // UI-thread work that would drop frames of the snap).
  //
  // Each page carries the shared translation itself and is a direct child of
  // the viewport. Translating one tall container instead would draw the pages
  // fine (React Native does not clip children) but Android only dispatches a
  // touch to a child whose *own* bounds contain the point in the child's
  // coordinate space — a container moved up by n pages puts the point n pages
  // below its bottom edge, so every page after the first would be visible yet
  // untouchable.
  const pages = useMemo(() => {
    if (pageHeight <= 0 || width <= 0 || count <= 0) return null;
    const slots: { v: number; actual: number; interactive: boolean }[] = [];
    const taken = new Set<number>();
    const take = (v: number, interactive: boolean) => {
      if (!isLoop && (v < 0 || v >= count)) return;
      const actual = toActual(v);
      if (taken.has(actual)) return;
      taken.add(actual);
      slots.push({ v, actual, interactive });
    };
    for (let offset = -1; offset <= 1; offset++) take(virtual + offset, offset === 0);
    if (restCenter !== virtual) {
      for (let offset = -1; offset <= 1; offset++) take(restCenter + offset, false);
    }
    // Children stay in game order whatever the scroll position: pages are
    // only ever added or removed, never reordered — a reorder makes Fabric
    // detach and re-attach the native view, WebView included.
    slots.sort((a, b) => a.actual - b.actual);
    const nodes: React.ReactNode[] = [];
    for (const slot of slots) {
      const node = renderPage(slot.actual);
      if (!node) continue;
      nodes.push(
        <Animated.View
          key={slot.actual}
          pointerEvents={slot.interactive ? 'auto' : 'none'}
          style={[styles.page, { top: slot.v * pageHeight, height: pageHeight, width, transform: [{ translateY }] }]}
        >
          {node}
        </Animated.View>,
      );
    }
    return nodes;
  }, [count, pageHeight, width, virtual, restCenter, isLoop, toActual, renderPage, translateY]);

  // Touch events bubble here even while the game (not the pager) handles the
  // touch: they drive the busy signal and clear the axis lock on lift.
  const onTouchStart = useCallback(() => {
    if (fingerDownRef.current) return;
    fingerDownRef.current = true;
    updateBusy();
  }, [updateBusy]);
  const onTouchFinish = useCallback(
    (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length > 0) return;
      axisRef.current = 'none';
      fingerDownRef.current = false;
      updateBusy();
    },
    [updateBusy],
  );

  return (
    <View
      style={styles.root}
      collapsable={false}
      {...responder.panHandlers}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchFinish}
      onTouchCancel={onTouchFinish}
    >
      {pages}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GAME_SURFACE },
  page: { position: 'absolute', left: 0 },
});
