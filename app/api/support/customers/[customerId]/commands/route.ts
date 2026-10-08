import { HttpFailure } from "../../../../../../lib/contracts/http";
import { supportRequest, supportRouteId } from "../../../../../../lib/server/support/http";
import { supportCommandSchema } from "../../../../../../lib/server/support/schema";
import { saveSupportProposal } from "../../../../../../lib/server/support/service";
import { decideSupportRevision } from "../../../../../../lib/server/support/review";
import { saveSupportSuggestion } from "../../../../../../lib/server/support/suggestions";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return supportRequest(request, true, async (actor, body) => {
    const customerId = supportRouteId((await context.params).customerId), command = supportCommandSchema.parse(body);
    if (command.operation === "save_assessment" || command.operation === "save_action")
      return { receipt: await saveSupportProposal(actor, customerId, command), refreshRequired: true };
    if (command.operation === "review_revision" || command.operation === "withdraw_record")
      return { receipt: await decideSupportRevision(actor, customerId, command), refreshRequired: true };
    if (command.operation === "save_suggestion")
      return { receipt: await saveSupportSuggestion(actor, customerId, command), refreshRequired: true };
    throw new HttpFailure(422, "unsupported_action", "A completed support advice attempt is required");
  });
}
