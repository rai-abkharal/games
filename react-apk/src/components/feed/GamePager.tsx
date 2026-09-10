import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import { FEED } from '../../config/env';
import { dragOffset, pointInZones, resolveTarget, shouldClaimSwipe } from '../../feed/pagerGesture';
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
  /** Fired the moment a swipe's destination is known (ViewPager2's onPageSelected). */
  onIndexChange: (index: number, direction: SwipeDirection) => void;
  /** Fired when the settle animation finishes and the pager is at rest. */
  onSettled: (index: number) => void;
  renderPage: (index: number) => React.ReactNode;
}

/**
 * Vertical, one-page-per-swipe pager for WebView pages — the React Native
 * counterpart of the vertical ViewPager2 in MainActivity.
 *
 * Pages live on an unbounded *virtual* strip: page `v` sits at `v × height`
 * inside one translated container (native-driver transform). In loop mode
 * virtual index `v` shows game `v mod count`, so wrapping never re-bases the
 * translation — no jump, no blank frame. A drag costs one value update per
 * touch move and the snap runs entirely on the UI thread.
 *
 * The pager is a plain responder on the pages' ancestor: taps and small drags
 * reach the game, and only once a drag is clearly vertical (RecyclerView's
 * slop + dominant-axis rule) — and did not start in one of the game's
 * `touchZones` — does the pager claim it, which cancels the touch inside the
 * WebView exactly like a ViewPager2 intercept. Games can switch swiping off
 * through the bridge.
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
  renderPage,
}: Props) {
  const isLoop = loop && count > 2;
  const toActual = useCallback((virtual: number) => (isLoop ? ((virtual % count) + count) % count : virtual), [isLoop, count]);

  const translateY = useRef(new Animated.Value(-index * pageHeight)).current;
  const valueRef = useRef(-index * pageHeight);
  const virtualRef = useRef(index);
  const [virtual, setVirtual] = useState(index);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const gesture = useRef({ base: 0, dyAtGrant: 0, active: false });

  const latest = useRef({ count, pageHeight, width, swipeEnabled, isLoop, touchZonesFor, onIndexChange, onSettled, toActual });
  latest.current = { count, pageHeight, width, swipeEnabled, isLoop, touchZonesFor, onIndexChange, onSettled, toActual };

  // Native-driver animations do not update the JS-side value; the listener
  // keeps `valueRef` truthful so an interrupted settle continues from where
  // the track actually is instead of from a stale number.
  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      valueRef.current = value;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
  }, []);

  const jumpTo = useCallback(
    (target: number) => {
      stopAnimation();
      virtualRef.current = target;
      setVirtual(target);
      const value = -target * latest.current.pageHeight;
      valueRef.current = value;
      translateY.setValue(value);
    },
    [stopAnimation, translateY],
  );

  // External changes (tab switch, catalogue reorder, initial page, page
  // height) jump instantly. The parent echoing an index this pager itself
  // reported must not interrupt the settle animation, hence the comparison
  // against the virtual position's actual index.
  const lastHeight = useRef(pageHeight);
  useEffect(() => {
    const heightChanged = lastHeight.current !== pageHeight;
    lastHeight.current = pageHeight;
    if ((toActual(virtualRef.current) !== index || heightChanged) && !gesture.current.active) jumpTo(index);
  }, [index, pageHeight, jumpTo, toActual]);

  const settleTo = useCallback(
    (target: number) => {
      stopAnimation();
      const toValue = -target * latest.current.pageHeight;
      const animation = Animated.timing(translateY, {
        toValue,
        duration: FEED.settleDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (animationRef.current === animation) animationRef.current = null;
        if (finished) {
          valueRef.current = toValue;
          latest.current.onSettled(latest.current.toActual(target));
        }
      });
    },
    [stopAnimation, translateY],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: event => {
          // The touch target is the page (WebView wrapper) that fills the
          // viewport, so its local coordinates are page-relative.
          touchStartRef.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
          return false;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, state) => {
          const { swipeEnabled: enabled, count: total, pageHeight: h, width: w, touchZonesFor: zonesFor } = latest.current;
          if (!enabled || total <= 1 || h <= 0 || w <= 0) return false;
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
          stopAnimation();
          gesture.current = { base: valueRef.current, dyAtGrant: state.dy, active: true };
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
          const { count: total, pageHeight: h, isLoop: wrap, onIndexChange: notify } = latest.current;
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
          if (target !== current) {
            virtualRef.current = target;
            setVirtual(target);
            notify(latest.current.toActual(target), target > current ? 1 : -1);
          }
          settleTo(target);
        },
        onPanResponderTerminate: () => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          settleTo(virtualRef.current);
        },
      }),
    [settleTo, stopAnimation, translateY],
  );

  // ViewPager2 offscreenPageLimit = 1: the current page and its two neighbours.
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
    const nodes: React.ReactNode[] = [];
    for (let offset = -1; offset <= 1; offset++) {
      const v = virtual + offset;
      if (!isLoop && (v < 0 || v >= count)) continue;
      const actual = toActual(v);
      const node = renderPage(actual);
      if (!node) continue;
      nodes.push(
        <Animated.View
          key={actual}
          pointerEvents={offset === 0 ? 'auto' : 'none'}
          style={[styles.page, { top: v * pageHeight, height: pageHeight, width, transform: [{ translateY }] }]}
        >
          {node}
        </Animated.View>,
      );
    }
    return nodes;
  }, [count, pageHeight, width, virtual, isLoop, toActual, renderPage, translateY]);

  return (
    <View style={styles.root} collapsable={false} {...responder.panHandlers}>
      {pages}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GAME_SURFACE },
  page: { position: 'absolute', left: 0 },
});
