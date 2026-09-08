let csrfToken = "";
let csrfRequest: Promise<void> | undefined;
export async function prepareCsrf() {
  if (!csrfRequest)
    csrfRequest = (async () => {
      const res = await window.fetch("/v1/admin/auth/csrf", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Unable to establish a secure session");
      csrfToken = (await res.json()).csrfToken;
    })().finally(() => {
      csrfRequest = undefined;
    });
  return csrfRequest;
}
export function setCsrf(token: string) {
  csrfToken = token;
}
export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const method = (init.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method) && !csrfToken) await prepareCsrf();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD"].includes(method)) headers.set("X-CSRF-Token", csrfToken);
  const res = await window.fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (
    res.status === 401 &&
    ![
      "/auth/login",
      "/auth/session",
      "/auth/confirm",
      "/auth/change-password",
    ].some((path) => String(input).endsWith(path))
  )
    window.dispatchEvent(new Event("admin-session-expired"));
  return res;
}
export async function api(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const res = await adminFetch(`/v1/admin${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Request failed");
  return result;
}
