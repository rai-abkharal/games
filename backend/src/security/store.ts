import { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const permissions = [
  "games.read",
  "games.upload",
  "games.update",
  "games.configure",
  "games.publish",
  "games.delete",
  "feed.manage",
  "reports.read",
  "users.read",
  "users.manage",
  "admins.read",
  "admins.create",
  "admins.update",
  "admins.disable",
  "admins.sessions.revoke",
  "admins.password.reset",
  "roles.manage",
  "permissions.manage",
  "settings.manage",
  "ads.configure",
  "analytics.read",
  "audit.read",
] as const;
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class SecurityError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  active: number;
  version: number;
  role: string;
  scopes: string;
}
export interface Principal extends Omit<Account, "password"> {
  permissions: string[];
  session: string;
}

export class SecurityStore {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(path.resolve(filename)), {
        recursive: true,
        mode: 0o700,
      });
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS roles(id TEXT PRIMARY KEY, permissions TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL REFERENCES roles(id), scopes TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account TEXT REFERENCES accounts(id), csrf TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL, expires INTEGER NOT NULL, version INTEGER NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account);
      CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS throttles(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL, next INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT, time INTEGER NOT NULL, ip TEXT, request TEXT, outcome TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), game TEXT NOT NULL, version TEXT NOT NULL, filename TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preview_grants(token TEXT PRIMARY KEY, upload TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(1);`);
    this.run(
      "INSERT OR IGNORE INTO roles VALUES(?,?)",
      "super-admin",
      JSON.stringify(permissions),
    );
    this.run(
      "INSERT OR IGNORE INTO roles VALUES(?,?)",
      "developer",
      JSON.stringify(["games.read", "games.upload", "games.update"]),
    );
    if (filename !== ":memory:" && process.platform !== "win32")
      fs.chmodSync(filename, 0o600);
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  get<T = any>(sql: string, ...args: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T = any>(sql: string, ...args: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  account(id: string) {
    return this.get<Account>("SELECT * FROM accounts WHERE id=?", id);
  }
  lookup(identifier: string) {
    return this.get<Account>(
      "SELECT * FROM accounts WHERE username=? OR email=?",
      identifier,
      identifier,
    );
  }
  effective(account: Account): string[] {
    return JSON.parse(
      this.get("SELECT permissions FROM roles WHERE id=?", account.role)!
        .permissions,
    );
  }
  safe(account: Account) {
    const { password, ...safe } = account;
    return {
      ...safe,
      scopes: JSON.parse(account.scopes),
      permissions: this.effective(account),
    };
  }
  revoke(id: string) {
    this.run("DELETE FROM sessions WHERE account=?", id);
    this.run("DELETE FROM resets WHERE account=?", id);
    this.run("UPDATE accounts SET version=version+1 WHERE id=?", id);
  }
  audit(
    actor: string | null,
    action: string,
    target: string | null,
    ip = "",
    request = "",
    outcome = "success",
  ) {
    this.run(
      "INSERT INTO audit(actor,action,target,time,ip,request,outcome) VALUES(?,?,?,?,?,?,?)",
      actor,
      action,
      target,
      Date.now(),
      ip.slice(0, 128),
      request.slice(0, 80),
      outcome,
    );
  }
  ensureSuper() {
    if (
      !this.get(
        "SELECT id FROM accounts WHERE role=? AND active=1 LIMIT 1",
        "super-admin",
      )
    )
      throw new SecurityError(
        409,
        "At least one active Super Admin is required",
      );
  }
  create(
    input: { username: string; email: string; role: string; scopes: string[] },
    password: string,
  ) {
    if (input.role === "super-admin" && !input.scopes.includes("*"))
      throw new SecurityError(400, "Super Admin requires all-games scope");
    if (this.lookup(input.username) || this.lookup(input.email))
      throw new SecurityError(409, "Account identity unavailable");
    if (!this.get("SELECT id FROM roles WHERE id=?", input.role))
      throw new SecurityError(400, "Unknown role");
    const id = randomToken();
    this.run(
      "INSERT INTO accounts(id,username,email,password,role,scopes) VALUES(?,?,?,?,?,?)",
      id,
      input.username,
      input.email,
      password,
      input.role,
      JSON.stringify(input.scopes),
    );
    return this.account(id)!;
  }
  scope(principal: Principal, game: string) {
    const scopes: string[] = JSON.parse(principal.scopes);
    return scopes.includes("*") || scopes.includes(game);
  }
  throttle(key: string, limit: number, windowMs: number, progressive = false) {
    this.transaction(() => {
      const now = Date.now();
      const row = this.get("SELECT * FROM throttles WHERE key=?", key);
      if (row && row.until > now && (row.count >= limit || row.next > now))
        throw new SecurityError(429, "Too many attempts. Try again later.");
      const count = row && row.until > now ? row.count + 1 : 1;
      const until = row && row.until > now ? row.until : now + windowMs;
      const next =
        progressive && count > 4
          ? now + Math.min(60_000, 1000 * 2 ** Math.min(count - 5, 6))
          : 0;
      this.run(
        "INSERT OR REPLACE INTO throttles VALUES(?,?,?,?)",
        key,
        count,
        until,
        next,
      );
      this.run("DELETE FROM throttles WHERE until<?", now);
      this.run("DELETE FROM sessions WHERE expires<?", now);
      this.run("DELETE FROM resets WHERE expires<?", now);
    });
  }
}
