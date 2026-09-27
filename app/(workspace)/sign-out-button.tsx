"use client";

import { useState } from "react";

export function SignOutButton({ csrfToken }: { csrfToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) throw new Error("Sign-out unavailable");
      window.location.assign("/login");
    } catch {
      setError("Sign-out unavailable");
      setBusy(false);
    }
  }
  return <><button type="button" disabled={busy} onClick={signOut}>Sign out</button>{error && <span role="alert">{error}</span>}</>;
}
