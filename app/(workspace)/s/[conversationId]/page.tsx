import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../../../lib/server/auth/csrf";
import { getServerConfig } from "../../../../lib/server/config";
import { getOwnedConversation } from "../../../../lib/server/conversations/repository";
import { query } from "../../../../lib/server/db/client";
import { AgentChat } from "../../../_components/agent-chat";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN, {
    headers: { cookie: (await cookies()).toString() },
  }));
  if (!session) notFound();
  const { conversationId } = await params;
  let conversation;
  try { conversation = await getOwnedConversation(session, conversationId); }
  catch { notFound(); }
  const customer = await query<{ display_name: string; synthetic: boolean }>(
    "SELECT display_name, synthetic FROM customer_references WHERE id = $1", [conversation.customerId]);
  if (!customer.rows[0]) notFound();
  return <AgentChat conversationId={conversation.id} nativeSessionId={conversation.eveSessionId}
    bindingState={conversation.bindingState} customerName={customer.rows[0].display_name}
    synthetic={customer.rows[0].synthetic} csrfToken={csrfTokenForSession(session.token)}
    customerId={conversation.customerId} contextStatus={conversation.contextStatus ?? "historical"} />;
}
