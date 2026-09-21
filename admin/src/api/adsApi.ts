import { adminFetch as fetch } from "./adminClient";
import type { AdsConfig } from "../types/admin";

export async function fetchAdsConfig(): Promise<AdsConfig | null> {
  const res = await fetch("/v1/admin/ads-config");
  if (!res.ok) return null;
  const data = await res.json();
  return data.config || null;
}

export async function saveAdsConfig(config: AdsConfig): Promise<void> {
  const res = await fetch("/v1/admin/ads-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to save ads configuration");
  }
}

export async function saveGameAds(
  gameId: string,
  ads: {
    enabled?: boolean;
    useCustomInterval?: boolean;
    intervalMinutes?: number;
  },
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/ads`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ads }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update game ads configuration");
  }
}
