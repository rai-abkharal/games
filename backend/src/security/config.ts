import path from "node:path";
export interface SecurityConfig {
  origin: string;
  previewOrigin: string;
  database: string;
  staging: string;
  idleMs: number;
  absoluteMs: number;
  secure: boolean;
  deliverReset?: (email: string, link: string) => Promise<void>;
}
export function securityConfig(): SecurityConfig {
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.ADMIN_ORIGIN ||
      !process.env.PREVIEW_ORIGIN ||
      !process.env.ADMIN_SECURITY_DB)
  )
    throw new Error("Admin security deployment configuration is required");
  if (production && process.env.ADMIN_RESET_EMAIL_ENABLED !== "false" && (!process.env.SMTP_URL || !process.env.ADMIN_MAIL_FROM))
    throw new Error("Admin password reset mail configuration is required");
  const origin = new URL(process.env.ADMIN_ORIGIN || "https://localhost:5173")
    .origin;
  const previewOrigin = new URL(
    process.env.PREVIEW_ORIGIN || "https://127.0.0.1:5444",
  ).origin;
  const allowHttp = process.env.ADMIN_ALLOW_HTTP === "true";
  const allowedProtocols = allowHttp ? ["https:", "http:"] : ["https:"];
  if (
    new URL(origin).hostname === new URL(previewOrigin).hostname ||
    !allowedProtocols.includes(new URL(origin).protocol) ||
    !allowedProtocols.includes(new URL(previewOrigin).protocol)
  )
    throw new Error("Separate HTTPS Admin and preview hostnames are required");
  const database = path.resolve(
    process.env.ADMIN_SECURITY_DB || "security-data/admin.sqlite",
  );
  return {
    origin,
    previewOrigin,
    database,
    staging: path.resolve(
      process.env.ADMIN_STAGING_DIR ||
        path.join(path.dirname(database), "uploads"),
    ),
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 60 * 60_000,
    secure: new URL(origin).protocol === "https:",
  };
}
