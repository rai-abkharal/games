/** Host-only layout policy for the catalogue's centered, fixed-aspect canvases.
 * Keep the game's own canvas size and coordinate system; anchor its top edge
 * to the measured WebView instead of splitting spare height above and below.
 */
export const GAME_VIEWPORT_SCRIPT = `
(function () {
  function apply() {
    var container = document.getElementById('game-container');
    if (!container || !container.querySelector('canvas')) return;
    var layout = window.getComputedStyle(container);
    if (layout.display === 'flex') {
      var vertical = layout.flexDirection.indexOf('column') === 0;
      container.style.setProperty(vertical ? 'justify-content' : 'align-items', 'flex-start');
    }
    var game = window.__PHASER_GAME__;
    if (game && game.scale && window.Phaser) {
      game.scale.autoCenter = window.Phaser.Scale.CENTER_HORIZONTALLY;
      game.scale.refresh();
    }
  }
  if (!window.__SP_VIEWPORT__) {
    window.__SP_VIEWPORT__ = apply;
    document.addEventListener('DOMContentLoaded', apply, { once: true });
    window.addEventListener('load', apply, { once: true });
    window.addEventListener('resize', apply);
  }
  window.__SP_VIEWPORT__();
})();
true;
`;
