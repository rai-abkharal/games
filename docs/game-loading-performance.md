# Performance-safe game loading

Only `react-apk` and the canonical `https://games.raiabdullah.tech` backend are changed. The separate root Android app is not involved.

## Runtime flow

After a game is ready and the feed rests for 1.5 seconds, the existing single native worker prepares the next game's HTML, direct scripts/styles, static module dependencies, and declared first-screen assets. It does not create a WebView or execute a game engine. Limits: one nearest game, 24 files, 6 MiB, 512 KiB/s during Wi-Fi gameplay, 256 KiB/s on cellular. Other downloads are limited to 192/128 KiB/s during play. Wi-Fi transfers can use full speed when gameplay is idle.

The selected WebView reads verified startup files from staging immediately. Missing files still stream on demand, independently of the ZIP. Foreground network requests interrupt background transfers and keep them paused until requests finish plus a 500 ms quiet period. Partial downloads are retained for HTTP Range resumption. No speculative work runs offline, while the feed is suspended, or during its initial remote load. Existing warming for already-downloaded games remains.

The full ZIP is downloaded, hash-verified, extracted with bounded buffers (1 MiB/s disk-write cap during play), and checked against every manifest path, size and SHA-256. Only then is the directory atomically activated in permanent app storage. Unsupported/corrupt ZIPs fall back to the existing verified file downloader. ZIP path traversal, duplicates, unexpected files and oversized entries are rejected. Existing running builds are pinned for the app session so activating an update cannot remove their assets mid-game. If the bounded startup set happens to contain every manifest file, it can activate directly without downloading a redundant ZIP.

## Deployment

1. Deploy the backend and run `npm run bundles` in `backend` before serving the new APK. The existing deployment script already runs it. This generates ZIPs and frozen copies outside the mutable games tree, in `backend/public/.offline-bundles/`. Keep that directory on persistent storage across releases; do not remove it during deployment. Old snapshot URLs keep their old bytes after a same-version force deploy.
2. Build/install the new `react-apk` APK/AAB. The app remains version 1.0.1 / code 2. An old backend still works via the existing per-file path; startup metadata and ZIP acceleration require the new backend.
3. Review `npm run cache:configure` (dry run) in `backend`. To apply, provide `CLOUDFLARE_ZONE_ID` and a scoped `CLOUDFLARE_API_TOKEN` securely in the server environment, then run `npm run cache:configure -- --apply`. Never commit or paste tokens into source code. The token needs zone read/settings read and Cache Rules read/edit for this zone. Standard caching must retain query strings. The script never replaces unrelated rules, purges the whole zone, or changes DNS. Custom cache keys require manual review.

Cache eligibility follows origin headers: only frozen `?b=<buildId>` assets and ZIPs get `public, max-age=2592000, immutable, no-transform`. Mutable/plain URLs, manifests, catalogue/version APIs and Admin are bypassed. Errors are not cached. HTML/JSON need a Cache Rule; they are not normally cached by default. See [Cloudflare default behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/) and [Cache Rule settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/).

Publishing changed game code produces a new build id and a different cache URL immediately; it does not wait a month. Existing installations keep their last verified build until the replacement completes.

## Game-specific startup work

Optional `startup-assets.json` beside a game's entry contains a JSON array of relative paths needed for its actual first screen, for example `["assets/title.webp", "levels/level-1.json"]`. It is build-time metadata, not downloaded game content. External URLs, lazy imports and unlisted files are not chased. Nothing converts images/audio or changes game loaders automatically; loading fewer levels/sounds must be checked game by game to preserve behavior.

## Verify before a production rollout

Measure a clean-install APK on the same device/network before and after: swipe-to-ready median/p95, current-game frame times, background bytes, ZIP completion time, memory and offline reopen. Confirm logs show `Startup prepared`, and foreground requests pause the queue. Cold CDN requests may be MISS; repeat the same pinned asset and look for HIT. Confirm updated catalogue/build checks stay fresh and new build URLs differ. Close the app, disable internet and test a fully activated server game. No runtime performance improvement is claimed without these device measurements.
