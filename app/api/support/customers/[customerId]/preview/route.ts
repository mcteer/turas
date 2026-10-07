import { z } from "zod";
import { supportId } from "../../../../../../lib/contracts/support";
import { supportRequest, supportRouteId } from "../../../../../../lib/server/support/http";
import { createSupportReviewPreview } from "../../../../../../lib/server/support/review";

export const dynamic = "force-dynamic";
const input = z.object({ workloadId: supportId.nullable(), recordId: supportId, revisionId: supportId }).strict();
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, true, async (actor, body) => createSupportReviewPreview(actor,
    supportRouteId((await context.params).customerId), input.parse(body)));
}
