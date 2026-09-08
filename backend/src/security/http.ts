import { Request, Response, NextFunction, RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { SecurityConfig } from "./config";
import {
  Principal,
  SecurityError,
  SecurityStore,
  digest,
  randomToken,
} from "./store";
export const COOKIE = "__Host-admin_session";
export const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function cookie(req: Request) {
  const entries = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(`${COOKIE}=`));
  return entries.length === 1 ? entries[0].slice(COOKIE.length + 1) : "";
}
export function setCookie(
  res: Response,
  token: string,
  config: SecurityConfig,
  age: number,
) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.secure,
    sameSite: "strict",
    path: "/",
    maxAge: age,
  });
}
export const principal = (res: Response) => res.locals.admin as Principal;
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
export function requireOrigin(req: Request, config: SecurityConfig) {
  if (req.get("origin") !== config.origin)
    throw new SecurityError(403, "Untrusted request origin");
}
export function securityMiddleware(
  store: SecurityStore,
  config: SecurityConfig,
): RequestHandler {
  return (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.locals.requestId = randomToken();
      const token = cookie(req);
      const session =
        token.length === 43
          ? store.get("SELECT * FROM sessions WHERE token=?", digest(token))
          : undefined;
      const now = Date.now();
      if (
        session &&
        session.expires > now &&
        session.seen + config.idleMs > now
      ) {
        res.locals.session = session;
        if (session.account) {
          const account = store.account(session.account);
          if (account?.active && account.version === session.version) {
            const { password, ...safe } = account;
            res.locals.admin = {
              ...safe,
              permissions: store.effective(account),
              session: session.token,
            };
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function requireSession(store: SecurityStore): RequestHandler {
  return (_req, res, next) => {
    if (!res.locals.admin)
      return next(new SecurityError(401, "Authentication required"));
    store.run(
      "UPDATE sessions SET seen=? WHERE token=?",
      Date.now(),
      principal(res).session,
    );
    next();
  };
}
export function csrf(config: SecurityConfig): RequestHandler {
  return (req, res, next) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        requireOrigin(req, config);
        const received = req.get("x-csrf-token") || "";
        if (
          !res.locals.session ||
          !equal(digest(received), res.locals.session.csrf)
        )
          throw new SecurityError(403, "Invalid CSRF token");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function authorize(
  store: SecurityStore,
  permission: string,
  game?: (req: Request) => string,
): RequestHandler {
  return (req, res, next) => {
    const admin = principal(res);
    if (!admin) return next(new SecurityError(401, "Authentication required"));
    if (
      !admin.permissions.includes(permission) ||
      (game && !store.scope(admin, game(req)))
    )
      return next(new SecurityError(403, "Permission denied"));
    next();
  };
}
export function recent(req: Request, res: Response) {
  if (
    !res.locals.session ||
    res.locals.session.confirmed + 5 * 60_000 < Date.now()
  )
    throw new SecurityError(403, "Confirm your password before this operation");
}
// Recheck after asynchronous work (password hashing or multipart parsing).
export function revalidate(
  store: SecurityStore,
  config: SecurityConfig,
  res: Response,
) {
  const admin = principal(res),
    account = store.account(admin.id),
    session = store.get("SELECT * FROM sessions WHERE token=?", admin.session),
    now = Date.now();
  if (
    !account?.active ||
    account.version !== admin.version ||
    !session ||
    session.expires <= now ||
    session.seen + config.idleMs <= now
  )
    throw new SecurityError(401, "Authentication required");
  return account;
}
export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status =
    error instanceof SecurityError
      ? error.status
      : error?.code === "LIMIT_FILE_SIZE" || error?.type === "entity.too.large"
        ? 413
        : error?.name === "ZodError" ||
            error?.name === "MulterError" ||
            error?.type === "entity.parse.failed"
          ? 400
          : 500;
  res.status(status).json({
    error:
      status === 500
        ? "Internal server error"
        : error instanceof SecurityError
          ? error.message
          : "Invalid request",
    requestId: res.locals.requestId,
  });
}
