/**
 * Pure planning rules for the game feed. They decide which page owns a live
 * WebView and which games are worth holding in memory, mirroring what the
 * native ViewPager2 setup does implicitly (offscreenPageLimit = 1 keeps one
 * page on each side alive; GameCacheManager pre-downloads the next game).
 *
 * Slots:
 *  - active  – the page on screen; loads immediately and runs at full speed.
 *  - ahead   - the next page; retains a visited view, otherwise a placeholder.
 *  - behind  – the page the player just left; keeps its WebView (frozen) if it
 *              already has one so swiping back is instant, but never starts a
 *              fresh load.
 *  - leaving – a page the pager is sliding out of the window: frozen, keeps
 *              what it has, and is only torn down once the pager rests
 *              (never during the snap animation). Assigned by the feed, not
 *              by slotFor.
 *  - far     – no WebView. Nearby far pages may have their HTML prefetched.
 *
 * Lifecycle: placeholder -> active (loads/runs) -> neighbor (retained/frozen)
 * -> far (WebView destroyed). Cold offscreen engines are never initialized.
 */
export type PageSlot = 'active' | 'ahead' | 'behind' | 'leaving' | 'far';
export type SwipeDirection = 1 | -1;

export function slotFor(index: number, current: number, direction: SwipeDirection, count?: number): PageSlot {
  if (count !== undefined && count > 1) {
    const normIndex = ((index % count) + count) % count;
    const normCurrent = ((current % count) + count) % count;
    if (normIndex === normCurrent) return 'active';
    const ahead = ((normCurrent + direction) % count + count) % count;
    if (normIndex === ahead) return 'ahead';
    const behind = ((normCurrent - direction) % count + count) % count;
    if (normIndex === behind) return 'behind';
    return 'far';
  }
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
 * Indices worth downloading next, nearest first, starting with the immediate
 * neighbour. The page on screen is deliberately never included: it is already
 * rendering, and its own bundle is queued ahead of this window by the feed.
 */
export function prefetchOrder(current: number, direction: SwipeDirection, count: number, ahead: number, loop = false): number[] {
  const out: number[] = [];
  if (count <= 1) return out;
  for (let step = 1; step <= ahead; step++) {
    if (loop) {
      if (step >= count) break;
      const index = ((current + direction * step) % count + count) % count;
      if (!out.includes(index)) out.push(index);
    } else {
      const index = current + direction * step;
      if (index >= 0 && index < count) out.push(index);
    }
  }
  return out;
}

/** Only pages this close to the current one render placeholder chrome. */
export function isNear(index: number, current: number, radius = 2): boolean {
  return Math.abs(index - current) <= radius;
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}
