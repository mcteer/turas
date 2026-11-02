import {specialistResearchGuard} from '../../../../lib/server/research/specialists/discussion-research-guard';
import { searchIndependentSources } from "../../../../lib/server/research/specialists/solution-research/independent-search";
import { researchState } from "../research-state";
import { researchIdentity } from "../../../../lib/server/research/specialists/identity";
import { cacheEnabled } from "../../../../lib/server/research/specialists/research-cache/database";
import { cachedFetch } from "../../../../lib/server/research/specialists/research-cache/fetch";
import { cachePolicy, digest, normalized } from "../../../../lib/server/research/specialists/research-cache/schema";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { discoveryPurposeSchema, discoveryQueryAllowed, discoveryProvider, requiresOpenDiscovery, type DiscoverySearch } from "../../../../lib/server/research/specialists/solution-research/discovery";
import {
  publicSearchResultSchema,
  searchPublicSources,
} from "../../../../lib/server/research/specialists/solution-research/provider";
import {
  admitPublicResearch,
  publicResearchFailure,
} from "../public-research";
export const publicDiscoveryProviders = { context: searchPublicSources, gateway_exa: searchIndependentSources };
const researchTool = defineTool({
  description:
    "Discover public technical and adoption evidence through context.dev for official sources and independent Exa search via AI Gateway for employee/practitioner discovery. Use public company/product names and product/version/practice terms. Never send private customer notes, internal identifiers, commercial terms or secrets. Set purpose employee_testimony for employee talks/webinars/engineering accounts and practitioner_experience for firsthand product-user/process reports; those searches must have no site: restriction. Record returned searchIds for coverage. Official discovery that is empty or unavailable gets at most one independent-provider fallback per task. Returns up to ten bounded discovery hints; snippets are not verified page evidence. No writes.",
  inputSchema: z.object({ query: z.string().trim().min(3).max(300).describe("For initial employee/practitioner discovery use only the public customer/product plus engineer conference presentation or firsthand workflow experience. Do not anchor to the platform vendor, known speakers, old dates or assumed lifecycle stage. Use contradiction_check to seek alternative lifecycle claims."), purpose: discoveryPurposeSchema.default("official") }).strict(),
  outputSchema: z.object({
    status: z.enum(["found", "empty", "denied", "unavailable"]),
    results: z.array(publicSearchResultSchema).max(10),
    reason: z.string(),
    searchId: z.string(),
    purpose: discoveryPurposeSchema,
    provider: z.enum(["context", "gateway_exa"]),
    fallbackFrom: z.literal("context").optional(),
    fallbackReason: z.enum(["empty", "unavailable"]).optional(),
    checkedAt: z.iso.datetime().optional(),
    cached: z.boolean().optional(),
  }),
  async execute({ query, purpose }, ctx) {
    const state = researchState.get();
    const provider = discoveryProvider(state.discoverySearches ?? [], purpose, ctx.callId, state.mode);
    const previous = state.discoverySearches?.find(search => search.searchId === ctx.callId);
    let trace: { searchId: string; purpose: DiscoverySearch["purpose"]; provider: "context" | "gateway_exa"; fallbackFrom?: "context"; fallbackReason?: "empty" | "unavailable" } = {
      searchId: ctx.callId, purpose, provider, ...(previous?.fallbackFrom ? { fallbackFrom: previous.fallbackFrom, fallbackReason: previous.fallbackReason } : {}),
    };
    if (!discoveryQueryAllowed(query, purpose))
      return { ...trace, status: "denied" as const, results: [], reason: "Employee and practitioner discovery must search beyond site-restricted company pages. Use public company/product names with role, talk, webinar, use-case or experience terms, without site: filters." };
    const denied = await admitPublicResearch(
      ctx.session.auth.current,
      ctx.callId,
      "search",
      { query },
      ctx.abortSignal,
    );
    if (denied)
      return { ...trace, status: "denied" as const, results: [], reason: denied };
    const record = (status: DiscoverySearch["status"], urls: string[], metadata: { checkedAt?: string; cached?: boolean } = {}) => researchState.update(state => ({
      ...state, discoverySearches: [...(state.discoverySearches ?? []).filter(search => search.searchId !== ctx.callId), { ...trace, ...metadata, status, urls }],
    }));
    // Reserve the provider attempt before awaiting so parallel calls share the cap.
    record("unavailable", []);
    const claimFallback = (reason: "empty" | "unavailable") => {
      if (ctx.abortSignal.aborted || requiresOpenDiscovery(purpose) || researchState.get().discoverySearches?.some(search => search.fallbackFrom === "context" && search.searchId !== ctx.callId)) return false;
      trace = { ...trace, provider: "gateway_exa", fallbackFrom: "context", fallbackReason: reason };
      // Claim before awaiting: parallel empty searches cannot fan out into retries.
      record("unavailable", []);
      return true;
    };
    try {
      const identity = await researchIdentity(ctx.session.auth.current,ctx.session.parent?{parentSessionId:ctx.session.parent.sessionId,workerSessionId:ctx.session.id}:undefined);
      const search = async (selected: "context" | "gateway_exa") => {
        const run = async () => publicDiscoveryProviders[selected](query, ctx.abortSignal,await specialistResearchGuard(identity,ctx.callId));
        const cached = cacheEnabled() && identity ? await cachedFetch(identity,
          "search:" + digest(JSON.stringify([identity.userId, state.context?.accountId, selected, purpose, normalized(query)])), z.array(publicSearchResultSchema).max(10), run, ctx.abortSignal,
          { notBefore: state.refreshAfter ? new Date(state.refreshAfter) : undefined, ttl: results => results.length ? cachePolicy.recheckMs : cachePolicy.emptySearchMs }) : null;
        return { results: cached ? cached.value : await run(), metadata: { checkedAt: cached?.checkedAt ?? new Date().toISOString(), cached: cached?.hit ?? false } };
      };
      let attempt: Awaited<ReturnType<typeof search>>;
      try { attempt = await search(provider); }
      catch (error) {
        if (provider !== "context" || !claimFallback("unavailable")) throw error;
        attempt = await search("gateway_exa");
      }
      if (!attempt.results.length && trace.provider === "context" && claimFallback("empty")) attempt = await search("gateway_exa");
      const { results, metadata } = attempt;
      const status = results.length ? "found" as const : "empty" as const;
      record(status, results.map(result => result.url), metadata);
      return {
        ...trace, ...metadata, status,
        results,
        reason:
          "Discovery hints only. Read relevant primary sources before citing them. Empty or unavailable official discovery receives at most one independent-provider fallback per task; it is not evidence that the information does not exist. Search the user's material topic directly before declaring it unknown, and use returned URLs instead of guessed paths.",
      };
    } catch (error) {
      record("unavailable", []);
      return {
        ...trace,
        status: "unavailable" as const,
        results: [],
        reason: publicResearchFailure(error, ctx.callId, ctx.abortSignal),
      };
    }
  },
});

export default defineDynamic(() => researchState.get().finalized ? null : researchTool);
