// Safe eligibility only. Origin headers decide whether bytes are frozen and
// cacheable; never override no-store on errors, manifests, or unprepared builds.
export const PINNED_GAME_EXPRESSION = '(http.host eq "games.raiabdullah.tech" and starts_with(http.request.uri.path, "/api/offline-bundles/") and not ends_with(http.request.uri.path, "/bundle.json") and http.request.uri.query contains "b=" and http.request.method in {"GET" "HEAD"})';

export const GAME_CACHE_RULES = [
  {
    ref: "swipeplay_immutable_game_assets_v1",
    description: "SwipePlay: immutable build-pinned game assets (origin TTL)",
    expression: PINNED_GAME_EXPRESSION,
    action: "set_cache_settings",
    enabled: true,
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: "bypass_by_default",
        status_code_ttl: [{ status_code_range: { from: 300, to: 599 }, value: -1 }],
      },
      browser_ttl: { mode: "respect_origin" },
    },
  },
  {
    ref: "swipeplay_fresh_api_and_admin_v1",
    description: "SwipePlay: keep catalogue, versions, metadata and Admin fresh",
    expression: `(http.host eq "games.raiabdullah.tech" and (starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/v1/") or starts_with(http.request.uri.path, "/admin")) and not ${PINNED_GAME_EXPRESSION})`,
    action: "set_cache_settings",
    enabled: true,
    action_parameters: { cache: false },
  },
];
