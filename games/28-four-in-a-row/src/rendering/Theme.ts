export const THEME = {
  // Calibrated colors from reference screenshot
  playerBg: '#F99975',   // Coral during human turn
  botBg: '#5AA7D4',      // Cyan Blue during bot turn

  // Discs (Solid flat vibrant colors, no distracting inner rings)
  playerDisc: '#FF5F55', // Human coral red piece
  botDisc: '#01C2EF',    // Bot bright cyan blue piece

  // Board
  boardFace: '#1F2630',  // Deep slate board plate
  baseBar: '#151C23',    // Dark charcoal bottom base bar
  emptyHole: '#545B64',  // Solid slate gray hole interior
  holeOutline: '#000000',// Thick pure black rim

  // UI
  white: '#FFFFFF',
  textDark: '#0F172A',
  textMuted: '#64748B',

  // Results & Buttons
  resultOverlay: 'rgba(45, 31, 49, 0.88)',
  btnPlayAgain: '#22C55E',
  btnStats: '#8B5CF6',
  btnHome: '#FF5F55',

  // Exact Board Geometry matching reference screenshot
  boardX: 6,
  boardY: 300,
  boardW: 388,
  boardH: 389,
  boardRadius: 22,

  slotRadius: 23.5,
  slotOutlineWidth: 5.5,

  // 7 Column Centers & 6 Row Centers (Perfect square grid)
  slotCentersX: [33.7, 89.1, 144.6, 200.0, 255.4, 310.9, 366.3],
  slotCentersY: [344.0, 399.4, 454.9, 510.3, 565.7, 621.1],

  // Preview piece rests right on top of board edge
  previewY: 276
};
