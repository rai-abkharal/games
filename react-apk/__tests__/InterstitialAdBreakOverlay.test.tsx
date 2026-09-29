import React from 'react';
import { BackHandler, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { InterstitialAdBreakOverlay } from '../src/components/InterstitialAdBreakOverlay';
import { useAdsStore } from '../src/services/adManager';

jest.mock('../src/services/adManager', () => ({
  useAdsStore: require('zustand').create(() => ({ interstitialBreakPhase: 'idle', interstitialCountdown: null })),
}));

let tree: TestRenderer.ReactTestRenderer;
const removed = jest.fn();
beforeEach(() => {
  useAdsStore.setState({ interstitialBreakPhase: 'idle', interstitialCountdown: null });
  removed.mockClear();
  jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removed });
  act(() => { tree = TestRenderer.create(<InterstitialAdBreakOverlay />); });
});
afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

test('renders nothing when no interstitial break is active', () => { expect(tree.toJSON()).toBeNull(); });

test('shows Ad Break and the countdown, blocks touches/back, and stays until resume delay ends', () => {
  act(() => useAdsStore.setState({ interstitialBreakPhase: 'countdown', interstitialCountdown: 3 }));
  const overlay = tree.root.findByProps({ testID: 'interstitial-ad-break' });
  expect(overlay.props.onStartShouldSetResponder()).toBe(true);
  expect(overlay.props.onMoveShouldSetResponder()).toBe(true);
  expect(overlay.props.onResponderTerminationRequest()).toBe(false);
  expect(BackHandler.addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
  expect(jest.mocked(BackHandler.addEventListener).mock.calls[0][1]({} as any)).toBe(true);
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('Ad Break');
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain(3);
  act(() => useAdsStore.setState({ interstitialCountdown: 2 }));
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain(2);
  act(() => useAdsStore.setState({ interstitialBreakPhase: 'showing', interstitialCountdown: null }));
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('Opening ad…');
  expect(removed).toHaveBeenCalledTimes(1);
  act(() => useAdsStore.setState({ interstitialBreakPhase: 'resuming' }));
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('Resuming your game…');
  act(() => useAdsStore.setState({ interstitialBreakPhase: 'idle' }));
  expect(tree.toJSON()).toBeNull();
});
