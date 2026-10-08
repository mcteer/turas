import { supportRequest, supportRouteId } from "../../../../../lib/server/support/http";
import { readSupportReceipt } from "../../../../../lib/server/support/commands";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) {
  return supportRequest(request, false, async actor => readSupportReceipt(actor,
    supportRouteId((await context.params).requestKey)));
}
