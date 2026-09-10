import type { TouchZone } from '../types/game';

/**
 * Pure gesture rules for the vertical game pager. They reproduce the parts
 * of ViewPager2/RecyclerView that matter to a game underneath:
 *
 *  - a drag only becomes a page swipe once it exceeds the slop *and* is more
 *    vertical than horizontal (RecyclerView's dominant-axis rule), so games
 *    that drag sideways keep their gesture;
 *  - a touch that starts inside one of the game's `touchZones` never becomes
 *    a swipe — the equivalent of GameFeedAdapter calling
 *    requestDisallowInterceptTouchEvent(true) for blocked zones;
 *  - the page changes on a fling or once the drag passes a fraction of the
 *    page height, one page per gesture, otherwise it snaps back.
 */

export function pointInZones(nx: number, ny: number, zones: readonly TouchZone[] | undefined | null): boolean {
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

export interface ClaimInput {
  dx: number;
  dy: number;
  slopPx: number;
  enabled: boolean;
  startedInZone: boolean;
}

/** Should the pager take the gesture away from the game? */
export function shouldClaimSwipe({ dx, dy, slopPx, enabled, startedInZone }: ClaimInput): boolean {
  if (!enabled || startedInZone) return false;
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
}

/**
 * Visual offset for a drag of `dy` pixels: at most one page in either
 * direction, with resistance past the first/last page.
 */
export function dragOffset({ dy, current, count, pageHeight, resistance, maxOverscroll }: DragInput): number {
  if (pageHeight <= 0 || count <= 0) return 0;
  const atStart = current <= 0 && dy > 0;
  const atEnd = current >= count - 1 && dy < 0;
  if (atStart || atEnd) {
    const eased = dy * resistance;
    return Math.max(-maxOverscroll, Math.min(maxOverscroll, eased));
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
}

/** Which page the pager should settle on after the finger lifts. */
export function resolveTarget({ dy, vy, current, count, pageHeight, thresholdRatio, flingVelocity }: SettleInput): number {
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
  return Math.min(count - 1, Math.max(0, target));
}
