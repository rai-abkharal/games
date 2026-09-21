import { adminFetch as fetch } from "./adminClient";
import type { TouchZone } from "../types/admin";

export async function saveGameTouchZones(
  gameId: string,
  touchZones: TouchZone[],
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/touch-zones`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ touchZones }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update touch zones");
  }
}
