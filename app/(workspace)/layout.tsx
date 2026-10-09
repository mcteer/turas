import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../lib/server/auth/csrf";
import { getServerConfig } from "../../lib/server/config";
import { staffingNavigation } from "../../lib/server/staffing/navigation";
import { AppShell } from "../_components/app-shell";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const cookieHeader = (await cookies()).toString();
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN, {
    headers: { cookie: cookieHeader },
  }));
  if (!session) redirect("/login");
  const staffing = await staffingNavigation(session);
  return <AppShell kind={session.kind} staffing={staffing} role={session.role} loginName={session.loginName}
    csrfToken={csrfTokenForSession(session.token)}>{children}</AppShell>;
}
