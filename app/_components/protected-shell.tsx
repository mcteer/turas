import { AppShell } from "./app-shell";
import { requirePageIdentity } from "@/lib/auth/next";
export async function ProtectedShell({ children, returnTo }: { children: React.ReactNode; returnTo: string }) { const identity = await requirePageIdentity(returnTo); return <AppShell role={identity.role} username={identity.username}>{children}</AppShell>; }
