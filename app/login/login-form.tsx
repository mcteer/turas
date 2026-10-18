"use client";

import { useState, type FormEvent } from "react";

type LoginResponse = { data?: { returnTo: string }; error?: { message: string } };

export function LoginForm({ initialError = "", returnTo = "/" }: { initialError?: string; returnTo?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    let navigating = false;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: String(form.get("workspace") ?? "primary"),
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
          returnTo: new URLSearchParams(window.location.search).get("returnTo") ?? "/",
        }),
      });
      const payload = await response.json() as LoginResponse;
      if (!response.ok) {
        setError(response.status === 401 ? "Invalid credentials" : payload.error?.message ?? "Sign-in unavailable");
        return;
      }
      // Start one authenticated document navigation after the cookie is set.
      // A queued client refresh can otherwise redirect over the next page.
      window.location.replace(payload.data?.returnTo ?? "/");
      navigating = true;
    } catch {
      setError("Sign-in unavailable");
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  return (
    <form className="login-form" method="post" action="/api/auth/login" onSubmit={submit}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <p><label className="field-label" htmlFor="username">Username</label><input className="field" id="username" name="username" autoComplete="username" required /></p>
      <p><label className="field-label" htmlFor="password">Password</label><input className="field" id="password" name="password" type="password" autoComplete="current-password" required /></p>
      <p><label className="field-label" htmlFor="workspace">Workspace</label><select className="field" id="workspace" name="workspace" defaultValue="primary"><option value="primary">Primary Workspace</option><option value="pilot">Synthetic Pilot</option></select></p>
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
