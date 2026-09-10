import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { FEED } from '../../config/env';
import { dragOffset, pointInZones, resolveTarget, shouldClaimSwipe } from '../../feed/pagerGesture';
import type { SwipeDirection } from '../../feed/preloadPlanner';
import type { TouchZone } from '../../types/game';
import { GAME_SURFACE } from '../../theme/themes';

interface Props {
  count: number;
  /** Controlled current page. Changing it from outside jumps without animation. */
  index: number;
  pageHeight: number;
  width: number;
  swipeEnabled: boolean;
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
 * Pages are laid out at `index * pageHeight` inside one translated container
 * (native-driver transform), so a drag costs a single value update per touch
 * move and the snap runs entirely on the UI thread. The pager is a plain
 * responder on the pages' ancestor: taps and small drags reach the game, and
 * only once a drag is clearly vertical (RecyclerView's slop + dominant-axis
 * rule) — and did not start in one of the game's `touchZones` — does the pager
 * claim it, which cancels the touch inside the WebView exactly like a
 * ViewPager2 intercept. Games can switch swiping off through the bridge.
 */
export function GamePager({
  count,
  index,
  pageHeight,
  width,
  swipeEnabled,
  touchZonesFor,
  onIndexChange,
  onSettled,
  renderPage,
}: Props) {
  const translateY = useRef(new Animated.Value(-index * pageHeight)).current;
  const valueRef = useRef(-index * pageHeight);
  const positionRef = useRef(index);
  const originRef = useRef({ x: 0, y: 0 });
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const gesture = useRef({ base: 0, dyAtGrant: 0, active: false });

  const latest = useRef({ count, pageHeight, width, swipeEnabled, touchZonesFor, onIndexChange, onSettled });
  latest.current = { count, pageHeight, width, swipeEnabled, touchZonesFor, onIndexChange, onSettled };

  // Track the animated value so an interrupted settle continues from where it is.
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
      positionRef.current = target;
      const value = -target * latest.current.pageHeight;
      valueRef.current = value;
      translateY.setValue(value);
    },
    [stopAnimation, translateY],
  );

  // External changes (tab switch, catalogue reorder, initial page, page height)
  // jump instantly. The parent echoing an index this pager itself reported
  // must not interrupt the settle animation, hence the position check.
  const lastHeight = useRef(pageHeight);
  useEffect(() => {
    const heightChanged = lastHeight.current !== pageHeight;
    lastHeight.current = pageHeight;
    if ((positionRef.current !== index || heightChanged) && !gesture.current.active) jumpTo(index);
  }, [index, pageHeight, jumpTo]);

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
          latest.current.onSettled(target);
        }
      });
    },
    [stopAnimation, translateY],
  );

  const measureOrigin = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const onLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      measureOrigin();
    },
    [measureOrigin],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (event, state) => {
          const { swipeEnabled: enabled, count: total, pageHeight: h, width: w, touchZonesFor: zonesFor } = latest.current;
          if (!enabled || total <= 1 || h <= 0 || w <= 0) return false;
          const startX = event.nativeEvent.pageX - state.dx - originRef.current.x;
          const startY = event.nativeEvent.pageY - state.dy - originRef.current.y;
          const startedInZone = pointInZones(startX / w, startY / h, zonesFor(positionRef.current));
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
          const { count: total, pageHeight: h } = latest.current;
          const rest = -positionRef.current * h;
          // Distance from the resting position, including any interrupted settle.
          const dy = gesture.current.base - rest + (state.dy - gesture.current.dyAtGrant);
          const offset = dragOffset({
            dy,
            current: positionRef.current,
            count: total,
            pageHeight: h,
            resistance: FEED.overscrollResistance,
            maxOverscroll: FEED.overscrollMaxPx,
          });
          const value = rest + offset;
          valueRef.current = value;
          translateY.setValue(value);
        },
        onPanResponderRelease: (_event, state) => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          const { count: total, pageHeight: h, onIndexChange: notify } = latest.current;
          const current = positionRef.current;
          const dy = valueRef.current + current * h;
          const target = resolveTarget({
            dy,
            vy: state.vy,
            current,
            count: total,
            pageHeight: h,
            thresholdRatio: FEED.swipeThresholdRatio,
            flingVelocity: FEED.swipeFlingVelocity,
          });
          if (target !== current) {
            positionRef.current = target;
            notify(target, target > current ? 1 : -1);
          }
          settleTo(target);
        },
        onPanResponderTerminate: () => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          settleTo(positionRef.current);
        },
      }),
    [settleTo, stopAnimation, translateY],
  );

  const pages = useMemo(() => {
    if (pageHeight <= 0 || width <= 0) return null;
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
      const node = renderPage(i);
      if (!node) continue;
      nodes.push(
        <View key={i} style={[styles.page, { top: i * pageHeight, height: pageHeight, width }]}>
          {node}
        </View>,
      );
    }
    return nodes;
  }, [count, pageHeight, width, renderPage]);

  return (
    <View ref={rootRef} style={styles.root} onLayout={onLayout} collapsable={false} {...responder.panHandlers}>
      <Animated.View style={[styles.track, { transform: [{ translateY }] }]}>{pages}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GAME_SURFACE },
  track: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  page: { position: 'absolute', left: 0 },
});
