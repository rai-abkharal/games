# Admin security — Phase 1

The existing React Admin and Express API now use opaque cookie sessions and a
separate SQLite security store. Game catalogs remain JSON. Android, game lifecycle,
analytics collection, and advertisement scheduling are unchanged.

## Production setup

1. Use Node **24.9 or newer**. This implementation uses `node:sqlite`; Node 24.9
   emits an experimental SQLite warning. Pin and test the deployed Node release.
2. Back up the existing catalog, runtime catalog, thumbnails, and game bundles.
3. Install with `npm ci` in `backend` and `admin`; build both with `npm run build`.
4. Configure the variables in `backend/.env.example` in your service environment.
   Never commit real credentials. Production refuses missing HTTPS origins,
   persistent security storage, or reset-email configuration.
5. Give the service account exclusive access to a persistent directory, e.g.
   `/var/lib/swipe-play` (directory mode 0700; database/files mode 0600). Keep the
   database, SQLite WAL/SHM files, and staging directory outside the Git checkout,
   public assets, and network filesystems. On Windows apply equivalent ACLs.
6. Route `https://admin.example.com` and a **different hostname**, e.g.
   `https://preview.example.net`, to Express. Preserve the original Host header.
   Preview requests are routed to an asset-only subapplication: no Admin APIs.
   Do not configure Nginx/CDN to serve `/games` directly on the Admin hostname;
   Express redirects those requests to the unprivileged preview hostname.
7. Terminate TLS at the trusted proxy. Restrict direct backend access. Set
   `TRUST_PROXY` only to actual trusted proxy addresses; otherwise IP throttles
   can be defeated by forged forwarding headers. Set a 50 MiB upload limit and
   request timeouts at the proxy as well.
8. Run `npm run security:migrate` from `backend`. It creates the additive security
   schema and seeded roles; it does not import or modify the game catalog.
9. Run `npm run admin:bootstrap` from an interactive terminal. Enter username,
   email, and a 15–128-character password using the hidden prompt. It refuses if
   any account already exists. No default credentials or public registration exist.
10. Start `npm start`. Sign in, verify reset email delivery with your own test
    account, and confirm a Developer cannot publish or manage accounts.

The checked-in `deploy.sh` now requires security configuration, runs the security
migration, and fails an Admin build instead of silently deploying the old UI.
It remains an operator-privileged release script: OS/deployment access is not
restricted by application RBAC. Run one publishing API process on the host while
catalog publication still uses JSON. Do not run competing catalog deploy scripts
and Admin publication concurrently.

The app does not configure DNS, certificates, SMTP credentials, or production
accounts for you. Those values are deployment-specific. Reset SMTP connections
require TLS; tokens are never returned in API responses or printed to logs.

## Local HTTPS development

Generate a local certificate covering `localhost` and `127.0.0.1`, and trust it in
your development browser (for example with your existing local certificate tool).
Keep keys under ignored `.certs/` or outside the repository. Configure:

```text
ADMIN_ORIGIN=https://localhost:5173
PREVIEW_ORIGIN=https://127.0.0.1:5444
ADMIN_SECURITY_DB=<absolute private path>/admin.sqlite
ADMIN_TLS_KEY=<absolute path>/key.pem
ADMIN_TLS_CERT=<absolute path>/cert.pem
```

Run the backend on port 3000 and Vite on port 5173. Vite uses those TLS files and
proxies `/v1` and `/api/admin`; the backend also exposes the preview TLS listener
on 127.0.0.1:5444. The two hostnames intentionally differ because cookies are not
scoped by port. Secure cookies are never disabled for ordinary development.
SMTP is optional in development, but reset delivery failures are audited and
tokens are discarded. Tests inject an in-memory mail sink; they never send mail.

## Sessions and passwords

- Argon2id: 19 MiB memory, 2 iterations, parallelism 1; bounded concurrent hashing.
- 256-bit random session tokens. Only SHA-256 digests are persisted.
- `__Host-admin_session`: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain.
- 30-minute idle timeout and 12-hour absolute expiry, checked server-side.
- Login replaces the preceding session token. Logout deletes the server session.
- Password changes/resets, role/scope/account edits, and revoke-all invalidate
  affected sessions. Requests recheck account version/status after hashing or
  upload parsing. Revocation does not undo an operation already committed.
- Reset tokens are random, hashed, single-use, and expire after 20 minutes.
  A reset request does not revoke a valid session; successful reset does.
- Login errors are generic; account/IP limits persist across process restarts.
  Progressive retry delays start after five attempts. Trusted IP request limits
  also protect pre-authentication session creation and reset endpoints.
