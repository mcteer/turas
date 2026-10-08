import { HttpFailure } from "../../contracts/http";
import type { SupportAction } from "../../contracts/support";
import type { SupportSource } from "./schema";

/** Human review of a judgment cannot turn an unreviewed route/link into a fact.
 * This module has no HTTP, mail or ticket client and never unfurls references. */
export function validateSupportEscalationAcceptance(content: SupportAction, refs: readonly SupportSource[]) {
  if (content.escalation?.routeKnown && !refs.length)
    throw new HttpFailure(422, "route_evidence_required", "Review supporting route facts before accepting a known route");
  if (content.handoff && !content.handoff.supportingSourceKeys.length)
    throw new HttpFailure(422, "handoff_evidence_required", "Human-reported links require accepted supporting context");
}
