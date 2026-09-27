import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../../../lib/server/auth/csrf";
import { getServerConfig } from "../../../../lib/server/config";
import { AccessEditor } from "../../../../app/_components/access-editor";

export default async function AccessPage() {
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN, {
    headers: { cookie: (await cookies()).toString() },
  }));
  if (!session || session.kind !== "internal" || session.role !== "admin") notFound();
  return <AccessEditor csrfToken={csrfTokenForSession(session.token)} />;
}
