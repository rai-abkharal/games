import { Router, Request, Response } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { SecurityConfig } from "./config";
import {
  Account,
  SecurityStore,
  SecurityError,
  permissions,
  digest,
  randomToken,
} from "./store";
import { hashPassword, passwordSchema, verifyPassword } from "./passwords";
import {
  asyncRoute,
  authorize,
  cookie,
  csrf,
  principal,
  recent,
  requireSession,
  setCookie,
  revalidate,
} from "./http";
const identity = z.string().trim().toLowerCase().min(3).max(128);
const accountInput = z
  .object({
    username: identity.regex(/^[a-z0-9_.-]+$/),
    email: identity.email(),
    role: z.string().min(1).max(64),
    scopes: z.array(z.string().regex(/^(\*|[a-z0-9-]+)$/)).max(1000),
  })
  .strict();
const loginInput = z
  .object({ identifier: identity, password: z.string().min(1).max(128) })
  .strict();
export function authRouter(store: SecurityStore, config: SecurityConfig) {
  const router = Router({ caseSensitive: true, strict: true });
  const dummy = hashPassword(randomToken());
  const log = (
    req: Request,
    res: Response,
    action: string,
    target: string | null = null,
    outcome = "success",
  ) =>
    store.audit(
      res.locals.admin?.id || null,
      action,
      target,
      req.ip,
      res.locals.requestId,
      outcome,
    );
  const canGrant = (res: Response, role: string, scopes: string[]) => {
    const actor = principal(res),
      target = store.get("SELECT permissions FROM roles WHERE id=?", role);
    if (!target) throw new SecurityError(400, "Unknown role");
    if (
      !(JSON.parse(target.permissions) as string[]).every((p) =>
        actor.permissions.includes(p),
      ) ||
      !scopes.every((scope) => store.scope(actor, scope))
    )
      throw new SecurityError(
        403,
        "Cannot grant access beyond your own permissions and scope",
      );
  };
  const issue = (req: Request, res: Response, account?: Account) => {
    const token = randomToken(),
      csrfToken = digest(`csrf:${token}`),
      now = Date.now();
    const duration = account ? config.absoluteMs : 10 * 60_000;
    store.run("DELETE FROM sessions WHERE token=?", digest(cookie(req, config)));
    store.run(
      "INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)",
      digest(token),
      account?.id || null,
      digest(csrfToken),
      now,
      now,
      now + duration,
      account?.version || 0,
      account ? now : 0,
    );
    setCookie(res, token, config, duration);
    return csrfToken;
  };
  router.get("/auth/csrf", (req, res, next) => {
    try {
      store.throttle(`bootstrap:${req.ip}`, 100, 60_000);
      if (
        res.locals.session &&
        (!res.locals.session.account || res.locals.admin)
      ) {
        const token = digest(`csrf:${cookie(req, config)}`);
        res.json({ csrfToken: token });
      } else res.json({ csrfToken: issue(req, res) });
    } catch (error) {
      next(error);
    }
  });
  router.use((req, res, next) =>
    ["/auth/login", "/auth/reset-request", "/auth/reset"].includes(req.path)
      ? csrf(config)(req, res, next)
      : next(),
  );
  router.post(
    "/auth/login",
    asyncRoute(async (req, res) => {
      const data = loginInput.parse(req.body);
      store.throttle(`login-ip:${req.ip}`, 30, 15 * 60_000);
      const key = `login-id:${digest(data.identifier)}`;
      store.throttle(key, 15, 15 * 60_000, true);
      const account = store.lookup(data.identifier);
      const valid = await verifyPassword(
        account?.password || (await dummy),
        data.password,
      );
      // Re-read after asynchronous hashing so disable/password changes cannot race login.
      const current = account && store.account(account.id);
      if (!valid || !current?.active || current.version !== account?.version) {
        log(req, res, "login", null, "failed");
        throw new SecurityError(401, "Invalid credentials");
      }
      store.run("DELETE FROM throttles WHERE key=?", key);
      const csrfToken = store.transaction(() => {
        const token = issue(req, res, current);
        store.audit(
          current.id,
          "login",
          current.id,
          req.ip,
          res.locals.requestId,
        );
        return token;
      });
      res.json({
        account: store.safe(current),
        csrfToken,
        previewOrigin: config.previewOrigin,
      });
    }),
  );
  const deliver = async (account: Account) => {
    const token = randomToken();
    store.transaction(() => {
      store.run("DELETE FROM resets WHERE account=?", account.id);
      store.run(
        "INSERT INTO resets VALUES(?,?,?)",
        digest(token),
        account.id,
        Date.now() + 20 * 60_000,
      );
    });
    const link = `${config.origin}/admin/login#reset=${token}`;
    try {
      if (config.deliverReset) await config.deliverReset(account.email, link);
      else {
        if (process.env.ADMIN_RESET_EMAIL_ENABLED === "false" || !process.env.SMTP_URL || !process.env.ADMIN_MAIL_FROM)
          throw new Error("Reset mail unavailable");
        const smtp = new URL(process.env.SMTP_URL);
        smtp.searchParams.set("requireTLS", "true");
        await nodemailer.createTransport(smtp.toString()).sendMail({
          from: process.env.ADMIN_MAIL_FROM,
          to: account.email,
          subject: "Reset your administrator password",
          text: `This link expires in 20 minutes and can be used once:\n${link}\nIf you did not request this, ignore this email.`,
        });
      }
    } catch {
      store.run("DELETE FROM resets WHERE token=?", digest(token));
      store.audit(
        null,
        "password-reset.delivery",
        account.id,
        "",
        "",
        "failed",
      );
    }
  };
  router.post(
    "/auth/reset-request",
    asyncRoute(async (req, res) => {
      const { identifier } = z
        .object({ identifier: identity })
        .strict()
        .parse(req.body);
      store.throttle(`reset-ip:${req.ip}`, 10, 60 * 60_000);
      store.throttle(`reset-id:${digest(identifier)}`, 3, 60 * 60_000);
      const account = store.lookup(identifier);
      // Respond before mail delivery to avoid account enumeration by SMTP timing.
      res.json({
        message: "If the account is eligible, a reset email will be sent.",
      });
      if (account?.active) await deliver(account);
    }),
  );
  router.post(
    "/auth/reset",
    asyncRoute(async (req, res) => {
      store.throttle(`reset-use:${req.ip}`, 20, 15 * 60_000);
      const data = z
        .object({ token: z.string().length(43), password: passwordSchema })
        .strict()
        .parse(req.body);
      const hash = await hashPassword(data.password);
      store.transaction(() => {
        const reset = store.get(
          "SELECT * FROM resets WHERE token=?",
          digest(data.token),
        );
        const account = reset && store.account(reset.account);
        if (!reset || reset.expires <= Date.now() || !account?.active)
          throw new SecurityError(400, "Invalid or expired reset link");
        store.run(
          "UPDATE accounts SET password=? WHERE id=?",
          hash,
          account.id,
        );
        store.revoke(account.id);
        store.audit(
          account.id,
          "password.reset",
          account.id,
          req.ip,
          res.locals.requestId,
        );
      });
      setCookie(res, "", config, 0);
      res.json({ success: true });
    }),
  );
  router.use(requireSession(store));
  router.use(csrf(config));
  router.post(
    "/preview-grants",
    authorize(store, "games.read"),
    (req, res, next) => {
      try {
        const { uploadId } = z
          .object({ uploadId: z.string().length(43) })
          .strict()
          .parse(req.body);
        const upload = store.get("SELECT * FROM uploads WHERE id=?", uploadId);
        if (!upload || !store.scope(principal(res), upload.game))
          throw new SecurityError(403, "Permission denied");
        const token = randomToken();
        store.run("DELETE FROM preview_grants WHERE expires<?", Date.now());
        store.run(
          "INSERT INTO preview_grants VALUES(?,?,?)",
          digest(token),
          uploadId,
          Date.now() + 5 * 60_000,
        );
        res.json({ url: `${config.previewOrigin}/staged/${token}/index.html` });
      } catch (e) {
        next(e);
      }
    },
  );
  router.get("/auth/session", (_req, res) =>
    res.json({
      account: store.safe(store.account(principal(res).id)!),
      previewOrigin: config.previewOrigin,
    }),
  );
  router.post("/auth/logout", (req, res) => {
    store.run("DELETE FROM sessions WHERE token=?", principal(res).session);
    log(req, res, "logout");
    setCookie(res, "", config, 0);
    res.json({ success: true });
  });
  router.post("/auth/logout-all", (req, res) => {
    store.transaction(() => {
      store.revoke(principal(res).id);
      log(req, res, "sessions.revoke-all", principal(res).id);
    });
    setCookie(res, "", config, 0);
    res.json({ success: true });
  });
  router.post(
    "/auth/confirm",
    asyncRoute(async (req, res) => {
      store.throttle(`confirm:${principal(res).id}`, 10, 15 * 60_000, true);
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .strict()
        .parse(req.body);
      const account = store.account(principal(res).id)!;
      if (!(await verifyPassword(account.password, password)))
        throw new SecurityError(401, "Invalid credentials");
      revalidate(store, config, res);
      if (
        !store.get(
          "SELECT token FROM sessions WHERE token=?",
          principal(res).session,
        )
      )
        throw new SecurityError(401, "Authentication required");
      store.run(
        "UPDATE sessions SET confirmed=? WHERE token=?",
        Date.now(),
        principal(res).session,
      );
      res.json({ success: true });
    }),
  );
  router.post(
    "/auth/change-password",
    asyncRoute(async (req, res) => {
      const data = z
        .object({
          currentPassword: z.string().min(1).max(128),
          password: passwordSchema,
        })
        .strict()
        .parse(req.body);
      const account = store.account(principal(res).id)!;
      store.throttle(`password:${account.id}`, 10, 15 * 60_000, true);
      if (!(await verifyPassword(account.password, data.currentPassword)))
        throw new SecurityError(401, "Invalid credentials");
      const hash = await hashPassword(data.password);
      revalidate(store, config, res);
      store.transaction(() => {
        if (store.account(account.id)?.version !== account.version)
          throw new SecurityError(401, "Authentication required");
        store.run(
          "UPDATE accounts SET password=? WHERE id=?",
          hash,
          account.id,
        );
        store.revoke(account.id);
        log(req, res, "password.change", account.id);
      });
      setCookie(res, "", config, 0);
      res.json({ success: true });
    }),
  );
  router.get("/admins", authorize(store, "admins.read"), (_req, res) =>
    res.json({
      accounts: store
        .all<Account>("SELECT * FROM accounts")
        .map((a) => store.safe(a)),
    }),
  );
  router.post(
    "/admins",
    authorize(store, "admins.create"),
    asyncRoute(async (req, res) => {
      recent(req, res);
      const { password, ...input } = accountInput
        .extend({ password: passwordSchema })
        .parse(req.body);
      if (!principal(res).permissions.includes("roles.manage"))
        throw new SecurityError(403, "Permission denied");
      canGrant(res, input.role, input.scopes);
      const hash = await hashPassword(password);
      revalidate(store, config, res);
      const created = store.transaction(() => {
        const actor = store.account(principal(res).id)!;
        if (!actor.active || actor.version !== principal(res).version)
          throw new SecurityError(401, "Authentication required");
        const a = store.create(input, hash);
        log(req, res, "admin.create", a.id);
        return a;
      });
      res.status(201).json({ account: store.safe(created) });
    }),
  );
  router.patch(
    "/admins/:id",
    authorize(store, "admins.update"),
    (req, res, next) => {
      try {
        recent(req, res);
        const data = accountInput
          .partial()
          .extend({ active: z.boolean().optional() })
          .strict()
          .parse(req.body);
        const actor = principal(res);
        if (
          (data.active !== undefined &&
            !actor.permissions.includes("admins.disable")) ||
          ((data.role !== undefined || data.scopes !== undefined) &&
            !actor.permissions.includes("roles.manage"))
        )
          throw new SecurityError(403, "Permission denied");
        store.transaction(() => {
          const old = store.account(req.params.id);
          if (!old) throw new SecurityError(404, "Account not found");
          canGrant(res, old.role, JSON.parse(old.scopes));
          if (
            old.id === actor.id &&
            ((data.role !== undefined && data.role !== old.role) ||
              (data.scopes !== undefined &&
                JSON.stringify([...data.scopes].sort()) !==
                  JSON.stringify((JSON.parse(old.scopes) as string[]).sort())))
          )
            throw new SecurityError(
              403,
              "You cannot change your own role or scope",
            );
          canGrant(
            res,
            data.role ?? old.role,
            data.scopes ?? JSON.parse(old.scopes),
          );
          if (
            (data.role ?? old.role) === "super-admin" &&
            !(data.scopes ?? JSON.parse(old.scopes)).includes("*")
          )
            throw new SecurityError(
              400,
              "Super Admin requires all-games scope",
            );
          const username = data.username ?? old.username,
            email = data.email ?? old.email;
          for (const value of [username, email]) {
            const collision = store.lookup(value);
            if (collision && collision.id !== old.id)
              throw new SecurityError(409, "Account identity unavailable");
          }
          if (
            data.role &&
            !store.get("SELECT id FROM roles WHERE id=?", data.role)
          )
            throw new SecurityError(400, "Unknown role");
          store.run(
            "UPDATE accounts SET username=?,email=?,active=?,role=?,scopes=? WHERE id=?",
            username,
            email,
            data.active === undefined ? old.active : Number(data.active),
            data.role ?? old.role,
            data.scopes ? JSON.stringify(data.scopes) : old.scopes,
            old.id,
          );
          store.ensureSuper();
          store.revoke(old.id);
          log(req, res, "admin.update", old.id);
          if (data.active !== undefined)
            log(
              req,
              res,
              data.active ? "admin.enable" : "admin.disable",
              old.id,
            );
          if (data.role !== undefined)
            log(req, res, "admin.role.change", old.id);
          if (data.scopes !== undefined)
            log(req, res, "admin.scope.change", old.id);
        });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/admins/:id/revoke-sessions",
    authorize(store, "admins.sessions.revoke"),
    (req, res, next) => {
      try {
        recent(req, res);
        const target = store.account(req.params.id);
        if (!target) throw new SecurityError(404, "Account not found");
        canGrant(res, target.role, JSON.parse(target.scopes));
        store.transaction(() => {
          store.revoke(req.params.id);
          log(req, res, "sessions.revoke", req.params.id);
        });
        res.json({ success: true });
      } catch (e) {
        next(e);
      }
    },
  );
  router.post(
    "/admins/:id/password-reset",
    authorize(store, "admins.password.reset"),
    asyncRoute(async (req, res) => {
      recent(req, res);
      store.throttle(`admin-reset:${principal(res).id}`, 10, 60 * 60_000);
      const a = store.account(req.params.id);
      if (!a?.active) throw new SecurityError(404, "Account not found");
      canGrant(res, a.role, JSON.parse(a.scopes));
      log(req, res, "password-reset.request", a.id);
      res.json({ success: true });
      await deliver(a);
    }),
  );
  router.get(
    "/permissions",
    authorize(store, "permissions.manage"),
    (_req, res) => res.json({ permissions }),
  );
  router.get("/roles", authorize(store, "roles.manage"), (_req, res) =>
    res.json({
      roles: store
        .all("SELECT * FROM roles")
        .map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })),
    }),
  );
  const saveRole = (req: Request, res: Response, next: any) => {
    try {
      recent(req, res);
      if (!principal(res).permissions.includes("permissions.manage"))
        throw new SecurityError(403, "Permission denied");
      const data = z
        .object({
          id: z.string().regex(/^[a-z0-9-]{3,64}$/),
          permissions: z.array(z.enum(permissions)).max(permissions.length),
        })
        .strict()
        .parse({
          ...req.body,
          ...(req.params.id ? { id: req.params.id } : {}),
        });
      if (
        !data.permissions.every((p) => principal(res).permissions.includes(p))
      )
        throw new SecurityError(
          403,
          "Cannot grant permissions you do not have",
        );
      if (data.id === "super-admin")
        throw new SecurityError(
          409,
          "The Super Admin permission set is protected",
        );
      store.transaction(() => {
        if (
          req.method === "POST" &&
          store.get("SELECT id FROM roles WHERE id=?", data.id)
        )
          throw new SecurityError(409, "Role already exists");
        if (
          req.method === "PATCH" &&
          !store.get("SELECT id FROM roles WHERE id=?", data.id)
        )
          throw new SecurityError(404, "Role not found");
        store.run(
          "INSERT INTO roles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET permissions=excluded.permissions",
          data.id,
          JSON.stringify([...new Set(data.permissions)]),
        );
        for (const a of store.all<Account>(
          "SELECT * FROM accounts WHERE role=?",
          data.id,
        ))
          store.revoke(a.id);
        log(req, res, "role.permissions.change", data.id);
      });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  };
  router.post("/roles", authorize(store, "roles.manage"), saveRole);
  router.patch("/roles/:id", authorize(store, "roles.manage"), saveRole);
  router.get("/audit-log", authorize(store, "audit.read"), (req, res) => {
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    res.json({
      records: store.all(
        "SELECT * FROM audit WHERE id<? ORDER BY id DESC LIMIT 100",
        before,
      ),
    });
  });
  return router;
}
