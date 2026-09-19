import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function LoginForm({ error, returnTo }: { error?: "invalid" | "unavailable"; returnTo?: string }) {
  return <form action="/api/auth/login" className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-7 shadow-sm" method="post">
    <div className="@container"><h1 className="whitespace-nowrap font-medium text-[min(2.25rem,9cqi)] tracking-tighter">Turas Command Center</h1></div>
    {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error === "unavailable" ? "Sign-in is temporarily unavailable. Please try again. If it continues, contact the Turas owner to check the deployment configuration and database connection." : "Those credentials were not accepted."}</p> : null}
    <input name="returnTo" type="hidden" value={returnTo ?? "/portfolio"} />
    <label className="block space-y-1.5 text-sm font-medium">Username<Input autoComplete="username" name="username" required /></label>
    <label className="block space-y-1.5 text-sm font-medium">Password<Input autoComplete="current-password" name="password" required type="password" /></label>
    <Button className="w-full" type="submit">Sign in</Button>
  </form>;
}
