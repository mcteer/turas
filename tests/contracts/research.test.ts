import { describe, expect, it } from "vitest";
import { researchPreviewInputSchema,researchPublicSubjectSchema,
  researchRunReceiptSchema } from "../../lib/contracts/research";
import { renderResearchQueries } from "../../lib/server/research/policy";
import { discoverContext, discoveryInScope } from "../../lib/server/research/discovery";

const customerId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const common = { idempotencyKey: "research-preview",customerId,conversationId,submittedUrls: [] };

describe("bounded public research preview", () => {
  it("renders exact versioned queries for recon and practices", () => {
    const recon = researchPreviewInputSchema.parse({ ...common,mode: "recon",
      publicName: "Public Example",publicDomain: "public.example.org",identityConfirmed: true });
    if (recon.mode !== "recon") throw new Error("Expected recon preview");
    expect(renderResearchQueries(recon)).toEqual([
      '"Public Example" product releases "public.example.org"',
      '"Public Example" engineer conference presentation',
      '"Public Example" firsthand workflow experience',
      '"Public Example" Vercel customer stories documentation products workloads',
    ]);
    const practices = researchPreviewInputSchema.parse({ ...common,mode: "practices",
      product: "Vercel",version: "2026",topic: "build cache" });
    expect(renderResearchQueries(practices)[0]).toBe(
      '"Vercel" "2026" "build cache" official documentation');
    const subject = researchPublicSubjectSchema.parse({
      version: "public-research-subject-v1",basis: "user_confirmed_scope",mode: "recon",
      publicName: recon.publicName,publicDomain: recon.publicDomain,
    });
    expect(subject).toMatchObject({ publicName: "Public Example",basis: "user_confirmed_scope" });
    const receipt = { version: "research-v1",id: customerId,requestId: conversationId,
      state: "partial",mode: "recon",startedAt: null,deadline: "2026-10-29T12:00:00Z",
      safeReasonCode: null,searchesUsed: 1,fetchesUsed: 1,retainedCitationIds: [] };
    expect(researchRunReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(researchRunReceiptSchema.parse({ ...receipt,publicSubject: subject }).publicSubject).toEqual(subject);
    expect(researchRunReceiptSchema.safeParse({ ...receipt,publicSubject: {
      version: "public-research-subject-v1",basis: "user_confirmed_scope",mode: "fit",
    } }).success).toBe(false);
    expect(researchPublicSubjectSchema.safeParse({ ...subject,customerId }).success).toBe(false);
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
