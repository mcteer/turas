import { describe, expect, it } from "vitest";
import { publicationEvidence, researchPassages, verifiedPublicationDate } from "../../lib/server/research/specialists/solution-research/source-integrity";
import { researchPassageView } from "../../lib/server/research/specialists/research-cache/passage-view";
import { requestKey, cachePolicy } from "../../lib/server/research/specialists/research-cache/schema";
import { rateFreshness } from "../../lib/server/research/specialists/solution-research/freshness";
import { bindCustomerUpdate } from "../../lib/server/research/specialists/solution-research/customer-update";
const accountId = "11111111-1111-4111-8111-111111111111";
const source = { id:"checked-source",url:"https://example.org/story",title:"Synthetic source",
  retrievedAt:"2026-10-14T00:00:00.000Z",excerpt:"Synthetic customer uses an isolated execution product." };

describe("ported legacy specialist contracts", () => {
  it("requires explicit original publication provenance", () => {
    for (const text of ["Last updated: 2026-10-13", "2026-10-13", "Published: 2026-02-30",
      "Published: 2026-10-12\nPublished: 2026-10-13"]) expect(publicationEvidence(text)).toBeNull();
    const quote = "Published: 2026-10-13";
    expect(verifiedPublicationDate({...source,excerpt:quote,publication:{date:"2026-10-13",quote}})).toBe("2026-10-13");
    expect(verifiedPublicationDate({...source,publication:{date:"2026-10-13",quote}})).toBeNull();
  });
  it("does not turn a new check into a new claim publication date", () => {
    expect(rateFreshness({informationType:"account_status",evidenceDate:"2025-01-01",
      checkedAt:"2026-10-14T00:00:00.000Z",dateBasis:"publication"},new Date("2026-10-14"))).toMatchObject({rating:"stale",evidenceDate:"2025-01-01"});
  });
  it("retains navigation to omitted passages instead of implying absence", () => {
    const long = {...source,excerpt:Array.from({length:40},(_,i)=>`Synthetic paragraph ${i} contains separate retained content. ${"Additional retained words. ".repeat(12)}`).join("\n\n")};
    const view = researchPassageView(long);
    expect(view.remainingPassages.length).toBeGreaterThan(0);
    expect(new Set([...view.passages,...view.remainingPassages].map(p=>p.id)).size).toBe(researchPassages(long).length);
  });
  it("keys reuse by normalized scope and actual context, with legacy check windows", () => {
    const scope = {accountId,workload:"Storefront",kind:"customer-update" as const,question:"Which products are used?"};
    expect(requestKey(scope,"context-a")).toBe(requestKey({...scope,workload:" storefront ",question:"Which   products are used?"},"context-a"));
    expect(requestKey(scope,"context-a")).not.toBe(requestKey(scope,"context-b"));
    expect(cachePolicy.recheckMs).toBe(6*60*60*1000);
    expect(cachePolicy.failureMs).toBe(60*1000);
  });
  it("rejects invented passage support before a finding can be retained", () => {
    const result = bindCustomerUpdate({accountId,question:"Which products are used?",findings:[{
      claim:"Synthetic customer uses a product.",scope:"Customer workload",sourceId:source.id,
      passageId:"invented",publisherType:"customer"}],conflicts:[],unknowns:[]},[source]);
    expect(result.update.findings).toEqual([]);
    expect(result.blockers).toContain(`Unverified source passage: ${source.id}/invented.`);
  });
});
