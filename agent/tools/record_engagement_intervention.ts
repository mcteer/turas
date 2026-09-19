import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { getEngagementBrief } from "@/lib/demo/repository";
import { recordDecision } from "@/lib/decisions/repository";

export default defineTool({
  description: "Record the one permitted, synthetic, human-approved intervention. It never changes a customer system, assigns real staff, or sends communication.",
  inputSchema: z.object({ engagementId: z.literal("eng-notion-pilot"), expectedDataVersion: z.string(), idempotencyKey: z.string().uuid(), status: z.enum(["approved", "rejected", "deferred"]), rationale: z.string().trim().min(10).max(1000) }),
  outputSchema: z.discriminatedUnion("status", [
    z.object({ status: z.literal("recorded"), decision: z.object({ id: z.string(), engagementId: z.string(), status: z.enum(["approved", "rejected", "deferred"]), rationale: z.string(), createdAt: z.string() }) }),
    z.object({ status: z.enum(["denied", "conflict"]), reason: z.string() }),
    z.object({ status: z.literal("not_found") }),
  ]),
  approval: { request: always(), response: ({ responder }) => responder?.attributes.role === "owner" ? { status: "allowed" } : { status: "rejected", reason: "Only the synthetic demo owner can approve this decision." } },
  label: { start: () => "Requesting approval for the synthetic intervention", complete: (_input, output) => output.status === "recorded" ? "Fictional intervention decision recorded" : `Decision not recorded: ${output.status}` },
  async execute(input, ctx) {
    const current = ctx.session.auth.current;
    if (!current || current.principalType !== "user") return { status: "denied" as const, reason: "An authenticated synthetic reviewer is required." };
    const brief = getEngagementBrief(input.engagementId);
    if (!brief?.proposedIntervention) return { status: "not_found" as const };
    const identity = { userId: current.principalId, username: String(current.attributes.username ?? "reviewer"), role: current.attributes.role === "owner" ? "owner" as const : "reviewer" as const, environmentId: String(current.attributes.environmentId), workspaceId: String(current.attributes.workspaceId), sessionId: "eve-approved" };
    return recordDecision(identity, { engagementId: input.engagementId, expectedVersion: input.expectedDataVersion, idempotencyKey: input.idempotencyKey, status: input.status, rationale: input.rationale });
  },
});
