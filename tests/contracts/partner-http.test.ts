import { describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { GET,POST } from "../../app/api/partners/requests/[requestId]/route";
import { withPartnerDatabase } from "../fixtures/partners/environment";
import { partnerTestActors } from "../fixtures/partners/seed";
import { partnerHttpRequest } from "../fixtures/partners/ui";
import { GET as workspaceGET } from "../../app/api/partners/workspace/route";
import { GET as engagementsGET } from "../../app/api/partners/customers/[customerId]/engagements/route";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import {partnerGuideFixture,partnerCommandEnvelope} from "../fixtures/partners/guides";
import {GET as guidesGET} from "../../app/api/partners/guides/route";
import {GET as guideGET} from "../../app/api/partners/guides/[guideId]/route";
import {GET as evidenceGET} from "../../app/api/partners/evidence/route";
import {GET as membersGET} from "../../app/api/partners/customers/[customerId]/members/route";
import {GET as assignmentsGET} from "../../app/api/partners/assignments/route";
import {GET as assignmentGET} from "../../app/api/partners/assignments/[assignmentId]/route";
import {POST as commandsPOST} from "../../app/api/partners/commands/route";
import {POST as previewsPOST} from "../../app/api/partners/previews/route";
import {partnerHash} from "../../lib/server/partners/repository";

describe("partner HTTP boundary",()=>{
 it("fences every scoped read and the roster, exposes only the current actor namespace, and caches neither success nor failure",async()=>{
  const f=await partnerGuideFixture("Synthetic HTTP guide",true),query=`customerId=${DEMO_IDS.sharedCustomer}&engagementId=${f.baseline.engagementId}`;
  const requests=[()=>guidesGET(partnerHttpRequest(f.partner,"/api/partners/guides?"+query)),()=>guideGET(partnerHttpRequest(f.partner,"/api/partners/guides/"+f.guideId),{params:Promise.resolve({guideId:f.guideId})}),()=>evidenceGET(partnerHttpRequest(f.partner,"/api/partners/evidence?"+query)),()=>assignmentsGET(partnerHttpRequest(f.partner,"/api/partners/assignments?customerId="+DEMO_IDS.sharedCustomer))];
  for(const request of requests){const response=await request();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");const data=(await response.json()).data;expect(data.actorPrincipalId).toBe(f.partner.principalId);expect(data.actorMembershipId).toBe(f.partner.membershipId);expect(data.commandNamespace).toMatch(/^[a-f0-9]{64}$/);expect(data).not.toHaveProperty("total");expect(JSON.stringify(data)).not.toContain("PRIVATE_B_SOURCE");}
  for(const actor of [f.partner,f.author])expect((await membersGET(partnerHttpRequest(actor,`/api/partners/customers/${DEMO_IDS.sharedCustomer}/members`),{params:Promise.resolve({customerId:DEMO_IDS.sharedCustomer})})).status).toBe(403);
  expect((await membersGET(partnerHttpRequest(f.reviewer,`/api/partners/customers/${DEMO_IDS.sharedCustomer}/members?limit=1`),{params:Promise.resolve({customerId:DEMO_IDS.sharedCustomer})})).status).toBe(200);
  const id=randomUUID(),hidden=await assignmentGET(partnerHttpRequest(f.partner,"/api/partners/assignments/"+id),{params:Promise.resolve({assignmentId:id})});expect(hidden.status).toBe(404);expect(hidden.headers.get("cache-control")).toContain("no-store");
  expect((await guidesGET(partnerHttpRequest(f.partner,"/api/partners/guides?"+query+"&environmentId=PRIVATE_ENV"))).status).toBe(422);
 });
 it("enforces strict commands and previews, same-origin CSRF, body bounds and the new-work pause",async()=>{
  const f=await partnerGuideFixture("Synthetic HTTP boundaries",true),input={...partnerCommandEnvelope(),action:"guide.retire",guideId:f.guideId,revisionId:f.revisionId,contentDigest:partnerHash(f.content),expectedVersion:3,rationale:"Synthetic reviewed retirement",selfReview:false};
  for(const post of [commandsPOST,previewsPOST]){const csrf=partnerHttpRequest(f.reviewer,"/api/partners/commands",input);csrf.headers.delete("x-csrf-token");expect((await post(csrf)).status).toBe(403);const wrongOrigin=partnerHttpRequest(f.reviewer,"/api/partners/commands",input);wrongOrigin.headers.set("origin","https://invalid.example");expect((await post(wrongOrigin)).status).toBe(403);const malformed=await post(partnerHttpRequest(f.reviewer,"/api/partners/commands",{...input,privateText:"PRIVATE_INPUT_SENTINEL"}));expect(malformed.status).toBe(422);expect(await malformed.text()).not.toContain("PRIVATE_INPUT_SENTINEL");const oversized=await post(partnerHttpRequest(f.reviewer,"/api/partners/commands",{...input,rationale:"x".repeat(164000)}));expect(oversized.status).toBe(413);}
  expect((await previewsPOST(partnerHttpRequest(f.partner,"/api/partners/previews",input))).status).toBe(403);
  const previous=process.env.TURAS_013_DISABLED;process.env.TURAS_013_DISABLED="1";try{expect((await previewsPOST(partnerHttpRequest(f.reviewer,"/api/partners/previews",{...input,action:"guide.publish"}))).status).toBe(503);const allowed=await previewsPOST(partnerHttpRequest(f.reviewer,"/api/partners/previews",input));expect(allowed.status).toBe(200);const preview=(await allowed.json()).data;expect((await commandsPOST(partnerHttpRequest(f.reviewer,"/api/partners/commands",{...input,requestId:randomUUID(),previewId:preview.previewId}))).status).toBe(200);}finally{if(previous===undefined)delete process.env.TURAS_013_DISABLED;else process.env.TURAS_013_DISABLED=previous;}
 });
 it("projects only granted workspace cards and rejects query overrides or inaccessible customer pages",async()=>withPartnerDatabase(async db=>{
  const {partner}=await partnerTestActors(db),response=await workspaceGET(partnerHttpRequest(partner,"/api/partners/workspace?limit=1"));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");const data=(await response.json()).data;expect(data.items.map((item:{customerId:string})=>item.customerId)).toEqual([DEMO_IDS.sharedCustomer]);expect(data).not.toHaveProperty("total");
  for(const query of ["limit=51","limit=2&limit=1","membershipId="+DEMO_IDS.panelMembership,"customerId="+DEMO_IDS.deniedCustomer])expect((await workspaceGET(partnerHttpRequest(partner,"/api/partners/workspace?"+query))).status).toBe(422);
  expect((await engagementsGET(partnerHttpRequest(partner,"/api/partners/customers/"+DEMO_IDS.deniedCustomer+"/engagements"),{params:Promise.resolve({customerId:DEMO_IDS.deniedCustomer})})).status).toBe(404);
 }));
 it("requires a live session and never caches errors",async()=>{
  const r=await GET(new Request(process.env.TURAS_APP_ORIGIN+"/api/partners/requests/"+randomUUID()),{params:Promise.resolve({requestId:randomUUID()})});expect(r.status).toBe(401);expect(r.headers.get("cache-control")).toContain("no-store");expect(r.headers.get("vary")).toBe("Cookie");
 });
 it("uses strict input, CSRF and opaque request resolution",async()=>withPartnerDatabase(async db=>{
  const {partner}=await partnerTestActors(db),requestId=randomUUID(),path="/api/partners/requests/"+requestId,context={params:Promise.resolve({requestId})};
  const first=await GET(partnerHttpRequest(partner,path),context);expect(first.status).toBe(200);expect((await first.json()).data.outcome).toBe("not_found");
  const invalid=await POST(partnerHttpRequest(partner,path,{expectedVersion:0,prose:"PRIVATE_SENTINEL"}),context);expect(invalid.status).toBe(422);expect(await invalid.text()).not.toContain("PRIVATE_SENTINEL");
  const csrf=partnerHttpRequest(partner,path,{expectedVersion:0});csrf.headers.delete("x-csrf-token");expect((await POST(csrf,context)).status).toBe(403);
  const resolved=await POST(partnerHttpRequest(partner,path,{expectedVersion:0}),context);expect(resolved.status).toBe(200);expect((await resolved.json()).data.outcome).toBe("abandoned");
 }));
});
