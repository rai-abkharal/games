import React, { createContext, useContext, useEffect, useState } from "react";
import { api, prepareCsrf, setCsrf } from "../api/adminClient";
import { SecurityPanel } from "./SecurityPanel";
export interface AdminAccount {
  id: string;
  username: string;
  email: string;
  active: number;
  role: string;
  scopes: string[];
  permissions: string[];
}
interface Session {
  account: AdminAccount;
  previewOrigin: string;
}
const Context = createContext<Session | null>(null);
export function useAdmin() {
  const value = useContext(Context);
  if (!value) throw new Error("Admin session required");
  return value;
}
export function AdminSession({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [security, setSecurity] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(() =>
    location.hash.startsWith("#reset=") ? "reset" : "login",
  );
  const [resetToken] = useState(() =>
    location.hash.startsWith("#reset=") ? location.hash.slice(7) : "",
  );
  const [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (location.hash.startsWith("#reset="))
      history.replaceState(null, "", location.pathname);
    let active = true;
    api("/auth/session")
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      setSession(null);
      setCsrf("");
      setError("Your session ended. Please sign in again.");
    };
    window.addEventListener("admin-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("admin-session-expired", expired);
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await prepareCsrf();
      if (mode === "login") {
        const s = await api("/auth/login", { identifier, password });
        setCsrf(s.csrfToken);
        setSession(s);
      }
      if (mode === "forgot") {
        const result = await api("/auth/reset-request", { identifier });
        setNotice(result.message);
      }
      if (mode === "reset") {
        await api("/auth/reset", { token: resetToken, password });
        setSession(null);
        setCsrf("");
        setMode("login");
        setNotice("Password reset. Sign in with your new password.");
      }
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="auth-screen" aria-busy="true">
        Checking your session…
      </main>
    );
  if (!session || mode === "reset")
    return (
      <main className="auth-screen">
        <form className="auth-card" onSubmit={submit}>
          <p className="auth-eyebrow">SWIPE PLAY · OPERATOR STUDIO</p>
          <h1>
            {mode === "login"
              ? "Administrator sign in"
              : mode === "forgot"
                ? "Request password reset"
                : "Set a new password"}
          </h1>
          <p>Access is limited to authorized administrators.</p>
          {mode !== "reset" && (
            <label>
              Username or email
              <input
                autoComplete="username"
                required
                maxLength={128}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input
                type="password"
                autoComplete={
                  mode === "reset" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "reset" ? 15 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "forgot"
                  ? "Send reset email"
                  : "Reset password"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setMode(mode === "login" ? "forgot" : "login");
              setError("");
              setNotice("");
            }}
          >
            {mode === "login" ? "Forgot password?" : "Back to sign in"}
          </button>
        </form>
      </main>
    );
  return (
    <Context.Provider value={session}>
      <header className="auth-bar">
        <span>
          Signed in as <strong>{session.account.username}</strong>
        </span>
        <button
          className="btn-secondary"
          onClick={() => setSecurity((v) => !v)}
        >
          {security ? "Back to games" : "Account & security"}
        </button>
        <button
          className="btn-secondary"
          onClick={async () => {
            try {
              await api("/auth/logout", {});
              setSession(null);
              setCsrf("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Sign out
        </button>
        {error && <span role="alert">{error}</span>}
      </header>
      {security ? <SecurityPanel /> : children}
    </Context.Provider>
  );
}
