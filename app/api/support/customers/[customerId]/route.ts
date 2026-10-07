import { supportRequest, supportQuery, supportRouteId } from "../../../../../lib/server/support/http";
import { supportListQuerySchema } from "../../../../../lib/server/support/schema";
import { readSupportWorkspace, readSupportHistory } from "../../../../../lib/server/support/projection";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, false, async actor => {
    const customerId = supportRouteId((await context.params).customerId);
    const query = supportListQuerySchema.parse(supportQuery(request));
    const audience = query.audience ?? (actor.kind === "partner" ? "delivery" : "internal");
    if (query.recordId) return readSupportHistory(actor, customerId, query.workloadId ?? null, audience, query.recordId, query.limit, query.cursor);
    return readSupportWorkspace(actor, customerId, query.workloadId ?? null, audience, query);
  });
}
