import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FEED } from '../../config/env';
import {
  dragAxis,
  dragOffset,
  pointInZones,
  resolveTarget,
  settleDuration,
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
  /** Publishes selection after the UI-thread snap, before onSettled. */
  onIndexChange: (index: number, direction: SwipeDirection) => void;
  /** Fired when the settle animation finishes and the pager is at rest. */
  onSettled: (index: number) => void;
  /**
   * `true` while a finger is on the pager or the pages are moving, `false`
   * once it is at rest with no finger down. UI-thread-heavy work (creating a
   * WebView) should wait for `false` so it never lands mid-gesture.
   */
  onBusyChange?: (busy: boolean) => void;
  onSwipeStart: () => void;
  renderPage: (index: number) => React.ReactNode;
}

/** Drag and snap run on the UI thread. React rotates the three-page window only at rest. */
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
  onSwipeStart,
  renderPage,
}: Props) {
  const wrap = loop && count > 2;
  const [center, setCenter] = useState(index);
  const selected = useRef(index);
  const previousCount = useRef(count);
  const mounted = useRef(true);
  const latest = useRef({
    onIndexChange,
    onSettled,
    onBusyChange,
    onSwipeStart,
  });
  latest.current = { onIndexChange, onSettled, onBusyChange, onSwipeStart };
  const offset = useSharedValue(-index * pageHeight);
  const base = useSharedValue(0);
  const grantY = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });
  const moving = useSharedValue(false);
  const awaitingCommit = useSharedValue(false);
  const generation = useSharedValue(0);
  const zones = touchZonesFor(index);
  const busy = useCallback(
    (value: boolean) => latest.current.onBusyChange?.(value),
    [],
  );
  const swipeStart = useCallback(() => latest.current.onSwipeStart(), []);
  const finish = useCallback(
    (target: number, previous: number) => {
      if (!mounted.current) return;
      const actual = wrap ? ((target % count) + count) % count : target;
      selected.current = actual;
      setCenter(target);
      if (target !== previous)
        latest.current.onIndexChange(actual, target > previous ? 1 : -1);
      latest.current.onSettled(actual);
      latest.current.onBusyChange?.(false);
    },
    [count, wrap],
  );

  // Resize invalidates motion even under a finger. Use measured stage dimensions.
  useLayoutEffect(() => {
    generation.value += 1;
    cancelAnimation(offset);
    const target =
      index === selected.current && count === previousCount.current
        ? center
        : index;
    previousCount.current = count;
    selected.current = index;
    if (target !== center) setCenter(target);
    offset.value = -target * pageHeight;
    moving.value = false;
    awaitingCommit.value = false;
    latest.current.onSettled(index);
    latest.current.onBusyChange?.(false);
  }, [
    index,
    center,
    count,
    pageHeight,
    width,
    offset,
    moving,
    awaitingCommit,
    generation,
  ]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(offset);
    };
  }, [offset]);

  const pan = Gesture.Pan()
    .enabled(swipeEnabled && count > 1 && pageHeight > 0 && width > 0)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      if (awaitingCommit.value || event.numberOfTouches !== 1) {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      start.value = { x: touch.x, y: touch.y };
      if (pointInZones(touch.x / width, touch.y / pageHeight, zones))
        manager.fail();
    })
    .onTouchesMove((event, manager) => {
      if (moving.value) return; // Once claimed, keep the vertical axis until release.
      if (event.numberOfTouches !== 1) {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      const axis = dragAxis(
        touch.x - start.value.x,
        touch.y - start.value.y,
        FEED.swipeSlopPx,
      );
      if (axis === 'horizontal') manager.fail();
      else if (axis === 'vertical') manager.activate();
    })
    .onStart(event => {
      cancelAnimation(offset);
      base.value = offset.value;
      grantY.value = event.translationY;
      moving.value = true;
      scheduleOnRN(busy, true);
      scheduleOnRN(swipeStart);
    })
    .onUpdate(event => {
      if (!moving.value) return;
      const rest = -center * pageHeight;
      offset.value =
        rest +
        dragOffset({
          dy: base.value - rest + event.translationY - grantY.value,
          current: center,
          count,
          pageHeight,
          resistance: FEED.overscrollResistance,
          maxOverscroll: FEED.overscrollMaxPx,
          loop: wrap,
        });
    })
    .onFinalize((event, success) => {
      if (!moving.value) return;
      moving.value = false;
      const velocity = success ? event.velocityY / 1000 : 0;
      const target = success
        ? resolveTarget({
            dy: offset.value + center * pageHeight,
            vy: velocity,
            current: center,
            count,
            pageHeight,
            thresholdRatio: FEED.swipeThresholdRatio,
            flingVelocity: FEED.swipeFlingVelocity,
            loop: wrap,
          })
        : center;
      const destination = -target * pageHeight;
      const distance = destination - offset.value;
      const token = generation.value;
      offset.value = withTiming(
        destination,
        {
          duration: settleDuration({
            distance,
            velocity: velocity * Math.sign(distance),
            pageHeight,
            baseMs: FEED.settleDurationMs,
            minMs: FEED.settleMinDurationMs,
          }),
          easing: Easing.out(Easing.cubic),
        },
        completed => {
          if (!completed || token !== generation.value) return;
          awaitingCommit.value = target !== center;
          scheduleOnRN(finish, target, center);
        },
      );
    });

  const slots: { virtual: number; actual: number }[] = [];
  for (let delta = -1; delta <= 1; delta++) {
    const virtual = center + delta;
    if (!wrap && (virtual < 0 || virtual >= count)) continue;
    slots.push({
      virtual,
      actual: wrap ? ((virtual % count) + count) % count : virtual,
    });
  }
  slots.sort((a, b) => a.actual - b.actual);
  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.root}
        collapsable={false}
        onTouchStart={() => busy(true)}
        onTouchEnd={event => {
          if (event.nativeEvent.touches.length === 0) busy(false);
        }}
        onTouchCancel={() => busy(false)}
      >
        {slots.map(slot => (
          <PagerPage
            key={slot.actual}
            top={slot.virtual * pageHeight}
            height={pageHeight}
            width={width}
            interactive={slot.virtual === center}
            offset={offset}
          >
            {renderPage(slot.actual)}
          </PagerPage>
        ))}
      </View>
    </GestureDetector>
  );
}

const PagerPage = memo(function PagerPageInner({
  top,
  height,
  width,
  interactive,
  offset,
  children,
}: {
  top: number;
  height: number;
  width: number;
  interactive: boolean;
  offset: SharedValue<number>;
  children: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.page, { top, height, width }, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GAME_SURFACE },
  page: { position: 'absolute', left: 0 },
});
