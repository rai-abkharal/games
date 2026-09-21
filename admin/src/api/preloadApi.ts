import { adminFetch as fetch } from "./adminClient";
import type { PreloadConfig } from "../types/admin";

export async function fetchPreloadConfig(): Promise<PreloadConfig | null> {
  const res = await fetch("/v1/admin/preload-config");
  if (!res.ok) return null;
  const data = await res.json();
  return data.config || null;
}

export async function savePreloadConfig(
  initialPreloadGameCount: number,
): Promise<void> {
  const res = await fetch("/v1/admin/preload-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initialPreloadGameCount: Number(initialPreloadGameCount) || 5,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.details || data.error || "Failed to save preload configuration",
    );
  }
}
