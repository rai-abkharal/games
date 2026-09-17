import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PreGameTutorial } from '../src/components/tutorial/PreGameTutorial';
import { useTutorialStore } from '../src/store/tutorialStore';

describe('PreGameTutorial', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useTutorialStore.setState({
      swipeSeen: false,
      joystickSeen: false,
      preGameSnakeSeen: false,
      hydrated: true,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('renders initial Screen 1 with feed exploration titles and skip button', async () => {
    const onComplete = jest.fn();
    const onSkip = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PreGameTutorial visible={true} onComplete={onComplete} onSkip={onSkip} />,
      );
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);

    expect(texts).toContain('SWIPE TO EXPLORE');
    expect(texts).toContain('Discover more games');
    expect(texts).toContain('Skip');
    expect(texts).toContain('CURRENT GAME');
    expect(texts).toContain('NEXT GAME');
  });

  test('tapping Skip calls onSkip callback', async () => {
    const onComplete = jest.fn();
    const onSkip = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PreGameTutorial visible={true} onComplete={onComplete} onSkip={onSkip} />,
      );
    });

    const root = renderer.root;
    const skipButton = root.findByProps({ accessibilityLabel: 'Skip tutorial' });

    await act(async () => {
      skipButton.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('advances to Screen 2 (SWIPE TO STEER) on timer fallback or manual advance', async () => {
    const onComplete = jest.fn();
    const onSkip = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PreGameTutorial visible={true} onComplete={onComplete} onSkip={onSkip} />,
      );
    });

    // Advance past Screen 1 auto timer (~5800ms)
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);

    expect(texts).toContain('SWIPE TO STEER');
    expect(texts).toContain('Swipe inside the pad to move');
  });

  test('progresses to Screen 3 (READY? / LETS PLAY) and completes on button press', async () => {
    const onComplete = jest.fn();
    const onSkip = jest.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PreGameTutorial visible={true} onComplete={onComplete} onSkip={onSkip} />,
      );
    });

    // Advance to Screen 2
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    // Advance to Screen 3 (~6600ms)
    await act(async () => {
      jest.advanceTimersByTime(7000);
    });

    const root = renderer.root;
    const texts = root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toContain('READY?');

    const playButton = root.findByProps({ accessibilityLabel: "Let's Play" });
    expect(playButton).toBeTruthy();

    await act(async () => {
      playButton.props.onPress();
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('useTutorialStore markPreGameSnakeSeen sets preGameSnakeSeen, swipeSeen, and joystickSeen', () => {
    const store = useTutorialStore.getState();
    expect(store.preGameSnakeSeen).toBe(false);

    act(() => {
      store.markPreGameSnakeSeen();
    });

    const updated = useTutorialStore.getState();
    expect(updated.preGameSnakeSeen).toBe(true);
    expect(updated.swipeSeen).toBe(true);
    expect(updated.joystickSeen).toBe(true);
  });
});
