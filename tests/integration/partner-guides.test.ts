import { describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withPartnerDatabase } from "../fixtures/partners/environment";
import { partnerTestActors,partnerDeliveryBaseline } from "../fixtures/partners/seed";
import { partnerAcceptedEvidence,syntheticPartnerGuide } from "../fixtures/partners/originals";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { writePartnerGuide,readPartnerGuide } from "../../lib/server/partners/guides";
import { previewPartnerGuide,decidePartnerGuide } from "../../lib/server/partners/previews";
import { partnerContractVersion } from "../../lib/contracts/partners";
const envelope=()=>({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:0});
async function setup(){return withPartnerDatabase(async db=>{const actors=await partnerTestActors(db);await db.query("BEGIN");let baseline;try{baseline=await partnerDeliveryBaseline(db,actors.author,actors.reviewer);await db.query("COMMIT");}catch(error){await db.query("ROLLBACK");throw error;}const evidence=await partnerAcceptedEvidence(actors.author,actors.reviewer,DEMO_IDS.sharedCustomer);return {...actors,baseline,evidence,content:syntheticPartnerGuide(evidence.reference)};});}
describe("partner guide lifecycle",()=>{
 it("allows retirement while disabled, withholds all bodies and keeps committed replay after preview expiry",async()=>{
  const f=await setup(),saved=await writePartnerGuide(f.author,{...envelope(),action:"guide.create",customerId:DEMO_IDS.sharedCustomer,engagementId:f.baseline.engagementId,acceptedRevisionId:f.baseline.created.revisionId,baselineId:f.baseline.baselineId,content:f.content}),draft=await readPartnerGuide(f.author,saved.targetId!);
  const submitted=await writePartnerGuide(f.author,{...envelope(),action:"guide.submit",guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:1}),publish={...envelope(),action:"guide.publish" as const,guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:submitted.version!,rationale:"Synthetic exact publication",selfReview:false};const preview=await previewPartnerGuide(f.reviewer,publish),input={...publish,requestId:randomUUID(),previewId:preview.previewId},published=await decidePartnerGuide(f.reviewer,input);
  await withPartnerDatabase(async db=>{await db.query("BEGIN");await db.query("SET LOCAL turas.partner_cleanup='yes'");await db.query("UPDATE partner_review_previews SET expires_at=now()-interval '1 second' WHERE id=$1",[preview.previewId]);await db.query("COMMIT");});expect(await decidePartnerGuide(f.reviewer,input)).toEqual(published);await expect(previewPartnerGuide(f.reviewer,publish)).rejects.toMatchObject({status:410});
  const before=process.env.TURAS_013_DISABLED;process.env.TURAS_013_DISABLED="1";try{
   const retirement={...publish,action:"guide.retire" as const,requestId:randomUUID(),expectedVersion:published.version!,rationale:"Retire the exact synthetic identity"},prepared=await previewPartnerGuide(f.reviewer,retirement);await decidePartnerGuide(f.reviewer,{...retirement,requestId:randomUUID(),previewId:prepared.previewId});const view=await readPartnerGuide(f.partner,saved.targetId!);expect(view.availability).toBe("retired");expect(view.content).toBeNull();expect(view.canAuthor).toBe(false);
  }finally{if(before===undefined)delete process.env.TURAS_013_DISABLED;else process.env.TURAS_013_DISABLED=before;}
 });
 it("keeps draft private, publishes an exact preview and preserves the published head across edits/rejection",async()=>{
  const f=await setup(),saved=await writePartnerGuide(f.author,{...envelope(),action:"guide.create",customerId:DEMO_IDS.sharedCustomer,engagementId:f.baseline.engagementId,acceptedRevisionId:f.baseline.created.revisionId,baselineId:f.baseline.baselineId,content:f.content});
  await expect(readPartnerGuide(f.partner,saved.targetId!)).rejects.toMatchObject({status:404});const draft=await readPartnerGuide(f.author,saved.targetId!);expect(draft.content?.title).toBe(f.content.title);expect(draft.citations).toEqual([{sourceId:f.evidence.reference.id,text:"Synthetic demonstrated delivery result"}]);
  const submitted=await writePartnerGuide(f.author,{...envelope(),action:"guide.submit",guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:saved.version!});
  const review={...envelope(),action:"guide.publish" as const,guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:submitted.version!,rationale:"Publish exact synthetic guide",selfReview:false};
  await expect(previewPartnerGuide(f.author,review)).rejects.toMatchObject({status:403});const preview=await previewPartnerGuide(f.reviewer,review),decisionInput={...review,requestId:randomUUID(),previewId:preview.previewId};
  const decision=await decidePartnerGuide(f.reviewer,decisionInput);expect(await decidePartnerGuide(f.reviewer,decisionInput)).toEqual(decision);expect((await readPartnerGuide(f.partner,saved.targetId!)).content?.title).toBe(f.content.title);
  const edited=await writePartnerGuide(f.author,{...envelope(),action:"guide.revise",guideId:saved.targetId!,acceptedRevisionId:f.baseline.created.revisionId,baselineId:f.baseline.baselineId,content:{...f.content,title:"Synthetic changed draft"},expectedVersion:decision.version!});
  expect((await readPartnerGuide(f.partner,saved.targetId!)).content?.title).toBe(f.content.title);const changed=await readPartnerGuide(f.author,saved.targetId!);
  const submittedAgain=await writePartnerGuide(f.author,{...envelope(),action:"guide.submit",guideId:saved.targetId!,revisionId:changed.revisionId!,contentDigest:changed.contentDigest!,expectedVersion:edited.version!});
  const reject={...review,requestId:randomUUID(),action:"guide.reject" as const,revisionId:changed.revisionId!,contentDigest:changed.contentDigest!,expectedVersion:submittedAgain.version!};const rejected=await previewPartnerGuide(f.reviewer,reject);await decidePartnerGuide(f.reviewer,{...reject,requestId:randomUUID(),previewId:rejected.previewId});expect((await readPartnerGuide(f.partner,saved.targetId!)).content?.title).toBe(f.content.title);
 });
 it("binds previews to actor/session, action, exact version and expiry",async()=>{
  const f=await setup(),saved=await writePartnerGuide(f.reviewer,{...envelope(),action:"guide.create",customerId:DEMO_IDS.sharedCustomer,engagementId:f.baseline.engagementId,acceptedRevisionId:f.baseline.created.revisionId,baselineId:f.baseline.baselineId,content:f.content}),draft=await readPartnerGuide(f.reviewer,saved.targetId!);
  const submitted=await writePartnerGuide(f.reviewer,{...envelope(),action:"guide.submit",guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:1}),review={...envelope(),action:"guide.publish" as const,guideId:saved.targetId!,revisionId:draft.revisionId!,contentDigest:draft.contentDigest!,expectedVersion:submitted.version!,rationale:"Synthetic self review",selfReview:false};
  await expect(previewPartnerGuide(f.reviewer,review)).rejects.toMatchObject({status:422});review.selfReview=true;const preview=await previewPartnerGuide(f.reviewer,review);
  const other=await withPartnerDatabase(async db=>(await partnerTestActors(db)).reviewer);await expect(decidePartnerGuide(other,{...review,requestId:randomUUID(),previewId:preview.previewId})).rejects.toMatchObject({status:409});
  await expect(decidePartnerGuide(f.reviewer,{...review,action:"guide.reject",requestId:randomUUID(),previewId:preview.previewId})).rejects.toMatchObject({status:409});
  await withPartnerDatabase(async db=>{await db.query("BEGIN");await db.query("SET LOCAL turas.partner_cleanup='yes'");await db.query("UPDATE partner_review_previews SET expires_at=now()-interval '1 second' WHERE id=$1",[preview.previewId]);await db.query("COMMIT");});
  await expect(decidePartnerGuide(f.reviewer,{...review,requestId:randomUUID(),previewId:preview.previewId})).rejects.toMatchObject({status:410});
 });
});
