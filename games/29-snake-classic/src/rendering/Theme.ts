import { GRID_COLS, GRID_ROWS } from '../game/Types.js';

export const THEME = {
  // Palettes
  bgSky: '#00AFF5',
  arenaBorder: '#14314E',
  boardLight: '#FFE6AD',
  boardDark: '#FDDE9E',

  // Snake
  snakeMain: '#40AC46',
  snakeLight: '#83CC43',
  snakeOutline: '#508D43',
  snakeShadow: 'rgba(91, 91, 52, 0.25)',

  // Food
  foodBase: '#FF5C4D',
  foodOutline: '#9A2B24',
  foodSeed: '#201A18',
  foodStem: '#67B63B',
  foodShadow: 'rgba(20, 49, 78, 0.28)',

  // Top Bar HUD
  uiWhite: '#FFFFFF',
  uiPinkChevron: '#E589A8',
  headerBadgeBg: '#14314E',
  crownAqua: '#1FD0C4',

  // Game Over
  gameOverOverlay: '#2F3045',
  resultCardBg: '#8B5D60',
  resultCreamBox: '#FFF3E3',
  scorePeach: '#FFA66E',
  statPillBg: '#6D464A',
  goldText: '#FFD21F',
  pinkText: '#FF859C',
  aquaText: '#1FD0C4',
  homeButton: '#E76C59',
  playAgainButton: '#1DB13F',

  // Layout Dimensions (dynamically updated in Renderer.resize)
  boardX: 0,
  boardY: 0,
  boardW: 0,
  boardH: 0,
  cellSize: 24,
  borderWidth: 10,

  // Top Bar layout
  pauseBtn: { x: 360, y: 55, r: 24 },
  modeBadge: { x: 80, y: 35, w: 105, h: 44, r: 9 },
  allTimeBadge: { x: 200, y: 35, w: 105, h: 44, r: 9 }
};

export function updateLayout(width: number, height: number): void {
  // Safe top HUD space
  const topSafe = Math.max(70, Math.min(100, Math.round(height * 0.11)));
  const bottomMargin = Math.max(20, Math.min(45, Math.round(height * 0.04)));
  const horizontalMargin = Math.max(12, Math.min(24, Math.round(width * 0.04)));

  const maxPlayW = width - 2 * horizontalMargin;
  const maxPlayH = height - topSafe - bottomMargin;

  // 13 cols x 21 rows aspect ratio
  const cellByWidth = maxPlayW / GRID_COLS;
  const cellByHeight = maxPlayH / GRID_ROWS;
  const cellSize = Math.floor(Math.min(cellByWidth, cellByHeight));

  const boardW = cellSize * GRID_COLS;
  const boardH = cellSize * GRID_ROWS;
  const boardX = Math.round((width - boardW) / 2);

  // Position board with pleasant top breathing room
  const availableV = height - topSafe - bottomMargin - boardH;
  const boardY = Math.round(topSafe + availableV * 0.35);

  THEME.cellSize = cellSize;
  THEME.boardW = boardW;
  THEME.boardH = boardH;
  THEME.boardX = boardX;
  THEME.boardY = boardY;
  THEME.borderWidth = Math.max(6, Math.min(14, Math.round(cellSize * 0.38)));

  // Responsive Top Bar buttons & badges
  const btnRadius = Math.max(18, Math.min(24, Math.round(width * 0.055)));
  const hudCenterY = Math.round(topSafe * 0.52);

  THEME.pauseBtn = {
    x: Math.round(boardX + boardW - btnRadius * 0.9),
    y: hudCenterY,
    r: btnRadius
  };

  const badgeH = Math.round(btnRadius * 1.85);
  const badgeY = Math.round(hudCenterY - badgeH / 2);

  // Remaining width between board left and pause button
  const availableBadgeArea = THEME.pauseBtn.x - btnRadius - 16 - (boardX + 4);
  const badgeW = Math.min(125, Math.max(88, Math.floor((availableBadgeArea - 12) / 2)));

  THEME.modeBadge = {
    x: Math.round(boardX + 4),
    y: badgeY,
    w: badgeW,
    h: badgeH,
    r: 9
  };

  THEME.allTimeBadge = {
    x: Math.round(boardX + 4 + badgeW + 12),
    y: badgeY,
    w: badgeW,
    h: badgeH,
    r: 9
  };
}
