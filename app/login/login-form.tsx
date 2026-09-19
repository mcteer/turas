import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function LoginForm({ error, returnTo }: { error: boolean; returnTo?: string }) {
  return <form action="/api/auth/login" className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-7 shadow-sm" method="post">
    <div className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Turas Command Center</p><h1 className="text-2xl font-semibold tracking-tight">Sign in</h1><p className="text-sm text-muted-foreground">Sign in with the reviewer credentials supplied for this isolated demonstration.</p></div>
    {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">Those credentials were not accepted.</p> : null}
    <input name="returnTo" type="hidden" value={returnTo ?? "/portfolio"} />
    <label className="block space-y-1.5 text-sm font-medium">Username<Input autoComplete="username" name="username" required /></label>
    <label className="block space-y-1.5 text-sm font-medium">Password<Input autoComplete="current-password" name="password" required type="password" /></label>
    <Button className="w-full" type="submit">Sign in</Button>
  </form>;
}
