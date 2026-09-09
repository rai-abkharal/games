import { RequestHandler } from "express";
import { gameRules } from "./gamePolicy";
import { principal } from "./http";
import { SecurityError } from "./store";

// This outer allowlist also protects future handlers accidentally registered
// without authorize(). Public authentication exceptions are declared in app.ts.
const rules: [string, RegExp, string | null][] = [
  ...gameRules,
  ["GET", /^\/auth\/session$/, null],
  ["POST", /^\/auth\/(logout|logout-all|confirm|change-password)$/, null],
  ["POST", /^\/preview-grants$/, "games.read"],
  ["GET", /^\/admins$/, "admins.read"],
  ["POST", /^\/admins$/, "admins.create"],
  ["PATCH", /^\/admins\/[A-Za-z0-9_-]{43}$/, "admins.update"],
  [
    "POST",
    /^\/admins\/[A-Za-z0-9_-]{43}\/revoke-sessions$/,
    "admins.sessions.revoke",
  ],
  [
    "POST",
    /^\/admins\/[A-Za-z0-9_-]{43}\/password-reset$/,
    "admins.password.reset",
  ],
  ["GET", /^\/permissions$/, "permissions.manage"],
  ["GET", /^\/roles$/, "roles.manage"],
  ["POST", /^\/roles$/, "roles.manage"],
  ["PATCH", /^\/roles\/[a-z0-9-]{3,64}$/, "roles.manage"],
  ["GET", /^\/audit-log$/, "audit.read"],
  ["GET", /^\/analytics\/summary\/?$/, "analytics.read"],
  ["POST", /^\/analytics\/test-event\/?$/, "analytics.read"],
];
export const adminPolicy: RequestHandler = (req, res, next) => {
  const rule = rules.find(
    ([method, pattern]) => method === req.method && pattern.test(req.path),
  );
  if (!rule)
    return next(new SecurityError(404, "Unknown administrative operation"));
  if (rule[2] && !principal(res).permissions.includes(rule[2]))
    return next(new SecurityError(403, "Permission denied"));
  next();
};
