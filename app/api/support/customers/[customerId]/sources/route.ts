import { z } from "zod";
import { supportId } from "../../../../../../lib/contracts/support";
import { supportRequest, supportRouteId } from "../../../../../../lib/server/support/http";
import { searchSupportEvidence } from "../../../../../../lib/server/support/sources";

export const dynamic = "force-dynamic";
const input = z.object({ workloadId: supportId.nullable(), audience: z.enum(["internal", "delivery"]),
  query: z.string().trim().min(1).max(500) }).strict();
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, true, async (actor, body) => {
    const value = input.parse(body);
    return searchSupportEvidence(actor, supportRouteId((await context.params).customerId), value.workloadId, value.audience, value.query);
  });
}
