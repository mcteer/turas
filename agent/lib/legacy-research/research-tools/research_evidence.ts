import { sourceFreshness } from "../../../../lib/server/research/specialists/solution-research/freshness-report";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { researchState } from "../research-state";
import { sourceSchema } from "../../../../lib/server/research/specialists/solution-research/schema";
import { discoverySearchSchema } from "../../../../lib/server/research/specialists/solution-research/discovery";
import { researchLimits } from "../../../../lib/server/research/specialists/solution-research/evidence";
const researchTool = defineTool({
  description:
    "List verified page IDs and remaining research call budgets. Page excerpts are already returned by read_public_research_source; use their exact short quotations without retrieving them again. Search snippets are not verified page evidence.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    sources: z.array(sourceSchema).max(20),
    discoverySearches: z.array(discoverySearchSchema).max(8),
    searchesRemaining: z.number(),
    pagesRemaining: z.number(),
  }),
  toModelOutput(output) {
    return {
      type: "json",
      value: {
        freshness: sourceFreshness(output.sources),
        sources: output.sources.map(({ id, url, title, retrievedAt }) => ({
          id, url, title, retrievedAt,
        })),
        searchesRemaining: output.searchesRemaining,
        pagesRemaining: output.pagesRemaining,
        discoverySearches: output.discoverySearches,
      },
    };
  },
  execute() {
    const state = researchState.get();
    const calls = Object.values(state.calls);
    return {
      sources: state.sources,
      discoverySearches: state.discoverySearches ?? [],
      searchesRemaining: researchLimits(state.mode).search - calls.filter((c) => c === "search").length,
      pagesRemaining: researchLimits(state.mode).scrape - calls.filter((c) => c === "scrape").length,
    };
  },
});

export default defineDynamic({
  events: {
    "step.started": () => researchState.get().finalized ? null : researchTool,
  },
});
