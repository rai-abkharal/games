export const DESIGN_WIDTH = 478;
export const DESIGN_HEIGHT = 850;
export const RENDER_SCALE = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

const viewportWidth = Math.max(1, window.visualViewport?.width ?? window.innerWidth ?? DESIGN_WIDTH);
const viewportHeight = Math.max(1, window.visualViewport?.height ?? window.innerHeight ?? DESIGN_HEIGHT);

// Keep the authored 478x850 playfield intact and extend the scene vertically on
// taller phones. This fills the WebView without stretching or dark letterboxing.
export const GAME_HEIGHT = Math.max(
  DESIGN_HEIGHT,
  Math.min(1100, Math.round(DESIGN_WIDTH * (viewportHeight / viewportWidth)))
);
export const VERTICAL_SAFE_PADDING = Math.max(0, (GAME_HEIGHT - DESIGN_HEIGHT) / 2);

export const BASE_LAUNCH_SPEED = 29.5; // in Matter.js velocity units (~790-800px/s)
export const DESIGN_GRAVITY = 0.82;   // in Matter.js gravity units (~720px/s^2)

export const COLLISION_CATEGORIES = {
  DEFAULT: 0x0001,
  LAUNCHER: 0x0002,
  PROJECTILE: 0x0004,
  PLATFORM: 0x0008,
  STAR: 0x0010,
  PORTAL: 0x0020
};

export const COLORS = {
  // Bottles
  ORANGE: 0xFF5918,
  YELLOW: 0xFFD40A,
  GREEN: 0x54D31A,
  RED_CAN: 0xF1221C,

  // Hex strings for canvas / SVG drawing
  HEX_ORANGE: '#FF5918',
  HEX_YELLOW: '#FFD40A',
  HEX_GREEN: '#54D31A',
  HEX_RED_CAN: '#F1221C',

  // Stars
  STAR_HIGHLIGHT: '#FFD51A',
  STAR_MAIN: '#F8C800',
  STAR_SHADOW: '#E59A00',
  STAR_OUTLINE: '#282414',

  // Wood Platforms
  WOOD_MAIN: '#E5B25F',
  WOOD_HIGHLIGHT: '#F1C575',
  WOOD_GRAIN: '#B9853C',
  WOOD_OUTLINE: '#B27432',

  // Blue Platforms
  BLUE_MAIN: '#12ACE5',
  BLUE_HIGHLIGHT: '#26BFF0',
  BLUE_EDGE: '#0788C6',

  // UI Green
  UI_GREEN: '#50D800',
  UI_GREEN_NUM: 0x50D800
};
