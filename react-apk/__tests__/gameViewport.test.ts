import { GAME_VIEWPORT_SCRIPT } from '../src/services/gameViewport';

function host(direction = 'row', hasCanvas = true) {
  const style = { setProperty: jest.fn() };
  const container = { style, querySelector: () => (hasCanvas ? {} : null) };
  const document = {
    getElementById: () => container,
    addEventListener: jest.fn(),
  };
  const window = {
    getComputedStyle: () => ({ display: 'flex', flexDirection: direction }),
    addEventListener: jest.fn(),
    __PHASER_GAME__: { scale: { autoCenter: 2, refresh: jest.fn() } },
    Phaser: { Scale: { CENTER_HORIZONTALLY: 1 } },
  };
  // Execute the exact static script that WebView receives.
  const apply = () =>
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', GAME_VIEWPORT_SCRIPT)(window, document);
  return { style, window, document, apply };
}

test.each(['row', 'column'])(
  'anchors a %s canvas without rewriting canvas dimensions',
  direction => {
    const fixture = host(direction);
    fixture.apply();
    expect(fixture.style.setProperty).toHaveBeenCalledTimes(1);
    expect(fixture.style.setProperty).toHaveBeenCalledWith(
      direction === 'row' ? 'align-items' : 'justify-content',
      'flex-start',
    );
    expect(fixture.window.__PHASER_GAME__.scale.autoCenter).toBe(1);
    expect(fixture.window.__PHASER_GAME__.scale.refresh).toHaveBeenCalledTimes(
      1,
    );
  },
);

test('reapplies on resize but installs listeners only once across bootstrap fallbacks', () => {
  const fixture = host();
  fixture.apply();
  fixture.apply();
  expect(fixture.document.addEventListener).toHaveBeenCalledTimes(1);
  expect(fixture.window.addEventListener).toHaveBeenCalledTimes(2);
  const resize = fixture.window.addEventListener.mock.calls.find(
    call => call[0] === 'resize',
  )![1];
  resize();
  expect(fixture.window.__PHASER_GAME__.scale.refresh).toHaveBeenCalledTimes(3);
});

test('leaves non-canvas game layouts alone', () => {
  const fixture = host('row', false);
  fixture.apply();
  expect(fixture.style.setProperty).not.toHaveBeenCalled();
  expect(fixture.window.__PHASER_GAME__.scale.refresh).not.toHaveBeenCalled();
});
