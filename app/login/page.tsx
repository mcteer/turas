import { LoginForm } from "./login-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
  return <main className="flex min-h-dvh items-center justify-center p-6"><LoginForm error={error === "invalid"} returnTo={returnTo} /></main>;
}
