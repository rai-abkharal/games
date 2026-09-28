import { useEffect, useState } from 'react';

const HOME_SWIPE_HINT_DELAY_MS = 10_000;

/** Count only time on a ready, visible, active game; never time spent loading. */
export function useHomeSwipeHint(gameId: string | null, eligible: boolean): boolean {
  const [visibleGameId, setVisibleGameId] = useState<string | null>(null);

  useEffect(() => {
    setVisibleGameId(null);
    if (!eligible || !gameId) return;
    const timer = setTimeout(() => setVisibleGameId(gameId), HOME_SWIPE_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gameId, eligible]);

  return eligible && gameId !== null && visibleGameId === gameId;
}
