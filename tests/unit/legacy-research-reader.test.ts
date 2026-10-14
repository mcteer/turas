import {describe,it,expect,vi,afterEach} from "vitest";
import {readPublicSource} from "../../lib/server/research/provider";
import {researchPassages,publicationEvidence,verifiedPublicationDate} from "../../lib/server/research/source-integrity";
import {researchPassageView} from "../../lib/server/research/passage-view";
import {focusSourcePassages} from "../../lib/server/research/source-focus";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("legacy rendered research and retained passage behavior",()=>{
 it("uses the legacy rendered-page endpoint, preserves the actual provider receipt and refuses partial DOM content",async()=>{
  vi.stubEnv("CONTEXT_DEV_API_KEY","synthetic-test");
  const payload={success:true,url:"https://example.org/customer",markdown:"# Synthetic customer\n"+"Documented Next.js production deployment. ".repeat(5),metadata:{title:"Synthetic customer"}};
  const raw=JSON.stringify(payload);const fetcher=vi.fn(async()=>new Response(raw));vi.stubGlobal("fetch",fetcher);
  const result=await readPublicSource(payload.url,new AbortController().signal);
  const request=fetcher.mock.calls[0] as unknown as [URL,RequestInit];
  expect(request[0].pathname).toBe("/v1/web/scrape/markdown");expect(request[0].searchParams.get("maxAgeMs")).toBe("0");
  expect(result.source.excerpt).toBe(payload.markdown);expect(result.rawBody.toString()).toBe(raw);
  fetcher.mockImplementation(async()=>new Response(JSON.stringify({...payload,finalDOMState:"still-loading"})));
  await expect(readPublicSource(payload.url,new AbortController().signal)).rejects.toMatchObject({reason:"invalid_response"});
 });
 it("preserves legacy date evidence and never borrows retrieval time",()=>{
  for(const excerpt of ["Last updated: 2026-09-18","2026-09-18","Copyright 2026","Published: 2026-02-30","Published: 09/10/2026","Published: 2026-09-18\nPublished: 2026-09-19"])expect(publicationEvidence(excerpt)).toBe(null);
  const quote="**Published: 2026-09-18**";const publication=publicationEvidence(quote);expect(publication).toEqual({date:"2026-09-18",quote});
  const source={id:"source",url:"https://example.org",title:"Synthetic",excerpt:quote,retrievedAt:"2026-09-20T00:00:00Z",publication};
  expect(verifiedPublicationDate(source)).toBe("2026-09-18");expect(verifiedPublicationDate({...source,excerpt:"No dated source label"})).toBe(null);
 });
 it("retains original passage IDs and exposes omitted text rather than treating truncation as absence",()=>{
  const excerpt="Synthetic title\n"+"Unrelated dated release detail. ".repeat(400)+"\nSeptember 15, 2026\nWorkers use Vercel Sandbox in this workload.\n";
  const source={id:"source",url:"https://example.org",title:"Synthetic",excerpt,retrievedAt:"2026-09-20T00:00:00Z",focusTerm:"Sandbox"};
  const matches=focusSourcePassages(source,"Sandbox");expect(matches).toHaveLength(1);expect(matches[0].precedingDateHeading).toBe("September 15, 2026");
  const view=researchPassageView(source,matches);expect(view.passages.some(p=>p.text.includes("Vercel Sandbox"))).toBe(true);expect(view.remainingPassages.length).toBeGreaterThan(0);
  expect(researchPassages({...source,retainedPassages:[{id:"original:p9",text:"Workers use Vercel Sandbox in this workload."}]})).toEqual([{id:"original:p9",text:"Workers use Vercel Sandbox in this workload."}]);
 });
});
