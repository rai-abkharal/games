/**
 * Pure planning rules for the game feed. They decide which page owns a live
 * WebView and which games are worth holding in memory, mirroring what the
 * native ViewPager2 setup does implicitly (offscreenPageLimit = 1 keeps one
 * page on each side alive; GameCacheManager pre-downloads the next game).
 *
 * Slots:
 *  - active  – the page on screen; loads immediately and runs at full speed.
 *  - ahead   – the page in the direction of travel; gets a WebView once the
 *              active game is ready, loads, and is frozen after its first frames.
 *  - behind  – the page the player just left; keeps its WebView (frozen) if it
 *              already has one so swiping back is instant, but never starts a
 *              fresh load.
 *  - far     – no WebView. Nearby far pages may have their HTML prefetched.
 */
export type PageSlot = 'active' | 'ahead' | 'behind' | 'far';
export type SwipeDirection = 1 | -1;

export function slotFor(index: number, current: number, direction: SwipeDirection): PageSlot {
  if (index === current) return 'active';
  if (index === current + direction) return 'ahead';
  if (index === current - direction) return 'behind';
  return 'far';
}

/** True for slots that may own a WebView. */
export function isLiveSlot(slot: PageSlot): boolean {
  return slot !== 'far';
}

/**
 * Indices whose HTML should be fetched into memory, nearest first: the games
 * beyond the warm ("ahead") page in the direction of travel.
 */
export function prefetchOrder(current: number, direction: SwipeDirection, count: number, ahead: number): number[] {
  const out: number[] = [];
  for (let step = 2; step < 2 + ahead; step++) {
    const index = current + direction * step;
    if (index >= 0 && index < count) out.push(index);
  }
  return out;
}

/**
 * Everything worth keeping around: the three live slots plus the prefetch
 * targets. Anything else can be evicted from memory.
 */
export function retainWindow(current: number, direction: SwipeDirection, count: number, ahead: number): number[] {
  const keep = new Set<number>();
  for (const index of [current - 1, current, current + 1]) {
    if (index >= 0 && index < count) keep.add(index);
  }
  for (const index of prefetchOrder(current, direction, count, ahead)) keep.add(index);
  return Array.from(keep).sort((a, b) => a - b);
}

/** Only pages this close to the current one render placeholder chrome. */
export function isNear(index: number, current: number, radius = 2): boolean {
  return Math.abs(index - current) <= radius;
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}
