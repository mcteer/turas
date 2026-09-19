import { AgentChat } from "@/app/_components/agent-chat";
import { ProtectedShell } from "@/app/_components/protected-shell";

export default async function SessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ProtectedShell returnTo={`/s/${encodeURIComponent(sessionId)}`}><AgentChat sessionId={sessionId} /></ProtectedShell>;
}
