import { describe, expect, it } from "vitest";
import { GAME_CACHE_RULES } from "../src/services/gameCacheRules";

describe("Cloudflare game cache rules", () => {
  it("restricts cache eligibility to canonical, pinned game bytes and preserves no-store", () => {
    const rule = GAME_CACHE_RULES[0];
    expect(rule.expression).toContain('http.host eq "games.raiabdullah.tech"');
    expect(rule.expression).toContain('"/api/offline-bundles/"');
    expect(rule.expression).toContain('not ends_with(http.request.uri.path, "/bundle.json")');
    expect(rule.expression).toContain('http.request.uri.query contains "b="');
    expect(rule.action_parameters.edge_ttl!.mode).toBe("bypass_by_default");
    expect(rule.action_parameters.edge_ttl!.status_code_ttl[0].value).toBe(-1);
    expect(rule.action_parameters).not.toHaveProperty("cache_key");
  });
  it("bypasses fresh APIs and Admin without overriding pinned asset eligibility", () => {
    const rule = GAME_CACHE_RULES[1];
    expect(rule.expression).toContain('"/api/"');
    expect(rule.expression).toContain('"/admin"');
    expect(rule.expression).toContain('and not (http.host');
    expect(rule.action_parameters.cache).toBe(false);
  });
});