- Security changes require password confirmation within five minutes. Login
  counts as initial confirmation. MFA is not implemented in this phase.
- CSRF tokens are derived from the random opaque session token, bound to its
  server record, and returned only to same-origin JavaScript. No auth credentials
  are stored in browser localStorage.

## Authorization and API contract

Both `/v1/admin` and `/api/admin` share the same security boundary. Only exact
GET `/auth/csrf` and POST `/auth/login`, `/auth/reset-request`, `/auth/reset` are
pre-authentication routes. New routes are private by default. The legacy game
router additionally requires a matching entry in `security/gamePolicy.ts`.

Every mutation requires `Origin: <ADMIN_ORIGIN>` and `X-CSRF-Token`. Direct API
clients must first GET `/auth/csrf`, retain its cookie, POST login with that token,
then use the replacement cookie and CSRF token from the login response. There is
no CORS-based bypass and no alternate bearer-token mode.

Super Admin has all registered permissions and a protected permission set.
Developer starts with `games.read`, `games.upload`, `games.update` and explicit
game scopes. Creating a new staged game grants its uploader that game scope;
colliding with an existing game requires update permission and scope. `*` scope
means all games. Role and account editors are permission-protected, including
field-level role/scope/disable checks. At least one active Super Admin must remain.
Only known backend permission keys can be assigned. Future users/settings/
analytics permission keys do not create those systems or APIs.

Typical responses: 401 missing/expired session, 403 denied permission/scope/CSRF,
400 invalid input, 409 conflicting identity/version/last-Super-Admin operation,
413 oversized upload, 429 throttled request. Unknown routes do not execute.

## Uploads and previews

Uploads now return HTTP 201 with `staged: true`, `uploadId`, and validation report.
They do **not** publish automatically, including Super Admin uploads. Use the
Staged uploads strip to preview and publish. Publication requires games.publish
and the game's scope; replacing an existing game also requires games.update.
Use a new semantic version: overwriting an existing version returns 409.

Private staged ZIPs are outside public assets. Limits: 50 MiB compressed,
200 MiB declared expanded size, 2,000 entries, 50 MiB per entry, bounded compression
ratio. There are at most 20 pending uploads per account and 200 globally, with
10 uploads per hour per account. Scoped developers can discard pending uploads.
IDs, versions, archive paths, and extracted destinations are validated.
Retained prior releases prevent an upload from deleting the current game.
Catalog writes use atomic replacement. The catalog and files still are not one
database transaction; failed publication is audited and incomplete new release
directories are removed before catalog commit. Backups remain necessary.

Admin mutations no longer rewrite the unused `frontend/assets/catalog` seed.
Existing deployment scripts retain their own seed-generation behavior.

Preview iframes use a distinct hostname and `sandbox="allow-scripts allow-same-origin"`.
No forms, popups, or top navigation are granted. The preview adapter handles
pause/resume/mute/restart without parent-side JavaScript access. Incoming messages
must come from the expected iframe and origin; they only update simulator display.
The adapter is served with previews, not added to deployed game source. Some
game-specific hint/restart functions may be unsupported by a game; they are not
replaced with new gameplay behavior. Storage reset affects the preview origin.

Staged preview grants expire after five minutes, confer access only to that upload,
and are hashed in storage. They are not Admin session tokens. Configure proxy/CDN
access-log redaction for `/staged/*` URLs and do not cache staged responses.

## Audit, backup, and recovery

Audit records capture actor, action, target, timestamp, IP, request ID, and outcome.
No request bodies, passwords, session tokens, reset tokens, or uploaded code are
logged. Security-data mutations are transactionally audited. Game mutations use
started/succeeded/failed records, since filesystem operations cannot share the
SQLite transaction. Logs have no edit/delete API; OS-level administrators can
still alter local storage. Review delivery failures and failed authentication.

Use SQLite's online backup API or stop the service before copying the database;
do not copy only the main file while WAL writes are active. Back up game assets,
catalog and staging alongside the security database. Verify restoration before
production rollout. A restored backup can resurrect old sessions: delete sessions,
reset tokens, and preview grants during an offline recovery before starting.
Keep a second Super Admin account and tested reset-email delivery for recovery.
The bootstrap command intentionally is not an account-overwrite recovery bypass.

## Verification

```text
backend: npm test
backend: npm run build
admin:   npm run build
backend: npm audit
```

Security tests use disposable databases/catalogs/assets and direct HTTP requests.
Browser verification should include sign-in/out, account controls, Developer UI,
cross-origin preview access, and pause/resume. Production SMTP and proxy/certificate
configuration require a deployment smoke test; passing local tests does not verify
external service configuration.
