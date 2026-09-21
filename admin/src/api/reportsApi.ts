import { adminFetch as fetch } from "./adminClient";

export async function fetchReports(): Promise<any[]> {
  const res = await fetch("/v1/admin/reports");
  if (!res.ok) return [];
  const data = await res.json();
  return data.reports || [];
}
