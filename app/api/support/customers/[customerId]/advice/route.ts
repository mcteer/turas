import { z } from "zod";
import { supportId } from "../../../../../../lib/contracts/support";
import { supportRequest, supportRouteId, supportQuery } from "../../../../../../lib/server/support/http";
import { prepareSupportAdvice } from "../../../../../../lib/server/support/advisory";
import { readSupportAdviceStatus } from "../../../../../../lib/server/support/advisory-status";
import { HttpFailure } from "../../../../../../lib/contracts/http";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, true, async (actor, body) => prepareSupportAdvice(actor,
    supportRouteId((await context.params).customerId), body));
}
export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, false, async actor => {
    const customerId = supportRouteId((await context.params).customerId);
    const query = z.object({ attemptId: supportId }).strict().parse(supportQuery(request));
    const status = await readSupportAdviceStatus(actor, query.attemptId);
    // Status is private; its bound customer is independently checked by the
    // route rather than trusting an attempt ID to select a different customer.
    const { withTransaction } = await import("../../../../../../lib/server/db/client");
    const matches = await withTransaction(async db => (await db.query("SELECT 1 FROM support_advice_bindings WHERE conversation_id=$1 AND customer_id=$2", [status.conversationId, customerId])).rowCount);
    if (!matches) throw new HttpFailure(404, "not_found", "Support advice unavailable");
    return status;
  });
}
