import { LoginForm } from "./login-form";
import { BrandMark } from "../_components/ui-icon";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; returnTo?: string; workspace?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="login-page"><div className="login-card">
      <p className="login-brand"><BrandMark />Turas</p>
      <h1>Sign in</h1>
      <p>Use your configured account to enter an assigned workspace.</p>
      <LoginForm initialError={params.error === "invalid" ? "Invalid credentials" : params.error === "unavailable" ? "Sign-in is temporarily unavailable. Please try again." : ""}
        pilotEnabled={process.env.TURAS_PILOT_LOGIN_ENABLED === "1"}
        workspace={params.workspace === "pilot" ? "pilot" : "primary"}
        returnTo={typeof params.returnTo === "string" && params.returnTo.length <= 500 ? params.returnTo : "/s"} />
      <p className="login-footnote">Customer knowledge. Thoughtful delivery.</p>
    </div></main>
  );
}
