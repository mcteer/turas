import { cookies } from "next/headers";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../../lib/server/auth/csrf";
import { getServerConfig } from "../../../lib/server/config";
import { NewConversation } from "../../_components/new-conversation";

export default async function NewConversationPage() {
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN, {
    headers: { cookie: (await cookies()).toString() },
  }));
  if (!session) return null;
  return <NewConversation csrfToken={csrfTokenForSession(session.token)} />;
}
