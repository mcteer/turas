import { describe, expect, it } from "vitest";
import { researchPreviewInputSchema } from "../../lib/contracts/research";
import { renderResearchQueries } from "../../lib/server/research/policy";
import { discoverContext, discoveryInScope } from "../../lib/server/research/discovery";

const customerId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const common = { idempotencyKey: "research-preview",customerId,conversationId,submittedUrls: [] };

describe("bounded public research preview", () => {
  it("renders exact versioned queries for recon and practices", () => {
    const recon = researchPreviewInputSchema.parse({ ...common,mode: "recon",
      publicName: "Public Example",publicDomain: "public.example.org",identityConfirmed: true });
    expect(renderResearchQueries(recon)).toEqual([
      'site:public.example.org "Public Example" company products',
      '"Public Example" "public.example.org" public profile',
    ]);
    const practices = researchPreviewInputSchema.parse({ ...common,mode: "practices",
      product: "Vercel",version: "2026",topic: "build cache" });
    expect(renderResearchQueries(practices)[0]).toBe(
      '"Vercel" "2026" "build cache" official documentation');
  });

  it("rejects likely secret or private egress terms and limits fit to no network queries", () => {
    const unsafe = researchPreviewInputSchema.parse({ ...common,mode: "practices",
      product: "Vercel",version: "2026",topic: "api_key=hidden-value" });
    expect(() => renderResearchQueries(unsafe)).toThrow();
    const internal = researchPreviewInputSchema.parse({ ...common,mode: "recon",
      publicName: "Public Example",publicDomain: "intranet.local",identityConfirmed: true });
    expect(() => renderResearchQueries(internal)).toThrow();
    const fit = researchPreviewInputSchema.parse({ ...common,mode: "fit",
      evidenceReceiptIds: [customerId],submittedUrls: [] });
    expect(renderResearchQueries(fit)).toEqual([]);
    expect(researchPreviewInputSchema.safeParse({ ...fit,submittedUrls: [
      "https://public.example.org" ] }).success).toBe(false);
  });

  it("sends only the admitted query for Context.dev URL discovery", async () => {
    const seen: unknown[] = [];
    const result = await discoverContext('"Vercel" "2026" "build cache" official documentation',
      "synthetic-key",{ transport: async (request) => {
        seen.push(await request.json());
        expect(request.url).toBe("https://api.context.dev/v1/web/search");
        expect(request.headers.get("authorization")).toBe("Bearer synthetic-key");
        return Response.json({ request_id: "synthetic-provider-receipt",
          query: '"Vercel" "2026" "build cache" official documentation',results: [
          { url: "https://vercel.com/docs/builds",title: "Build docs" },
          { url: "https://127.0.0.1/private",title: "Blocked" },
        ] });
      } });
    expect(seen).toEqual([{ query: '"Vercel" "2026" "build cache" official documentation',
      numResults: 10,markdownOptions: { enabled: false },
      highlightsOptions: { enabled: false } }]);
    expect(result.results.map((item) => item.url)).toEqual(["https://vercel.com/docs/builds"]);
    expect(discoveryInScope("recon",{ publicDomain: "public.example.org" },
      "https://other.example.org/")).toBe(false);
  });
});
