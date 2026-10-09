import {saveExpansionSuggestion} from "../../../../../../lib/server/expansion/suggestions";
import { expansionRequest, expansionRouteId } from "../../../../../../lib/server/expansion/http";
import { decideExpansionHypothesis } from "../../../../../../lib/server/expansion/review";
import { expansionCommandSchema } from "../../../../../../lib/server/expansion/schema";
import { saveExpansionProposal } from "../../../../../../lib/server/expansion/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ customerId: string }> }) {
  return expansionRequest(request, true, async (actor, body) => {
    const customerId = expansionRouteId((await context.params).customerId), command = expansionCommandSchema.parse(body);
    return { receipt: command.operation === "decide_hypothesis" ? await decideExpansionHypothesis(actor, customerId, command) : command.operation === "save_suggestion" ? await saveExpansionSuggestion(actor,customerId,command) : await saveExpansionProposal(actor, customerId, command), refreshRequired: true };
  });
}
