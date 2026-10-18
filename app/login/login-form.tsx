export function LoginForm({ initialError = "", returnTo = "/s" }: {
  initialError?: string; returnTo?: string;
}) {
  return (
    <form className="login-form" method="post" action="/api/auth/login">
      <input type="hidden" name="returnTo" value={returnTo} />
      <p><label className="field-label" htmlFor="username">Username</label><input className="field" id="username" name="username" autoComplete="username" required /></p>
      <p><label className="field-label" htmlFor="password">Password</label><input className="field" id="password" name="password" type="password" autoComplete="current-password" required /></p>
      {initialError && <p role="alert">{initialError}</p>}
      <button className="primary-button" type="submit">Sign in</button>
    </form>
  );
}
