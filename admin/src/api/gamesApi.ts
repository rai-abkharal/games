import { adminFetch as fetch } from "./adminClient";
import type { GameItem, ValidationReport } from "../types/admin";

export async function fetchGames(): Promise<GameItem[]> {
  const res = await fetch("/v1/admin/games");
  if (!res.ok) throw new Error("Failed to fetch games catalog");
  const data = await res.json();
  return data.games || [];
}

export async function updateGameTitle(
  gameId: string,
  titleOverride: string | null,
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/title`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleOverride }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update game title");
  }
}

export async function updateGameStatus(
  gameId: string,
  status: "published" | "draft" | "archived",
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/publish`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update game status");
  }
}

export async function updateRollout(
  gameId: string,
  versionId: string,
  rolloutPercent: number,
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/publish`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId, rolloutPercent }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update rollout percentage");
  }
}

export async function updateGameFeatures(
  gameId: string,
  features: { sound?: boolean; vibration?: boolean; hint?: boolean },
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/features`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update game features");
  }
}

export async function deleteGame(gameId: string): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete game");
  }
}

export async function fetchValidationReport(
  gameId: string,
): Promise<ValidationReport | null> {
  const res = await fetch(`/v1/admin/games/${gameId}/validation`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.report || null;
}

export async function downloadGameZip(
  gameId: string,
  fallbackTitle: string,
): Promise<void> {
  const res = await fetch(`/v1/admin/games/${gameId}/download`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to download game code package");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${gameId}-v${fallbackTitle}.zip`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function uploadGamePackage(
  formData: FormData,
  targetGameId?: string | null,
): Promise<any> {
  const endpoint = targetGameId
    ? `/v1/admin/games/${targetGameId}/upload`
    : `/v1/admin/games/upload`;
  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });
  return res.json();
}
