export function LoginForm({ initialError = "", returnTo = "/s", workspace = "primary", pilotEnabled = false }: {
  initialError?: string; returnTo?: string; workspace?: "primary" | "pilot"; pilotEnabled?: boolean;
}) {
  return (
    <form className="login-form" method="post" action="/api/auth/login">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p><label className="field-label" htmlFor="username">Username</label><input className="field" id="username" name="username" autoComplete="username" required /></p>
      <p><label className="field-label" htmlFor="password">Password</label><input className="field" id="password" name="password" type="password" autoComplete="current-password" required /></p>
      {pilotEnabled && <p><label className="field-label" htmlFor="workspace">Workspace</label><select className="field" id="workspace" name="workspace" defaultValue={workspace}><option value="primary">Primary Workspace</option><option value="pilot">Synthetic Pilot</option></select></p>}
      {initialError && <p role="alert">{initialError}</p>}
      <button className="primary-button" type="submit">Sign in</button>
    </form>
  );
}
