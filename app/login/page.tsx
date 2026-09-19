import { LoginForm } from "./login-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
  const loginError = error === "invalid" || error === "unavailable" ? error : undefined;
  return <main className="flex min-h-dvh items-center justify-center p-6"><LoginForm error={loginError} returnTo={returnTo} /></main>;
}
