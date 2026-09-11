import type { TouchZone } from '../types/game';

/**
 * Pure gesture rules for the vertical game pager. They reproduce the parts
 * of ViewPager2/RecyclerView that matter to a game underneath:
 *
 *  - a drag only becomes a page swipe once it exceeds the slop *and* is more
 *    vertical than horizontal (RecyclerView's dominant-axis rule), so games
 *    that drag sideways keep their gesture;
 *  - the axis is decided once per touch: a drag that first leaves the slop
 *    horizontally belongs to the game until the finger lifts, even if it
 *    later drifts vertically (sliders, dragged pieces);
 *  - a touch that starts inside one of the game's `touchZones` never becomes
 *    a swipe — the equivalent of GameFeedAdapter calling
 *    requestDisallowInterceptTouchEvent(true) for blocked zones;
 *  - the page changes on a fling or once the drag passes a fraction of the
 *    page height, one page per gesture, otherwise it snaps back.
 */

export function pointInZones(nx: number, ny: number, zones: readonly TouchZone[] | undefined | null): boolean {
  'worklet';
  if (!zones || zones.length === 0) return false;
  for (const zone of zones) {
    const x = Number(zone.x) || 0;
    const y = Number(zone.y) || 0;
    const w = Number(zone.width) || 0;
    const h = Number(zone.height) || 0;
    if (nx >= x && nx <= x + w && ny >= y && ny <= y + h) return true;
  }
  return false;
}

export type DragAxis = 'none' | 'horizontal' | 'vertical';

/**
 * The axis a touch commits to the first time it leaves the slop square;
 * 'none' while it is still a tap or a jitter. Ties go to the game.
 */
export function dragAxis(dx: number, dy: number, slopPx: number): DragAxis {
  'worklet';
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < slopPx && ady < slopPx) return 'none';
  return ady > adx ? 'vertical' : 'horizontal';
}

export interface ClaimInput {
  dx: number;
  dy: number;
  slopPx: number;
  enabled: boolean;
  startedInZone: boolean;
  /** The current touch already committed to a horizontal (game) drag. */
  gameOwnsTouch?: boolean;
}

/** Should the pager take the gesture away from the game? */
export function shouldClaimSwipe({ dx, dy, slopPx, enabled, startedInZone, gameOwnsTouch = false }: ClaimInput): boolean {
  'worklet';
  if (!enabled || startedInZone || gameOwnsTouch) return false;
  const ady = Math.abs(dy);
  return ady >= slopPx && ady > Math.abs(dx);
}

export interface DragInput {
  dy: number;
  current: number;
  count: number;
  pageHeight: number;
  resistance: number;
  maxOverscroll: number;
  loop?: boolean;
}

/**
 * Visual offset for a drag of `dy` pixels: at most one page in either
 * direction, with resistance past the first/last page (unless loop is true).
 */
export function dragOffset({ dy, current, count, pageHeight, resistance, maxOverscroll, loop = false }: DragInput): number {
  'worklet';
  if (pageHeight <= 0 || count <= 0) return 0;
  if (!loop || count <= 1) {
    const atStart = current <= 0 && dy > 0;
    const atEnd = current >= count - 1 && dy < 0;
    if (atStart || atEnd) {
      const eased = dy * resistance;
      return Math.max(-maxOverscroll, Math.min(maxOverscroll, eased));
    }
  }
  return Math.max(-pageHeight, Math.min(pageHeight, dy));
}

export interface SettleInput {
  dy: number;
  /** Velocity in px/ms; negative when the finger moves up (towards the next page). */
  vy: number;
  current: number;
  count: number;
  pageHeight: number;
  thresholdRatio: number;
  flingVelocity: number;
  loop?: boolean;
}

/** Which page the pager should settle on after the finger lifts. */
export function resolveTarget({ dy, vy, current, count, pageHeight, thresholdRatio, flingVelocity, loop = false }: SettleInput): number {
  'worklet';
  if (count <= 1 || pageHeight <= 0) return current;
  const isSignificantDrag = Math.abs(dy) >= pageHeight * 0.05;
  const dragDir = isSignificantDrag ? (dy < 0 ? 1 : -1) : 0;
  const flingDir = vy < 0 ? 1 : vy > 0 ? -1 : 0;
  let target = current;
  if (Math.abs(vy) >= flingVelocity && flingDir !== 0 && (dragDir === 0 || flingDir === dragDir)) {
    target = current + flingDir;
  } else if (Math.abs(dy) >= pageHeight * thresholdRatio) {
    target = current + (dy < 0 ? 1 : -1);
  }
  if (loop) {
    return target;
  }
  return Math.min(count - 1, Math.max(0, target));
}

export interface SettleDurationInput {
  /** Pixels the track still has to travel. */
  distance: number;
  /** Finger speed at release (px/ms) along the direction of travel; negative when moving away. */
  velocity: number;
  pageHeight: number;
  /** Duration of a full-page snap without a fling. */
  baseMs: number;
  minMs: number;
}

/**
 * Snap duration. The snap is an ease-out cubic, whose starting speed is
 * 3 × distance / duration: a release faster than the default snap shortens
 * it so the pages carry on at the finger's speed instead of braking (the
 * continuity ViewPager2's scroller has), and shorter distances snap
 * proportionally faster so a small snap-back never crawls.
 */
export function settleDuration({ distance, velocity, pageHeight, baseMs, minMs }: SettleDurationInput): number {
  'worklet';
  const remaining = Math.abs(distance);
  if (remaining < 1 || pageHeight <= 0) return 0;
  const byDistance = baseMs * Math.min(1, Math.max(0.55, Math.sqrt(remaining / pageHeight)));
  const byVelocity = velocity > 0 ? (3 * remaining) / velocity : Number.POSITIVE_INFINITY;
  return Math.round(Math.max(minMs, Math.min(byDistance, byVelocity)));
}
