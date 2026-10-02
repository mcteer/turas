import { LoginForm } from "./login-form";
import { BrandMark } from "../_components/ui-icon";

export default function LoginPage() {
  return (
    <main className="login-page"><div className="login-card">
      <p className="login-brand"><BrandMark />Turas</p>
      <h1>Sign in</h1>
      <p>Use a configured demo account to enter the synthetic workspace.</p>
      <LoginForm />
      <p className="login-footnote">Customer knowledge. Thoughtful delivery.</p>
    </div></main>
  );
}
