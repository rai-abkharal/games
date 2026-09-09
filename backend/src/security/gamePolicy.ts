import { RequestHandler } from "express";
import { z } from "zod";
import { AdsConfigSchema, TouchZoneSchema } from "../types/game";
import { principal } from "./http";
import { SecurityError, SecurityStore } from "./store";
const id = z.string().regex(/^[a-z0-9-]{1,80}$/);
export const gameRules: [string, RegExp, string][] = [
  ["GET", /^\/games\/?$/, "games.read"],
  ["GET", /^\/uploads\/?$/, "games.read"],
  ["DELETE", /^\/uploads\/([A-Za-z0-9_-]{43})\/?$/, "games.update"],
  ["POST", /^\/uploads\/([A-Za-z0-9_-]{43})\/publish\/?$/, "games.publish"],
  ["POST", /^\/games\/validate\/?$/, "games.upload"],
  ["GET", /^\/games\/([a-z0-9-]+)\/validation\/?$/, "games.read"],
  ["POST", /^\/games\/upload\/?$/, "games.upload"],
  ["POST", /^\/games\/([a-z0-9-]+)\/upload\/?$/, "games.update"],
  ["PUT", /^\/games\/([a-z0-9-]+)\/upload\/?$/, "games.update"],
  ["GET", /^\/reports\/?$/, "reports.read"],
  ["PUT", /^\/games\/([a-z0-9-]+)\/touch-zones\/?$/, "games.configure"],
  ["POST", /^\/games\/([a-z0-9-]+)\/publish\/?$/, "games.publish"],
  ["DELETE", /^\/games\/([a-z0-9-]+)\/?$/, "games.delete"],
  ["PUT", /^\/feed\/order\/?$/, "feed.manage"],
  ["GET", /^\/ads-config\/?$/, "ads.configure"],
  ["PUT", /^\/ads-config\/?$/, "ads.configure"],
  ["PUT", /^\/games\/([a-z0-9-]+)\/features\/?$/, "games.configure"],
  ["PUT", /^\/games\/([a-z0-9-]+)\/ads\/?$/, "games.configure"],
];
export function gamePolicy(store: SecurityStore): RequestHandler {
  return (req, res, next) => {
    try {
      const rule = gameRules.find(
        ([method, re]) => method === req.method && re.test(req.path),
      );
      if (!rule)
        throw new SecurityError(404, "Unknown administrative operation");
      const admin = principal(res),
        match = req.path.match(rule[1])!;
      if (!admin.permissions.includes(rule[2]))
        throw new SecurityError(403, "Permission denied");
      if (
        match[1] &&
        req.path.startsWith("/games/") &&
        !store.scope(admin, id.parse(match[1]))
      )
        throw new SecurityError(403, "Permission denied");
      if (rule[2] === "feed.manage" && !store.scope(admin, "*"))
        throw new SecurityError(403, "Permission denied");
      if (req.method === "PUT" && req.path.endsWith("/touch-zones"))
        req.body = z
          .object({
            touchZones: z
              .array(
                TouchZoneSchema.strict().refine(
                  (t) => t.x + t.width <= 1 && t.y + t.height <= 1,
                ),
              )
              .max(50),
          })
          .strict()
          .parse(req.body);
      if (req.method === "PUT" && req.path.endsWith("/features"))
        req.body = z
          .object({
            features: z
              .object({
                sound: z.boolean().optional(),
                vibration: z.boolean().optional(),
                hint: z.boolean().optional(),
              })
              .strict(),
          })
          .strict()
          .parse(req.body);
      if (
        req.method === "POST" &&
        req.path.startsWith("/games/") &&
        req.path.endsWith("/publish")
      )
        req.body = z
          .object({
            status: z
              .enum(["published", "draft", "archived", "deactivated"])
              .optional(),
            rolloutPercent: z.number().int().min(0).max(100).optional(),
          })
          .strict()
          .refine((x) => Object.keys(x).length > 0)
          .parse(req.body);
      if (req.method === "PUT" && req.path === "/feed/order")
        req.body = z
          .object({
            order: z
              .array(
                z
                  .object({
                    id,
                    sortWeight: z.number().int().min(0).max(100000),
                  })
                  .strict(),
              )
              .max(10000),
          })
          .strict()
          .parse(req.body);
      if (req.method === "PUT" && req.path === "/ads-config")
        req.body = AdsConfigSchema.strict().parse(req.body);
      if (req.method === "PUT" && req.path.endsWith("/ads"))
        req.body = z
          .object({
            ads: z
              .object({
                enabled: z.boolean().optional(),
                useCustomInterval: z.boolean().optional(),
                intervalMinutes: z.number().int().min(1).max(1440).optional(),
              })
              .strict(),
          })
          .strict()
          .parse(req.body);
      if (!["GET", "HEAD"].includes(req.method)) {
        store.throttle(`mutation:${admin.id}`, 120, 60_000);
        store.audit(
          admin.id,
          rule[2],
          match[1] || null,
          req.ip,
          res.locals.requestId,
          "started",
        );
        res.once("finish", () => {
          try {
            store.audit(
              admin.id,
              rule[2],
              match[1] || null,
              req.ip,
              res.locals.requestId,
              res.statusCode < 400 ? "success" : "failed",
            );
          } catch {
            console.error("Audit persistence failure");
          }
        });
      }
      // Sanitize legacy handlers without exposing paths or exception text.
      const json = res.json.bind(res);
      res.json = (body: any) =>
        json(
          res.statusCode >= 400
            ? {
                error:
                  res.statusCode >= 500
                    ? "Internal server error"
                    : typeof body?.error === "string"
                      ? body.error
                      : "Invalid request",
                requestId: res.locals.requestId,
              }
            : body,
        );
      next();
    } catch (error) {
      next(error);
    }
  };
}
