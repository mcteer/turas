import { AgentChat } from "@/app/_components/agent-chat";
import { ProtectedShell } from "@/app/_components/protected-shell";

export default function Page() {
  return <ProtectedShell returnTo="/"><AgentChat /></ProtectedShell>;
}
