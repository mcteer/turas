import { AgentChat } from "@/app/_components/agent-chat";
import { ProtectedShell } from "@/app/_components/protected-shell";

export default function NewSessionPage() {
  return <ProtectedShell returnTo="/s"><AgentChat sessionless /></ProtectedShell>;
}
