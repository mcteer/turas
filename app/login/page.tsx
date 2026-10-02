import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-page"><div className="login-card">
      <p className="login-brand">Turas</p>
      <h1>Sign in</h1>
      <p>Use a configured demo account to enter the synthetic workspace.</p>
      <LoginForm />
    </div></main>
  );
}
