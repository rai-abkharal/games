// Coordinates in the 120 x 105 PNG box. Rotate around the palm, not the tip.
export const PALM = { x: 96, y: 48 };
export const TIP = { x: 6, y: 61 };
export const SWIPE_TIMES = Array.from({ length: 97 }, (_, i) => i / 96);
const smooth = (t: number) => t * t * (3 - 2 * t);
export function swipePose(time: number) {
  const stroke =
    time < 0.12
      ? 0
      : time < 0.43
      ? smooth((time - 0.12) / 0.31)
      : time < 0.72
      ? 1
      : time < 0.94
      ? 1 - smooth((time - 0.72) / 0.22)
      : 0;
  const angle = -24 + 62 * stroke;
  const radians = (angle * Math.PI) / 180;
  const dx = TIP.x - PALM.x;
  const dy = TIP.y - PALM.y;
  return {
    angle,
    x: 146 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: 68 + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}
export const SWIPE_POSES = SWIPE_TIMES.map(swipePose);
