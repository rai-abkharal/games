import React from 'react';
import { Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PreGameTutorial } from '../src/components/tutorial/PreGameTutorial';
import { SwipeUpPrompt } from '../src/components/tutorial/SwipeUpPrompt';
import { HomeSwipeTutorial } from '../src/components/tutorial/HomeSwipeTutorial';
import { useTutorialStore } from '../src/store/tutorialStore';

describe('First-Time Tutorial Flow (PreGameTutorial)', () => {
  let activeRenderer: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    useTutorialStore.setState({
      swipeSeen: false,
      joystickSeen: false,
      preGameSnakeSeen: false,
      firstTimeTutorialCompleted: false,
      homeSwipeSeen: false,
      hydrated: true,
    });
  });

  afterEach(async () => {
    if (activeRenderer) {
      await act(async () => {
        activeRenderer?.unmount();
      });
      activeRenderer = null;
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('step "arrow_completed" renders "Swipe up for more" hand prompt and triggers onSwipeUp', async () => {
    const onSwipeUp = jest.fn();
    const onComplete = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <PreGameTutorial
          visible={true}
          step="arrow_completed"
          onSwipeUp={onSwipeUp}
          onComplete={onComplete}
        />,
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toContain('Swipe up for more');

    const pressable = root.findByProps({
      accessibilityLabel: 'Swipe up for more',
    });
    expect(pressable).toBeTruthy();

    await act(async () => {
      pressable.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
  });

  test('step "knife_hit_completed" renders "Swipe up for more" hand prompt and triggers onSwipeUp', async () => {
    const onSwipeUp = jest.fn();
    const onComplete = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <PreGameTutorial
          visible={true}
          step="knife_hit_completed"
          onSwipeUp={onSwipeUp}
          onComplete={onComplete}
        />,
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toContain('Swipe up for more');

    const pressable = root.findByProps({
      accessibilityLabel: 'Swipe up for more',
    });
    expect(pressable).toBeTruthy();

    await act(async () => {
      pressable.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
  });

  test('step "water_sort_completed" renders prominent "Let\'s Start" button and completes on tap', async () => {
    const onComplete = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <PreGameTutorial
          visible={true}
          step="water_sort_completed"
          onComplete={onComplete}
        />,
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toContain('Great Job!');
    expect(texts).toContain("Let's Start");

    const startButton = root.findByProps({ accessibilityLabel: "Let's Start" });
    expect(startButton).toBeTruthy();

    await act(async () => {
      startButton.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('steps "arrow_playing", "knife_hit_playing", and "water_sort_playing" render nothing to ensure zero touch blocking', async () => {
    const onComplete = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <PreGameTutorial
          visible={true}
          step="water_sort_playing"
          onComplete={onComplete}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();

    await act(async () => {
      renderer.update(
        <PreGameTutorial
          visible={true}
          step="arrow_playing"
          onComplete={onComplete}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();

    await act(async () => {
      renderer.update(
        <PreGameTutorial
          visible={true}
          step="knife_hit_playing"
          onComplete={onComplete}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  test('useTutorialStore markFirstTimeTutorialCompleted sets all completion flags and disables joystick tutorial', () => {
    const store = useTutorialStore.getState();
    expect(store.firstTimeTutorialCompleted).toBe(false);
    expect(store.preGameSnakeSeen).toBe(false);

    act(() => {
      store.markFirstTimeTutorialCompleted();
    });

    const updated = useTutorialStore.getState();
    expect(updated.firstTimeTutorialCompleted).toBe(true);
    expect(updated.preGameSnakeSeen).toBe(true);
    expect(updated.swipeSeen).toBe(true);
    expect(updated.joystickSeen).toBe(true);
  });

  test('SwipeUpPrompt renders hand gesture and triggers onSwipeUp on tap', async () => {
    const onSwipeUp = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <SwipeUpPrompt visible={true} onSwipeUp={onSwipeUp} />,
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toContain('Swipe up for more');

    const pressable = root.findByProps({
      accessibilityLabel: 'Swipe up for more',
    });
    expect(pressable).toBeTruthy();

    await act(async () => {
      pressable.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
  });

  test('home tutorial is a non-blocking bottom reveal and dismisses after three gesture cycles', async () => {
    const onDismiss = jest.fn();
    const progress = new Animated.Value(0);
    const revealProgress = new Animated.Value(0);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      activeRenderer = renderer = TestRenderer.create(
        <HomeSwipeTutorial
          visible={true}
          gestureProgress={progress}
          revealProgress={revealProgress}
          onDismiss={onDismiss}
        />,
      );
    });

    const root = renderer.root;
    expect(
      root.findByProps({ accessibilityLabel: 'Home swipe tutorial' }).props
        .pointerEvents,
    ).toBe('none');
    expect(root.findAllByType(Text).map(t => t.props.children)).toContain(
      'Swipe up for the next game',
    );

    await act(async () => {
      jest.advanceTimersByTime(5_700);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    await act(async () => renderer.unmount());
    activeRenderer = null;
  });

  test('home tutorial completion is persisted independently from pre-game onboarding', () => {
    act(() => useTutorialStore.getState().markHomeSwipeSeen());
    expect(useTutorialStore.getState().homeSwipeSeen).toBe(true);
    expect(useTutorialStore.getState().firstTimeTutorialCompleted).toBe(false);
  });

  test('firstTimeSplashCompleted is persisted and can be reset with resetTutorial', async () => {
    const store = useTutorialStore.getState();
    expect(store.firstTimeSplashCompleted).toBe(false);

    act(() => {
      store.markFirstTimeSplashCompleted();
    });
    expect(useTutorialStore.getState().firstTimeSplashCompleted).toBe(true);

    await act(async () => {
      await useTutorialStore.getState().resetTutorial();
    });
    expect(useTutorialStore.getState().firstTimeSplashCompleted).toBe(false);
  });
});
