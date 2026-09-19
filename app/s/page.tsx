import { AgentChat } from "@/app/_components/agent-chat";
import { ProtectedShell } from "@/app/_components/protected-shell";
import { getPublicAccount } from "@/lib/customer-evidence/repository";
import { getEngagementBrief } from "@/lib/demo/repository";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const customer = typeof query.customer === "string" ? getPublicAccount(query.customer) : undefined;
  const engagementId = query.engagement ?? query.research;
  const brief = typeof engagementId === "string" ? getEngagementBrief(engagementId) : undefined;
  const initialPrompt = customer ? `Review the published evidence for ${customer.name} (${customer.id}). Cite the sources and dates, distinguish documented capabilities from unknown maturity and internal engagement state, and suggest the next discovery questions.` : brief ? `${query.research ? "Prepare a cited implementation and adoption proposal" : "Review the handoff, commercial forecast and skill capacity"} for the fictional ${brief.customer.name} scenario (${brief.id}). Treat all scenario details as invented and do not approve or record a decision.` : "";
  return <ProtectedShell returnTo="/s"><AgentChat key={initialPrompt} initialPrompt={initialPrompt} sessionless /></ProtectedShell>;
}
