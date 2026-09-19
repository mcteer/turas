import { AgentChat } from "@/app/_components/agent-chat";
import { AppShell } from "@/app/_components/app-shell";
import { requirePageIdentity } from "@/lib/auth/next";
import { getConversationBySession } from "@/lib/conversations/repository";
import { notFound } from "next/navigation";

export default async function SessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;
  const returnTo = `/s/${encodeURIComponent(sessionId)}`;
  const identity = await requirePageIdentity(returnTo);
  if (!(await getConversationBySession(identity, sessionId))) notFound();

  return (
    <AppShell role={identity.role} username={identity.username}>
      <AgentChat sessionId={sessionId} />
    </AppShell>
  );
}
