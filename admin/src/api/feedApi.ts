import { adminFetch as fetch } from "./adminClient";

export async function saveFeedOrder(
  order: { id: string; sortWeight: number }[],
): Promise<void> {
  const res = await fetch("/v1/admin/feed/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update feed order");
  }
}
