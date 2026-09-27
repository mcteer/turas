import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }}>
      <p>Turas</p>
      <h1>Sign in</h1>
      <p>Use a configured demo account to enter the synthetic workspace.</p>
      <LoginForm />
    </main>
  );
}
