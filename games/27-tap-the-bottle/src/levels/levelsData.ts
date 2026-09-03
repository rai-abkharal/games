import { LevelDefinition } from './types';

export const LEVELS: LevelDefinition[] = [
  // --- LEVEL 1 ---
  {
    id: 1,
    theme: 'blue',
    tutorial: true,
    platforms: [
      { x: 239, y: 670, width: 360, height: 36, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 239, y: 575, rotation: 0, launchAngle: -90, launchSpeed: 23.5 }
    ],
    stars: [
      { x: 239, y: 440 },
      { x: 239, y: 320 },
      { x: 239, y: 200 }
    ]
  },

  // --- LEVEL 2 ---
  {
    id: 2,
    theme: 'blue',
    platforms: [
      { x: 239, y: 670, width: 380, height: 36, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'yellow', x: 140, y: 575, rotation: 0, launchAngle: -78, launchSpeed: 23.5 },
      { id: 'b2', type: 'bottle', color: 'orange', x: 338, y: 575, rotation: 0, launchAngle: -102, launchSpeed: 23.5 }
    ],
    stars: [
      { x: 175, y: 420 },
      { x: 145, y: 230 },
      { x: 305, y: 420 },
      { x: 335, y: 230 }
    ]
  },

  // --- LEVEL 3 ---
  {
    id: 3,
    theme: 'blue',
    platforms: [
      { x: 95, y: 520, width: 140, height: 34, type: 'wood' },
      { x: 239, y: 700, width: 150, height: 34, type: 'wood' },
      { x: 383, y: 520, width: 140, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'green', x: 95, y: 425, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'yellow', x: 239, y: 605, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'orange', x: 383, y: 425, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 230 },
      { x: 95, y: 160 },
      { x: 383, y: 160 }
    ]
  },

  // --- LEVEL 4 ---
  {
    id: 4,
    theme: 'blue',
    platforms: [
      { x: 95, y: 440, width: 145, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 95, y: 360, rotation: 0, launchAngle: 27, launchSpeed: 24 }
    ],
    stars: [
      { x: 202, y: 395 },
      { x: 309, y: 475 },
      { x: 395, y: 565 }
    ]
  },

  // --- LEVEL 5 ---
  {
    id: 5,
    theme: 'blue',
    platforms: [
      { x: 80, y: 350, width: 130, height: 34, type: 'wood' },
      { x: 398, y: 480, width: 130, height: 34, type: 'wood' },
      { x: 239, y: 700, width: 150, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 80, y: 270, rotation: 0, launchAngle: 30, launchSpeed: 23 },
      { id: 'c2', type: 'can', color: 'red', x: 398, y: 400, rotation: 0, launchAngle: 150, launchSpeed: 23 },
      { id: 'b1', type: 'bottle', color: 'yellow', x: 239, y: 605, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 240 },
      { x: 270, y: 395 },
      { x: 160, y: 570 }
    ]
  },

  // --- LEVEL 6 ---
  {
    id: 6,
    theme: 'blue',
    platforms: [
      { x: 80, y: 280, width: 130, height: 34, type: 'wood' },
      { x: 398, y: 470, width: 130, height: 34, type: 'wood' },
      { x: 80, y: 670, width: 130, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 80, y: 200, rotation: 0, launchAngle: 28, launchSpeed: 23 },
      { id: 'c2', type: 'can', color: 'red', x: 398, y: 390, rotation: 0, launchAngle: 152, launchSpeed: 23 },
      { id: 'c3', type: 'can', color: 'red', x: 80, y: 590, rotation: 0, launchAngle: 20, launchSpeed: 24.5 }
    ],
    stars: [
      { x: 386, y: 320 },
      { x: 80, y: 516 },
      { x: 360, y: 710 }
    ]
  },

  // --- LEVEL 7 ---
  {
    id: 7,
    theme: 'blue',
    platforms: [
      { x: 239, y: 680, width: 180, height: 36, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'green', x: 239, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 27 }
    ],
    stars: [
      { x: 239, y: 440 },
      { x: 239, y: 300 },
      { x: 239, y: 160 }
    ]
  },

  // --- LEVEL 8 ---
  {
    id: 8,
    theme: 'blue',
    platforms: [
      { x: 140, y: 260, width: 150, height: 30, rotation: 28, type: 'wood' },
      { x: 338, y: 260, width: 150, height: 30, rotation: -28, type: 'wood' },
      { x: 239, y: 700, width: 200, height: 32, type: 'wood' },
      { x: 130, y: 660, width: 120, height: 30, rotation: -40, type: 'wood' },
      { x: 348, y: 660, width: 120, height: 30, rotation: 40, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 239, y: 240, rotation: 180, launchAngle: 90, launchSpeed: 22 },
      { id: 'b2', type: 'bottle', color: 'orange', x: 205, y: 605, rotation: 0, launchAngle: -86, launchSpeed: 26 },
      { id: 'b3', type: 'bottle', color: 'orange', x: 273, y: 605, rotation: 0, launchAngle: -94, launchSpeed: 26 }
    ],
    stars: [
      { x: 110, y: 460 },
      { x: 239, y: 460 },
      { x: 368, y: 460 }
    ]
  },

  // --- LEVEL 9 ---
  {
    id: 9,
    theme: 'blue',
    platforms: [
      { x: 150, y: 440, width: 220, height: 34, type: 'wood' },
      { x: 320, y: 560, width: 220, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 170, y: 405, rotation: -90, launchAngle: -10, launchSpeed: 23 },
      { id: 'b2', type: 'bottle', color: 'yellow', x: 300, y: 465, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 430, y: 440 },
      { x: 300, y: 300 },
      { x: 300, y: 170 }
    ]
  },

  // --- LEVEL 10 ---
  {
    id: 10,
    theme: 'blue',
    platforms: [
      { x: 140, y: 250, width: 150, height: 30, rotation: -30, type: 'wood' },
      { x: 338, y: 250, width: 150, height: 30, rotation: 30, type: 'wood' },
      { x: 239, y: 640, width: 36, height: 160, type: 'wood' },
      { x: 239, y: 720, width: 360, height: 34, type: 'wood' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'green', x: 239, y: 230, rotation: 180, launchAngle: 90, launchSpeed: 22 },
      { id: 'b2', type: 'bottle', color: 'green', x: 150, y: 625, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'green', x: 328, y: 625, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 520 },
      { x: 100, y: 400 },
      { x: 378, y: 400 }
    ]
  },

  // --- LEVEL 11 ---
  {
    id: 11,
    theme: 'pink',
    platforms: [
      { x: 239, y: 680, width: 420, height: 36, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 100, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'yellow', x: 240, y: 645, rotation: 90, launchAngle: 180, launchSpeed: 22 },
      { id: 'b3', type: 'bottle', color: 'green', x: 378, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 70, y: 230 },
      { x: 350, y: 230 },
      { x: 440, y: 620 }
    ]
  },

  // --- LEVEL 12 ---
  {
    id: 12,
    theme: 'pink',
    platforms: [
      { x: 239, y: 680, width: 420, height: 36, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 70, y: 645, rotation: -90, launchAngle: 0, launchSpeed: 22 },
      { id: 'b2', type: 'bottle', color: 'orange', x: 180, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'green', x: 245, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b4', type: 'bottle', color: 'orange', x: 310, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 180, y: 250 },
      { x: 320, y: 250 },
      { x: 440, y: 620 }
    ]
  },

  // --- LEVEL 13 ---
  {
    id: 13,
    theme: 'pink',
    platforms: [
      { x: 239, y: 700, width: 420, height: 36, type: 'blue' },
      { x: 120, y: 630, width: 140, height: 30, rotation: 25, type: 'blue' },
      { x: 358, y: 630, width: 140, height: 30, rotation: -25, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'yellow', x: 85, y: 630, rotation: -25, launchAngle: -65, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'green', x: 239, y: 605, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'orange', x: 393, y: 630, rotation: 25, launchAngle: -115, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 320 },
      { x: 155, y: 430 },
      { x: 323, y: 430 }
    ]
  },

  // --- LEVEL 14 ---
  {
    id: 14,
    theme: 'pink',
    platforms: [
      { x: 80, y: 470, width: 130, height: 32, type: 'blue' },
      { x: 398, y: 470, width: 130, height: 32, type: 'blue' },
      { x: 239, y: 680, width: 360, height: 36, type: 'blue' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 80, y: 395, rotation: 0, launchAngle: 25, launchSpeed: 23 },
      { id: 'c2', type: 'can', color: 'red', x: 398, y: 395, rotation: 0, launchAngle: 155, launchSpeed: 23 },
      { id: 'b1', type: 'bottle', color: 'green', x: 239, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 230 },
      { x: 175, y: 430 },
      { x: 303, y: 430 }
    ]
  },

  // --- LEVEL 15 ---
  {
    id: 15,
    theme: 'pink',
    platforms: [
      { x: 239, y: 680, width: 420, height: 36, type: 'blue' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 75, y: 605, rotation: 0, launchAngle: 25, launchSpeed: 23 },
      { id: 'b1', type: 'bottle', color: 'yellow', x: 160, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'green', x: 230, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'orange', x: 300, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 140, y: 240 },
      { x: 280, y: 240 },
      { x: 430, y: 620 }
    ]
  },

  // --- LEVEL 16 ---
  {
    id: 16,
    theme: 'pink',
    platforms: [
      { x: 239, y: 330, width: 400, height: 34, type: 'blue' },
      { x: 239, y: 680, width: 400, height: 34, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'yellow', x: 80, y: 235, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'c1', type: 'can', color: 'red', x: 185, y: 255, rotation: 0, launchAngle: 25, launchSpeed: 23 },
      { id: 'c2', type: 'can', color: 'red', x: 290, y: 255, rotation: 0, launchAngle: 155, launchSpeed: 23 },
      { id: 'b2', type: 'bottle', color: 'orange', x: 395, y: 235, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b3', type: 'bottle', color: 'green', x: 239, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 440 },
      { x: 430, y: 470 }
    ]
  },

  // --- LEVEL 17 ---
  {
    id: 17,
    theme: 'pink',
    platforms: [
      { x: 110, y: 380, width: 80, height: 26, type: 'blue' },
      { x: 368, y: 380, width: 80, height: 26, type: 'blue' },
      { x: 80, y: 540, width: 80, height: 26, type: 'blue' },
      { x: 239, y: 480, width: 80, height: 26, type: 'blue' },
      { x: 110, y: 680, width: 80, height: 26, type: 'blue' },
      { x: 368, y: 680, width: 80, height: 26, type: 'blue' }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 110, y: 305, rotation: 0, launchAngle: 25, launchSpeed: 23 },
      { id: 'b1', type: 'bottle', color: 'yellow', x: 368, y: 285, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'green', x: 80, y: 445, rotation: 0, launchAngle: -90, launchSpeed: 24 },
      { id: 'c2', type: 'can', color: 'red', x: 239, y: 405, rotation: 0, launchAngle: 155, launchSpeed: 23 },
      { id: 'c3', type: 'can', color: 'red', x: 110, y: 605, rotation: 0, launchAngle: 25, launchSpeed: 23 },
      { id: 'b3', type: 'bottle', color: 'orange', x: 368, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 320 },
      { x: 140, y: 580 },
      { x: 320, y: 640 }
    ]
  },

  // --- LEVEL 18 ---
  {
    id: 18,
    theme: 'pink',
    platforms: [
      { x: 239, y: 680, width: 420, height: 36, type: 'blue' },
      { x: 300, y: 540, width: 90, height: 28, rotation: 40, type: 'blue' },
      { x: 300, y: 330, width: 90, height: 28, rotation: 40, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'yellow', x: 200, y: 585, rotation: 0, launchAngle: -80, launchSpeed: 25 }
    ],
    stars: [
      { x: 239, y: 356 },
      { x: 222, y: 430 },
      { x: 209, y: 494 }
    ]
  },

  // --- LEVEL 19 ---
  {
    id: 19,
    theme: 'pink',
    platforms: [
      { x: 239, y: 680, width: 420, height: 36, type: 'blue' },
      { x: 120, y: 600, width: 80, height: 26, rotation: 35, type: 'blue' },
      { x: 120, y: 390, width: 80, height: 26, rotation: 35, type: 'blue' },
      { x: 358, y: 600, width: 80, height: 26, rotation: -35, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 60, y: 585, rotation: 0, launchAngle: -70, launchSpeed: 24 },
      { id: 'b2', type: 'bottle', color: 'orange', x: 418, y: 585, rotation: 0, launchAngle: -110, launchSpeed: 24 }
    ],
    stars: [
      { x: 239, y: 290 },
      { x: 150, y: 400 },
      { x: 328, y: 400 }
    ]
  },

  // --- LEVEL 20 ---
  {
    id: 20,
    theme: 'pink',
    platforms: [
      { x: 239, y: 280, width: 180, height: 28, type: 'blue' },
      { x: 239, y: 480, width: 180, height: 28, type: 'blue' },
      { x: 239, y: 680, width: 180, height: 28, type: 'blue' }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 239, y: 245, rotation: -90, launchAngle: 0, launchSpeed: 23 },
      { id: 'b2', type: 'bottle', color: 'yellow', x: 239, y: 445, rotation: 90, launchAngle: 180, launchSpeed: 23 },
      { id: 'b3', type: 'bottle', color: 'green', x: 239, y: 645, rotation: -90, launchAngle: 0, launchSpeed: 23 }
    ],
    stars: [
      { x: 70, y: 480 },
      { x: 408, y: 270 },
      { x: 408, y: 680 }
    ]
  },

  // --- LEVEL 21 ---
  {
    id: 21,
    theme: 'blue',
    platforms: [
      { x: 380, y: 680, width: 160, height: 34, type: 'wood' }
    ],
    portals: [
      { id: 'p1', pairId: 'p2', x: 100, y: 680, rotation: 0 },
      { id: 'p2', pairId: 'p1', x: 380, y: 440, rotation: 0 }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'yellow', x: 380, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 100, y: 320 },
      { x: 100, y: 440 },
      { x: 100, y: 560 }
    ]
  },

  // --- LEVEL 22 ---
  {
    id: 22,
    theme: 'blue',
    platforms: [
      { x: 239, y: 680, width: 150, height: 34, type: 'wood' }
    ],
    portals: [
      { id: 'p1', pairId: 'p2', x: 90, y: 240, rotation: 180 },
      { id: 'p2', pairId: 'p1', x: 388, y: 240, rotation: 0 },
      { id: 'p3', pairId: 'p4', x: 239, y: 440, rotation: 0 },
      { id: 'p4', pairId: 'p3', x: 388, y: 680, rotation: 0 }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'orange', x: 239, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 28 }
    ],
    stars: [
      { x: 90, y: 440 },
      { x: 388, y: 440 },
      { x: 388, y: 280 }
    ]
  },

  // --- LEVEL 23 ---
  {
    id: 23,
    theme: 'blue',
    platforms: [
      { x: 80, y: 680, width: 130, height: 34, type: 'wood' }
    ],
    portals: [
      { id: 'p1', pairId: 'p2', x: 80, y: 420 },
      { id: 'p2', pairId: 'p3', x: 270, y: 190 },
      { id: 'p3', pairId: 'p4', x: 270, y: 470 },
      { id: 'p4', pairId: 'p1', x: 90, y: 680 }
    ],
    launchers: [
      { id: 'b1', type: 'bottle', color: 'green', x: 80, y: 585, rotation: 0, launchAngle: -90, launchSpeed: 24 }
    ],
    stars: [
      { x: 270, y: 360 },
      { x: 270, y: 240 },
      { x: 80, y: 500 }
    ]
  },

  // --- LEVEL 24 ---
  {
    id: 24,
    theme: 'blue',
    platforms: [
      { x: 90, y: 680, width: 150, height: 34, type: 'wood' }
    ],
    portals: [
      { id: 'p1', pairId: 'p2', x: 50, y: 320, rotation: 90 },
      { id: 'p2', pairId: 'p1', x: 190, y: 660, rotation: 0 }
    ],
    launchers: [
      { id: 'c1', type: 'can', color: 'red', x: 90, y: 605, rotation: 0, launchAngle: 28, launchSpeed: 24 }
    ],
    stars: [
      { x: 140, y: 322 },
      { x: 245, y: 337 },
      { x: 350, y: 365 }
    ]
  }
];
