/** Dry-run by default. Uses only an operator-provided scoped Cloudflare token. */
import { GAME_CACHE_RULES } from "../src/services/gameCacheRules";

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ rules: GAME_CACHE_RULES }, null, 2));
    console.log("Dry run only. No Cloudflare settings changed.");
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zone || !/^[a-f0-9]{32}$/.test(zone)) {
    throw new Error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID securely in the server environment.");
  }
  const api = async (resource: string, method = "GET", body?: unknown): Promise<any> => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/${resource}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json() as any;
    if (!response.ok || !payload.success) {
      if (response.status === 404 && method === "GET") return null;
      throw new Error(`Cloudflare ${method} ${resource}: HTTP ${response.status} (${payload.errors?.map((error: any) => error.code).join(",") || "request failed"})`);
    }
    return payload.result;
  };
  const zoneInfo = await api("");
  if (!zoneInfo || (zoneInfo.name !== "raiabdullah.tech" && zoneInfo.name !== "games.raiabdullah.tech")) {
    throw new Error("The zone must belong to raiabdullah.tech; no settings changed.");
  }
  const level = await api("settings/cache_level");
  if (level?.value !== "aggressive") {
    throw new Error("Use Standard caching (include query strings) before applying. The b= build id must never be ignored; no settings changed.");
  }
  let ruleset = await api("rulesets/phases/http_request_cache_settings/entrypoint");
  if (!ruleset) {
    await api("rulesets", "POST", { name: "Game asset cache", kind: "zone", phase: "http_request_cache_settings", rules: GAME_CACHE_RULES });
  } else {
    const existing = ruleset.rules || [];
    const owned = new Set(GAME_CACHE_RULES.map(rule => rule.ref));
    // A later rule could override query keys or cache fresh metadata. Don't
    // silently rewrite/reorder unrelated operator settings.
    const firstOwned = existing.findIndex((rule: any) => owned.has(rule.ref));
    if (firstOwned >= 0 && existing.slice(firstOwned).some((rule: any) => !owned.has(rule.ref))) {
      throw new Error("Move the two SwipePlay rules after broader rules in the dashboard before reapplying; no settings changed.");
    }
    if (existing.some((rule: any) => rule.enabled !== false && rule.action_parameters?.cache_key?.custom_key)) {
      throw new Error("Existing custom cache keys require a manual review: confirm they retain b= before applying; no settings changed.");
    }
    for (const rule of GAME_CACHE_RULES) {
      const previous = existing.find((candidate: any) => candidate.ref === rule.ref);
      if (previous) await api(`rulesets/${ruleset.id}/rules/${previous.id}`, "PATCH", rule);
      else await api(`rulesets/${ruleset.id}/rules`, "POST", rule);
    }
  }
  console.log("Cloudflare game cache rules applied. Existing unrelated rules were preserved. Verify pinned assets report MISS then HIT after deployment.");
}

void main().catch(error => { console.error(error.message); process.exitCode = 1; });
