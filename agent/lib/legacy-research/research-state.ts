import { defineState } from "eve/context";
import type { RequestTicket, RequestScope } from "../../../lib/server/research/specialists/research-cache/schema";
import type { DiscoverySearch } from "../../../lib/server/research/specialists/solution-research/discovery";
import type {
  CustomerResearchContext,
  ResearchSource,
} from "../../../lib/server/research/specialists/solution-research/schema";

export const researchState = defineState(
  "solution-research.v1",
  (): {
    context: CustomerResearchContext | null;
    sources: ResearchSource[];
    calls: Record<string, "search" | "scrape">;
    startedAt: number;
    inheritedSourceCount?: number;
    customerRecon?: { accountId: string; researchId: string; checkedAt: string; blockers: string[]; conflicts?: string[]; unknowns?: string[] };
    finalized?: boolean;
    customerUpdateRevisionCallId?: string;
    solutionRevisionCallId?: string;
    discoverySearches?: DiscoverySearch[];
    mode?: "solution" | "customer-update" | "best-practices";
    requestTicket?: RequestTicket;
    requestScope?: RequestScope;
    refreshAfter?: string;
  } => ({ context: null, sources: [], calls: {}, startedAt: Date.now() }),
);
