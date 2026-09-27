"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type LoginResponse = { data?: { returnTo: string }; error?: { message: string } };

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
      router.replace(payload.data?.returnTo ?? "/");
      router.refresh();
    } catch {
      setError("Sign-in unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p><label htmlFor="username">Username</label><br /><input id="username" name="username" autoComplete="username" required /></p>
      <p><label htmlFor="password">Password</label><br /><input id="password" name="password" type="password" autoComplete="current-password" required /></p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
