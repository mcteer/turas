import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { hasBoundResearchAttempt } from "../../lib/server/research/instruction-scope";

const priorRunReadInstructions = defineInstructions({
  content: `When asked about an earlier research run, use read_research if it is
available to verify the current state and eligible completed findings. If the
read is unavailable or denied, explain the gap; do not invent access or findings.
For a recon or practices finding you use, copy its exact [sourceRevisionId]
from checkedCitationPresentation beside the claim or checked excerpt. A source
title, URL or quotation alone is not the Turas-renderable source citation.
Run, request and observation IDs are workflow references, not source citations;
receipt.retainedCitationIds must not be substituted for finding.sourceRevisionId.
Use only the eligible findings returned by this read. Copy checkedExcerpt without
shortening; a null excerpt does not authorize an invented or joined quotation.
For fit comparisons, preserve the selected evidence's retrieval citationId
semantics; a prior-run receipt cannot manufacture missing fit evidence.
State cancelled, partial, failed or unconfirmed honestly; completed findings do
not mean the run completed. Keep source dates, quality and scope caveats distinct
from the new check date. Summarize the state, one checked citation and remaining
gap in at most 80 words. Do not restart or launch research to summarize history.
This guidance applies only when reading an earlier run. It neither admits a new
research request nor replaces ordinary automatic research for other questions.`,
});

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    return feature?.kind === "normal" &&
      !await hasBoundResearchAttempt(ctx.session.auth.current) ? priorRunReadInstructions : null;
  },
} });
