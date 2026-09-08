import React, { useEffect, useState } from "react";
import { api } from "../api/adminClient";
import { AdminAccount, useAdmin } from "./AdminSession";
interface Role {
  id: string;
  permissions: string[];
}
export function SecurityPanel() {
  const { account } = useAdmin();
  const can = (p: string) => account.permissions.includes(p);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [permissions, setPermissions] = useState<string[]>([]),
    [audit, setAudit] = useState<Record<string, string | number>[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState("");
  const [edit, setEdit] = useState<AdminAccount | null>(null),
    [username, setUsername] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("developer"),
    [scopes, setScopes] = useState(""),
    [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(""),
    [selectedPermissions, setSelectedPermissions] = useState<string[]>([]),
    [existingRole, setExistingRole] = useState(false);
  async function load() {
    const results = await Promise.all([
      can("admins.read") ? api("/admins") : null,
      can("roles.manage") ? api("/roles") : null,
      can("permissions.manage") ? api("/permissions") : null,
      can("audit.read") ? api("/audit-log") : null,
    ]);
    setAccounts(results[0]?.accounts || []);
    setRoles(results[1]?.roles || []);
    setPermissions(results[2]?.permissions || []);
    setAudit(results[3]?.records || []);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>, reload = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice("Saved successfully.");
      if (reload) await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectAccount(a: AdminAccount) {
    setEdit(a);
    setUsername(a.username);
    setEmail(a.email);
    setRole(a.role);
    setScopes(a.scopes.join(", "));
    setPassword("");
  }
  return (
    <main className="security-panel">
      <h1>Account & security</h1>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="auth-card">
        <h2>Confirm identity</h2>
        <p>
          Security changes require password confirmation within the last five
          minutes.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api("/auth/confirm", { password: confirmPassword });
              setConfirmPassword("");
            }, false);
          }}
        >
          <label>
            Current password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Confirm password</button>
        </form>
      </section>
      <section className="auth-card">
        <h2>Your password and sessions</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(
              () =>
                api("/auth/change-password", {
                  currentPassword,
                  password: newPassword,
                }).then(() =>
                  window.dispatchEvent(new Event("admin-session-expired")),
                ),
              false,
            );
          }}
        >
          <label>
            Current password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label>
            New password (15–128 characters)
            <input
              type="password"
              required
              minLength={15}
              maxLength={128}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Change password and sign out</button>
        </form>
        <button
          disabled={busy}
          onClick={() =>
            void action(
              () =>
                api("/auth/logout-all", {}).then(() =>
                  window.dispatchEvent(new Event("admin-session-expired")),
                ),
              false,
            )
          }
        >
          Sign out all sessions
        </button>
      </section>
      {can("admins.read") && (
        <section className="auth-card">
          <h2>Administrators</h2>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.username}
                    <br />
                    {a.email}
                  </td>
                  <td>{a.role}</td>
                  <td>{a.active ? "Active" : "Disabled"}</td>
                  <td>
                    {can("admins.update") && (
                      <button disabled={busy} onClick={() => selectAccount(a)}>
                        Edit
                      </button>
                    )}
                    {can("admins.disable") && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api(
                              `/admins/${a.id}`,
                              { active: !a.active },
                              "PATCH",
                            ),
                          )
                        }
                      >
                        {a.active ? "Disable" : "Enable"}
                      </button>
                    )}
                    {can("admins.sessions.revoke") && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api(`/admins/${a.id}/revoke-sessions`, {}),
                          )
                        }
                      >
                        Revoke sessions
                      </button>
                    )}
                    {can("admins.password.reset") && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api(`/admins/${a.id}/password-reset`, {}),
                          )
                        }
                      >
                        Send reset email
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {(can("admins.create") || edit) && (
        <section className="auth-card">
          <h2>{edit ? "Edit administrator" : "Create administrator"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const data = {
                  username,
                  email,
                  role,
                  scopes: scopes
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                };
                await api(
                  edit ? `/admins/${edit.id}` : "/admins",
                  edit ? data : { ...data, password },
                  edit ? "PATCH" : "POST",
                );
                setEdit(null);
                setUsername("");
                setEmail("");
                setPassword("");
                setScopes("");
              });
            }}
          >
            <label>
              Username
              <input
                required
                pattern="[a-z0-9_.-]+"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (e.target.value === "super-admin") setScopes("*");
                }}
              >
                {roles.map((r) => (
                  <option key={r.id}>{r.id}</option>
                ))}
              </select>
            </label>
            <label>
              Assigned game IDs (comma separated; * permits all)
              <input
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
              />
            </label>
            {!edit && (
              <label>
                Initial password
                <input
                  type="password"
                  required
                  minLength={15}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <button disabled={busy}>Save account</button>
            {edit && (
              <button
                type="button"
                onClick={() => {
                  setEdit(null);
                  setUsername("");
                  setEmail("");
                }}
              >
                Cancel editing
              </button>
            )}
          </form>
        </section>
      )}
      {can("roles.manage") && (
        <section className="auth-card">
          <h2>Roles and permissions</h2>
          <div>
            {roles.map((r) => (
              <button
                key={r.id}
                disabled={r.id === "super-admin"}
                onClick={() => {
                  setRoleId(r.id);
                  setSelectedPermissions(r.permissions);
                  setExistingRole(true);
                }}
              >
                {r.id}
              </button>
            ))}
            <button
              onClick={() => {
                setRoleId("");
                setSelectedPermissions([]);
                setExistingRole(false);
              }}
            >
              New role
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                api(
                  existingRole ? `/roles/${roleId}` : "/roles",
                  { id: roleId, permissions: selectedPermissions },
                  existingRole ? "PATCH" : "POST",
                ),
              );
            }}
          >
            <label>
              Role ID
              <input
                required
                pattern="[a-z0-9-]{3,64}"
                readOnly={existingRole}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              />
            </label>
            <div className="permission-grid">
              {permissions.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(p)}
                    onChange={(e) =>
                      setSelectedPermissions((old) =>
                        e.target.checked
                          ? [...old, p]
                          : old.filter((x) => x !== p),
                      )
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <button disabled={busy || !can("permissions.manage")}>
              Save permissions
            </button>
          </form>
        </section>
      )}
      {can("audit.read") && (
        <section className="auth-card">
          <h2>Audit log</h2>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(Number(row.time)).toLocaleString()}</td>
                  <td>{row.action}</td>
                  <td>{row.actor || "Unauthenticated"}</td>
                  <td>{row.target}</td>
                  <td>{row.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            disabled={busy || audit.length < 100}
            onClick={() =>
              void action(async () => {
                const next = await api(
                  `/audit-log?before=${audit[audit.length - 1]?.id}`,
                );
                setAudit(next.records);
              }, false)
            }
          >
            Older records
          </button>
        </section>
      )}
    </main>
  );
}
