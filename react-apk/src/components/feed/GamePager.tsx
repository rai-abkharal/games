import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
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
  loop = true,
  touchZonesFor,
  onIndexChange,
  onSettled,
  renderPage,
}: Props) {
  const translateY = useRef(new Animated.Value(-index * pageHeight)).current;
  const valueRef = useRef(-index * pageHeight);
  const positionRef = useRef(index);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const gesture = useRef({ base: 0, dyAtGrant: 0, active: false });

  const latest = useRef({ count, pageHeight, width, swipeEnabled, loop, touchZonesFor, onIndexChange, onSettled });
  latest.current = { count, pageHeight, width, swipeEnabled, loop, touchZonesFor, onIndexChange, onSettled };

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
      const val = (translateY as any)._value;
      if (typeof val === 'number') {
        valueRef.current = val;
      }
    }
  }, [translateY]);

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
      const h = latest.current.pageHeight;
      const total = latest.current.count;
      const isLoop = latest.current.loop && total > 1;
      const toValue = -target * h;
      const animation = Animated.timing(translateY, {
        toValue,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (animationRef.current === animation) animationRef.current = null;
        if (finished) {
          if (isLoop) {
            const normalized = ((target % total) + total) % total;
            positionRef.current = normalized;
            const normValue = -normalized * h;
            valueRef.current = normValue;
            translateY.setValue(normValue);
            latest.current.onSettled(normalized);
          } else {
            valueRef.current = toValue;
            latest.current.onSettled(target);
          }
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
          touchStartRef.current = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
          return false;
        },
        onMoveShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, state) => {
          const { swipeEnabled: enabled, count: total, pageHeight: h, width: w, touchZonesFor: zonesFor } = latest.current;
          if (!enabled || total <= 1 || h <= 0 || w <= 0) return false;
          const startedInZone = pointInZones(
            touchStartRef.current.x / w,
            touchStartRef.current.y / h,
            zonesFor(positionRef.current),
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
          const { count: total, pageHeight: h, loop: isLoop } = latest.current;
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
            loop: isLoop && total > 1,
          });
          const value = rest + offset;
          valueRef.current = value;
          translateY.setValue(value);
        },
        onPanResponderRelease: (_event, state) => {
          if (!gesture.current.active) return;
          gesture.current.active = false;
          const { count: total, pageHeight: h, loop: isLoop, onIndexChange: notify } = latest.current;
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
            loop: isLoop && total > 1,
          });
          if (target !== current) {
            positionRef.current = target;
            const norm = isLoop && total > 1 ? ((target % total) + total) % total : target;
            notify(norm, target > current ? 1 : -1);
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

  // ViewPager2 offscreenPageLimit = 1: strictly render active item and immediate neighbors
  const pages = useMemo(() => {
    if (pageHeight <= 0 || width <= 0) return null;
    const isLoop = loop && count > 1;
    const nodes: React.ReactNode[] = [];
    const minOffset = -1;
    const maxOffset = 1;
    for (let offset = minOffset; offset <= maxOffset; offset++) {
      const virtualIdx = index + offset;
      if (!isLoop && (virtualIdx < 0 || virtualIdx >= count)) continue;
      const actualIdx = ((virtualIdx % count) + count) % count;
      const node = renderPage(actualIdx);
      if (!node) continue;
      nodes.push(
        <View
          key={actualIdx}
          pointerEvents={offset === 0 ? 'auto' : 'none'}
          style={[styles.page, { top: virtualIdx * pageHeight, height: pageHeight, width }]}
        >
          {node}
        </View>,
      );
    }
    return nodes;
  }, [count, pageHeight, width, index, loop, renderPage]);

  return (
    <View ref={rootRef} style={styles.root} collapsable={false} {...responder.panHandlers}>
      <Animated.View
        style={[
          styles.track,
          {
            width,
            height: Math.max(3, count + 2) * pageHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        {pages}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GAME_SURFACE },
  track: { position: 'absolute', top: 0, left: 0 },
  page: { position: 'absolute', left: 0 },
});
