import { adminFetch as fetch } from "./adminClient";

export async function fetchAnalyticsSummary(
  range: "today" | "7d" | "30d" | "all" = "all",
): Promise<any> {
  const res = await fetch(`/v1/admin/analytics/summary?range=${range}`);
  if (!res.ok) throw new Error(`Analytics request failed (HTTP ${res.status}).`);
  return res.json();
}

export async function sendGa4TestEvent(eventPayload: object): Promise<any> {
  const res = await fetch("/v1/admin/analytics/test-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventPayload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to dispatch GA4 test event");
  }
  return res.json();
}
