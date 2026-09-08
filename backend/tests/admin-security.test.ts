import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { createApp } from "../src/app";
import { SecurityStore, digest } from "../src/security/store";
import { hashPassword } from "../src/security/passwords";
import { SecurityConfig } from "../src/security/config";
const origin = "https://admin.example.test";
const password = "A long testing password 937!";
let store: SecurityStore,
  app: ReturnType<typeof createApp>,
  directory: string,
  config: SecurityConfig,
  superId: string,
  devId: string,
  resetLink = "";
type Client = { cookie: string; csrf: string };
const cookieFrom = (res: any) => res.headers["set-cookie"][0].split(";")[0];
async function login(identifier = "root"): Promise<Client> {
  const pre = await request(app).get("/v1/admin/auth/csrf");
  const res = await request(app)
    .post("/v1/admin/auth/login")
    .set("Origin", origin)
    .set("Cookie", cookieFrom(pre))
    .set("X-CSRF-Token", pre.body.csrfToken)
    .send({ identifier, password });
  expect(res.status, res.text).toBe(200);
  return { cookie: cookieFrom(res), csrf: res.body.csrfToken };
}
function call(client: Client, method: string, url: string, body?: unknown) {
  const r = (request(app) as any)
    [method](url)
    .set("Origin", origin)
    .set("Cookie", client.cookie)
    .set("X-CSRF-Token", client.csrf);
  return body === undefined ? r : r.send(body);
}
function zip(id = "new-game", version = "1.0.0") {
  const z = new AdmZip();
  z.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify({ id, title: "Game", version })),
  );
  z.addFile(
    "index.html",
    Buffer.from(
      "<!doctype html><html><head></head><body>Test game</body></html>",
    ),
  );
  return z.toBuffer();
}
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "admin-security-"));
  config = {
    origin,
    previewOrigin: "https://preview.example.test",
    database: path.join(directory, "security.sqlite"),
    staging: path.join(directory, "staging"),
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 60 * 60_000,
    secure: true,
    deliverReset: async (_email, link) => {
      resetLink = link;
    },
  };
  store = new SecurityStore(config.database);
  const hash = await hashPassword(password);
  superId = store.create(
    {
      username: "root",
      email: "root@example.test",
      role: "super-admin",
      scopes: ["*"],
    },
    hash,
  ).id;
  devId = store.create(
    {
      username: "developer",
      email: "dev@example.test",
      role: "developer",
      scopes: ["owned-game"],
    },
    hash,
  ).id;
  const catalog = path.join(directory, "games.json");
  fs.writeFileSync(
    catalog,
    JSON.stringify({
      version: 1,
      games: [
        {
          id: "owned-game",
          title: "Owned",
          version: "1.0.0",
          entryUrl: "http://localhost:8080/games/owned-game/1.0.0/index.html",
          thumbnailUrl: "http://localhost:8080/thumbnails/test.png",
          manifestUrl:
            "http://localhost:8080/games/owned-game/1.0.0/manifest.json",
          sizeBytes: 100,
          feedOrder: 1,
        },
        {
          id: "other-game",
          title: "Other",
          version: "1.0.0",
          entryUrl: "http://localhost:8080/games/other-game/1.0.0/index.html",
          thumbnailUrl: "http://localhost:8080/thumbnails/test.png",
          manifestUrl:
            "http://localhost:8080/games/other-game/1.0.0/manifest.json",
          sizeBytes: 100,
          feedOrder: 2,
        },
      ],
    }),
  );
  app = createApp(catalog, "https://games.example.test", {
    store,
    config,
    publicDir: path.join(directory, "public"),
  });
  resetLink = "";
});
afterEach(() => {
  store.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
describe("Admin security boundaries", () => {
  it("keeps one Super Admin active under competing disable requests", async () => {
    const root = await login();
    const created = await call(root, "post", "/v1/admin/admins", {
      username: "second-root",
      email: "second@example.test",
      password,
      role: "super-admin",
      scopes: ["*"],
    });
    const second = await login("second-root");
    const responses = await Promise.all([
      call(root, "patch", `/v1/admin/admins/${created.body.account.id}`, {
        active: false,
      }),
      call(second, "patch", `/v1/admin/admins/${superId}`, { active: false }),
    ]);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      store.get(
        "SELECT count(*) AS count FROM accounts WHERE role='super-admin' AND active=1",
      )!.count,
    ).toBe(1);
  });
  it("strips unauthorized configuration from Developer packages and permits scoped discard", async () => {
    const dev = await login("developer"),
      z = new AdmZip(zip("owned-game", "1.0.1"));
    z.updateFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify({
          id: "owned-game",
          title: "Owned",
          version: "1.0.1",
          features: { hint: true },
          touchZones: [{ x: 0, y: 0, width: 1, height: 1 }],
        }),
      ),
    );
    const uploaded = await call(
      dev,
      "post",
      "/v1/admin/games/owned-game/upload",
    ).attach("file", z.toBuffer(), "game.zip");
    expect(uploaded.status).toBe(201);
    const staged = store.get(
      "SELECT * FROM uploads WHERE id=?",
      uploaded.body.uploadId,
    )!;
    const manifest = JSON.parse(
      new AdmZip(fs.readFileSync(staged.filename)).readAsText("manifest.json"),
    );
    expect(manifest.features).toBeUndefined();
    expect(manifest.touchZones).toBeUndefined();
    expect(
      (await call(dev, "delete", `/v1/admin/uploads/${staged.id}`)).status,
    ).toBe(200);
    expect(fs.existsSync(staged.filename)).toBe(false);
  });
  it("rejects multipart extras and oversized archives before storing uploads", async () => {
    const root = await login();
    expect(
      (
        await call(root, "post", "/v1/admin/games/upload")
          .field("publish", "true")
          .attach("file", zip(), "game.zip")
      ).status,
    ).toBe(400);
    expect(
      (
        await call(root, "post", "/v1/admin/games/upload").attach(
          "file",
          Buffer.alloc(50 * 1024 * 1024 + 1),
          "large.zip",
        )
      ).status,
    ).toBe(413);
    expect(store.all("SELECT * FROM uploads")).toHaveLength(0);
  });
  it("denies routes accidentally registered without an explicit permission policy", async () => {
    const root = await login();
    app.get("/v1/admin/new-sensitive-endpoint", (_req, res) =>
      res.json({ secret: true }),
    );
    expect(
      (await call(root, "get", "/v1/admin/new-sensitive-endpoint")).status,
    ).toBe(404);
  });
  const routes = [
    ["get", "/games"],
    ["post", "/games/validate"],
    ["get", "/games/owned-game/validation"],
    ["post", "/games/upload"],
    ["post", "/games/owned-game/upload"],
    ["put", "/games/owned-game/upload"],
    ["get", "/reports"],
    ["put", "/games/owned-game/touch-zones"],
    ["post", "/games/owned-game/publish"],
    ["delete", "/games/owned-game"],
    ["put", "/feed/order"],
    ["get", "/ads-config"],
    ["put", "/ads-config"],
    ["put", "/games/owned-game/features"],
    ["get", "/uploads"],
    ["post", `/uploads/${"a".repeat(43)}/publish`],
    ["get", "/admins"],
    ["get", "/roles"],
    ["get", "/permissions"],
    ["get", "/audit-log"],
    ["post", "/preview-grants"],
    ["post", "/auth/logout"],
  ];
  it.each(["/v1/admin", "/api/admin"])(
    "denies every administrative route without a session: %s",
    async (prefix) => {
      for (const [method, url] of routes) {
        const res = await (request(app) as any)[method](prefix + url);
        expect(res.status, `${method} ${url}: ${res.text}`).toBe(401);
      }
    },
  );
  it("issues secure opaque cookies and stores only digests; both aliases share sessions", async () => {
    const c = await login();
    const token = c.cookie.split("=")[1];
    expect(
      store.get("SELECT token FROM sessions WHERE token=?", token),
    ).toBeUndefined();
    expect(
      store.get("SELECT token FROM sessions WHERE token=?", digest(token)),
    ).toBeTruthy();
    expect((await call(c, "get", "/api/admin/games")).status).toBe(200);
    const pre = await request(app).get("/v1/admin/auth/csrf");
    expect(pre.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(pre.headers["set-cookie"][0]).toMatch(/Secure/);
    expect(pre.headers["set-cookie"][0]).toMatch(/SameSite=Strict/);
  });
  it("requires CSRF and exact Origin before mutations", async () => {
    const c = await login();
    expect(
      (
        await request(app)
          .put("/v1/admin/ads-config")
          .set("Cookie", c.cookie)
          .set("Origin", origin)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await call(c, "put", "/v1/admin/ads-config", {}).set(
          "Origin",
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(c, "put", "/v1/admin/ads-config", {}).set(
          "Origin",
          origin + ".evil.test",
        )
      ).status,
    ).toBe(403);
  });
  it.each(["/v1/admin", "/api/admin"])(
    "enforces Developer permissions and game scope: %s",
    async (prefix) => {
      const c = await login("developer");
      const games = await call(c, "get", prefix + "/games");
      expect(games.body.games.map((g: any) => g.id)).toEqual(["owned-game"]);
      for (const [method, url] of [
        ["post", "/games/owned-game/publish"],
        ["delete", "/games/owned-game"],
        ["put", "/ads-config"],
        ["get", "/admins"],
        ["get", "/roles"],
        ["get", "/permissions"],
        ["get", "/reports"],
        ["put", "/games/owned-game/features"],
        ["post", "/games/other-game/upload"],
      ])
        expect((await call(c, method, prefix + url, {})).status, url).toBe(403);
      expect((await call(c, "post", prefix + "/users/manage", {})).status).toBe(
        404,
      );
      expect(
        (await call(c, "post", prefix + "/settings/manage", {})).status,
      ).toBe(404);
    },
  );
  it("stages Developer uploads, permits assigned updates, and prevents publishing via ID collision", async () => {
    const c = await login("developer");
    const res = await call(c, "post", "/v1/admin/games/upload").attach(
      "file",
      zip(),
      "game.zip",
    );
    expect(res.status, res.text).toBe(201);
    expect(res.body.staged).toBe(true);
    expect(fs.existsSync(path.join(directory, "public/games/new-game"))).toBe(
      false,
    );
    expect(
      (
        await call(
          c,
          "post",
          `/v1/admin/uploads/${res.body.uploadId}/publish`,
          {},
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(c, "post", "/v1/admin/games/owned-game/upload").attach(
          "file",
          zip("owned-game", "1.0.1"),
          "game.zip",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(c, "post", "/v1/admin/games/upload").attach(
          "file",
          zip("other-game"),
          "game.zip",
        )
      ).status,
    ).toBe(403);
  });
  it("allows Super Admin to publish staged files, then configure/archive/delete", async () => {
    const c = await login();
    const upload = await call(c, "post", "/v1/admin/games/upload").attach(
      "file",
      zip(),
      "game.zip",
    );
    expect(upload.status, upload.text).toBe(201);
    const result = await call(
      c,
      "post",
      `/v1/admin/uploads/${upload.body.uploadId}/publish`,
      {},
    );
    expect(result.status, result.text).toBe(200);
    expect(
      fs.existsSync(
        path.join(directory, "public/games/new-game/1.0.0/index.html"),
      ),
    ).toBe(true);
    expect(
      (
        await call(c, "put", "/v1/admin/games/new-game/features", {
          features: { hint: true },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(c, "post", "/v1/admin/games/new-game/publish", {
          status: "archived",
        })
      ).status,
    ).toBe(200);
    expect((await call(c, "delete", "/v1/admin/games/new-game")).status).toBe(
      200,
    );
  });
  it("rejects unsafe IDs/versions before any destination changes", async () => {
    const c = await login();
    for (const [id, version] of [
      ["../../outside", "1.0.0"],
      ["new-game", "../../outside"],
    ])
      expect(
        (
          await call(c, "post", "/v1/admin/games/upload").attach(
            "file",
            zip(id, version),
            "game.zip",
          )
        ).status,
      ).toBe(400);
    expect(store.all("SELECT * FROM uploads")).toHaveLength(0);
  });
  it("denies unknown endpoints and invalid configuration; does not leak secrets in audit", async () => {
    const c = await login();
    expect(
      (await call(c, "post", "/v1/admin/future-unguarded", {})).status,
    ).toBe(404);
    expect(
      (
        await call(c, "post", "/v1/admin/games/owned-game/publish", {
          status: "anything",
        })
      ).status,
    ).toBe(400);
    const text = JSON.stringify(store.all("SELECT * FROM audit"));
    expect(text).not.toContain(password);
    expect(text).not.toContain(c.cookie.split("=")[1]);
    expect(text).not.toContain(c.csrf);
  });
  it("logout ends one session; revoke-all ends every session", async () => {
    const a = await login(),
      b = await login();
    expect((await call(a, "post", "/v1/admin/auth/logout", {})).status).toBe(
      200,
    );
    expect((await call(a, "get", "/v1/admin/games")).status).toBe(401);
    expect((await call(b, "get", "/v1/admin/games")).status).toBe(200);
    await call(b, "post", "/v1/admin/auth/logout-all", {});
    expect((await call(b, "get", "/v1/admin/games")).status).toBe(401);
  });
  it.each(["idle", "absolute", "invalid"])(
    "rejects %s session",
    async (kind) => {
      const c = await login();
      if (kind === "idle") store.run("UPDATE sessions SET seen=0");
      if (kind === "absolute") store.run("UPDATE sessions SET expires=0");
      if (kind === "invalid") c.cookie = "__Host-admin_session=invalid";
      expect((await call(c, "get", "/v1/admin/games")).status).toBe(401);
    },
  );
  it("disabling an account revokes sessions; cannot disable last Super Admin", async () => {
    const root = await login(),
      dev = await login("developer");
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${devId}`, {
          active: false,
        })
      ).status,
    ).toBe(200);
    expect((await call(dev, "get", "/v1/admin/games")).status).toBe(401);
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${superId}`, {
          active: false,
        })
      ).status,
    ).toBe(409);
    expect(store.account(superId)?.active).toBe(1);
  });
  it("role and scope changes invalidate existing sessions", async () => {
    const root = await login(),
      dev = await login("developer");
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${devId}`, {
          scopes: ["other-game"],
        })
      ).status,
    ).toBe(200);
    expect((await call(dev, "get", "/v1/admin/games")).status).toBe(401);
    const fresh = await login("developer");
    expect(
      (
        await call(root, "patch", "/v1/admin/roles/developer", {
          permissions: ["games.read"],
        })
      ).status,
    ).toBe(200);
    expect((await call(fresh, "get", "/v1/admin/games")).status).toBe(401);
  });
  it("password change revokes all sessions and rejects the old password", async () => {
    const a = await login(),
      b = await login();
    expect(
      (
        await call(a, "post", "/v1/admin/auth/change-password", {
          currentPassword: password,
          password: "A different long password!",
        })
      ).status,
    ).toBe(200);
    expect((await call(b, "get", "/v1/admin/games")).status).toBe(401);
  });
  it("reset token is hashed, expires, is single-use, and revokes sessions", async () => {
    const root = await login(),
      dev = await login("developer");
    await call(root, "post", `/v1/admin/admins/${devId}/password-reset`, {});
    for (let i = 0; i < 10 && !resetLink; i++)
      await new Promise((r) => setTimeout(r, 10));
    const token = resetLink.split("#reset=")[1];
    expect(token).toHaveLength(43);
    expect(
      store.get("SELECT * FROM resets WHERE token=?", token),
    ).toBeUndefined();
    const result = await call(root, "post", "/v1/admin/auth/reset", {
      token,
      password: "The replacement password 123!",
    });
    expect(result.status, result.text).toBe(200);
    expect((await call(dev, "get", "/v1/admin/games")).status).toBe(401);
    expect(
      (
        await call(root, "post", "/v1/admin/auth/reset", {
          token,
          password: "The replacement password 123!",
        })
      ).status,
    ).toBe(400);
  });
  it("generic failed logins are throttled", async () => {
    const pre = await request(app).get("/v1/admin/auth/csrf");
    const c = { cookie: cookieFrom(pre), csrf: pre.body.csrfToken };
    for (let i = 0; i < 5; i++)
      expect(
        (
          await call(c, "post", "/v1/admin/auth/login", {
            identifier: "not-an-account",
            password,
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await call(c, "post", "/v1/admin/auth/login", {
          identifier: "not-an-account",
          password,
        })
      ).status,
    ).toBe(429);
  });
  it("preview origin exposes no Admin API and Admin origin redirects game assets", async () => {
    expect(
      (
        await request(app)
          .get("/v1/admin/games")
          .set("Host", "preview.example.test")
      ).status,
    ).toBe(404);
    const res = await request(app)
      .get("/games/owned-game/1.0.0/index.html")
      .set("Host", "admin.example.test");
    expect(res.status).toBe(307);
    expect(res.headers.location).toMatch(/^https:\/\/preview.example.test\//);
  });
  it("staged preview grants are scoped and expire", async () => {
    const c = await login("developer");
    const upload = await call(c, "post", "/v1/admin/games/upload").attach(
      "file",
      zip(),
      "game.zip",
    );
    const grant = await call(c, "post", "/v1/admin/preview-grants", {
      uploadId: upload.body.uploadId,
    });
    expect(grant.status, grant.text).toBe(200);
    const url = new URL(grant.body.url);
    const preview = await request(app).get(url.pathname).set("Host", url.host);
    expect(preview.status, preview.text).toBe(200);
    expect(preview.text).toContain("preview-adapter.js");
    store.run("UPDATE preview_grants SET expires=0");
    expect(
      (await request(app).get(url.pathname).set("Host", url.host)).status,
    ).toBe(404);
  });
  it("creates accounts with Argon2id and rejects duplicate identities or weak passwords", async () => {
    const root = await login();
    const data = {
      username: "new-developer",
      email: "new@example.test",
      role: "developer",
      scopes: ["owned-game"],
      password,
    };
    const created = await call(root, "post", "/v1/admin/admins", data);
    expect(created.status, created.text).toBe(201);
    expect(created.body.account.password).toBeUndefined();
    expect(store.account(created.body.account.id)?.password).toMatch(
      /^\$argon2id\$/,
    );
    expect((await call(root, "post", "/v1/admin/admins", data)).status).toBe(
      409,
    );
    expect(
      (
        await call(root, "post", "/v1/admin/admins", {
          ...data,
          username: "another",
          email: "another@example.test",
          password: "short",
        })
      ).status,
    ).toBe(400);
  });
  it("requires recent password confirmation for account changes", async () => {
    const root = await login();
    store.run("UPDATE sessions SET confirmed=0");
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${devId}`, {
          active: false,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(root, "post", "/v1/admin/auth/confirm", { password })).status,
    ).toBe(200);
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${devId}`, {
          active: false,
        })
      ).status,
    ).toBe(200);
  });
  it("does not expose public authentication through case or trailing-slash aliases", async () => {
    for (const url of ["/auth/LOGIN", "/auth/login/", "/AUTH/login"])
      expect(
        (
          await request(app)
            .post("/v1/admin" + url)
            .send({ identifier: "root", password })
        ).status,
      ).toBe(401);
  });
  it("supports custom roles and prevents self-escalation or unknown permissions", async () => {
    const root = await login();
    expect(
      (
        await call(root, "post", "/v1/admin/roles", {
          id: "game-reader",
          permissions: ["games.read"],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${devId}`, {
          role: "game-reader",
        })
      ).status,
    ).toBe(200);
    const dev = await login("developer");
    expect((await call(dev, "post", "/v1/admin/games/upload")).status).toBe(
      403,
    );
    expect(
      (
        await call(root, "post", "/v1/admin/roles", {
          id: "bad-role",
          permissions: ["made.up"],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(root, "patch", `/v1/admin/admins/${superId}`, {
          role: "developer",
        })
      ).status,
    ).toBe(403);
  });
  it("persists sessions across store reopening", async () => {
    const c = await login();
    store.db.close();
    store = new SecurityStore(config.database);
    app = createApp(
      path.join(directory, "games.json"),
      "https://games.example.test",
      { store, config, publicDir: path.join(directory, "public") },
    );
    expect((await call(c, "get", "/v1/admin/auth/session")).status).toBe(200);
  });
  it("rejects expired reset tokens and only one concurrent reset succeeds", async () => {
    const root = await login();
    const issue = async () => {
      resetLink = "";
      await call(root, "post", `/v1/admin/admins/${devId}/password-reset`, {});
      for (let i = 0; i < 10 && !resetLink; i++)
        await new Promise((r) => setTimeout(r, 10));
      return resetLink.split("#reset=")[1];
    };
    const expired = await issue();
    store.run("UPDATE resets SET expires=0");
    expect(
      (
        await call(root, "post", "/v1/admin/auth/reset", {
          token: expired,
          password,
        })
      ).status,
    ).toBe(400);
    const token = await issue();
    const results = await Promise.all([
      call(root, "post", "/v1/admin/auth/reset", { token, password }),
      call(root, "post", "/v1/admin/auth/reset", { token, password }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
  it("prevents overwriting an immutable live version", async () => {
    const root = await login();
    const one = await call(root, "post", "/v1/admin/games/upload").attach(
      "file",
      zip(),
      "one.zip",
    );
    await call(
      root,
      "post",
      `/v1/admin/uploads/${one.body.uploadId}/publish`,
      {},
    );
    const file = path.join(directory, "public/games/new-game/1.0.0/index.html"),
      before = fs.readFileSync(file, "utf8");
    const two = await call(
      root,
      "post",
      "/v1/admin/games/new-game/upload",
    ).attach("file", zip(), "two.zip");
    expect(
      (
        await call(
          root,
          "post",
          `/v1/admin/uploads/${two.body.uploadId}/publish`,
          {},
        )
      ).status,
    ).toBe(409);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });
  it("rejects archive traversal and out-of-scope staged claims", async () => {
    const root = await login(),
      dev = await login("developer");
    const z = new AdmZip(zip());
    z.addFile("unsafe:filename.js", Buffer.from("malicious"));
    expect(
      (
        await call(root, "post", "/v1/admin/games/upload").attach(
          "file",
          z.toBuffer(),
          "bad.zip",
        )
      ).status,
    ).toBe(400);
    const staged = await call(root, "post", "/v1/admin/games/upload").attach(
      "file",
      zip("reserved-game"),
      "one.zip",
    );
    expect(staged.status).toBe(201);
    expect(
      (
        await call(dev, "post", "/v1/admin/games/upload").attach(
          "file",
          zip("reserved-game"),
          "two.zip",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(dev, "post", "/v1/admin/preview-grants", {
          uploadId: staged.body.uploadId,
        })
      ).status,
    ).toBe(403);
  });
});
