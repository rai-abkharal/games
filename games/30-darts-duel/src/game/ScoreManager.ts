import { Point, RINGS, SECTORS } from './Config';
export type HitType = 'MISS' | 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'BULL' | 'BULLSEYE';
export interface Hit { segment: number; multiplier: number; score: number; hitType: HitType }
export function scoreHit(p: Point): Hit {
  const r = Math.hypot(p.x, p.y);
  if (!Number.isFinite(r) || r > RINGS.doubleOut) return { segment: 0, multiplier: 0, score: 0, hitType: 'MISS' };
  if (r <= RINGS.bullseye) return { segment: 25, multiplier: 2, score: 50, hitType: 'BULLSEYE' };
  if (r <= RINGS.bull) return { segment: 25, multiplier: 1, score: 25, hitType: 'BULL' };
  const angle = (Math.atan2(p.x, -p.y) + Math.PI * 2 + Math.PI / 20) % (Math.PI * 2);
  const segment = SECTORS[Math.floor(angle / (Math.PI / 10)) % 20];
  const multiplier = r >= RINGS.doubleIn ? 2 : r >= RINGS.tripleIn && r <= RINGS.tripleOut ? 3 : 1;
  return { segment, multiplier, score: segment * multiplier, hitType: multiplier === 3 ? 'TRIPLE' : multiplier === 2 ? 'DOUBLE' : 'SINGLE' };
}
export function applyScore(remaining: number, hit: Hit) {
  const bust = hit.score > remaining;
  const next = bust ? remaining : remaining - hit.score;
  return { remaining: next, bust, won: next === 0 };
}
export function sectorPoint(segment: number, radius: number): Point {
  const i = SECTORS.indexOf(segment as typeof SECTORS[number]);
  const angle = i * Math.PI / 10;
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}
