import { randomUUID } from "node:crypto";
import { partnerContractVersion,type PartnerSource,type PartnerGuideContent } from "../../../lib/contracts/partners";
import { writePartnerGuide,readPartnerGuide } from "../../../lib/server/partners/guides";
import { previewPartnerGuide,decidePartnerGuide } from "../../../lib/server/partners/previews";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { withPartnerDatabase } from "./environment";
import { partnerTestActors,partnerDeliveryBaseline } from "./seed";
import { partnerAcceptedEvidence,syntheticPartnerGuide } from "./originals";
export const partnerCommandEnvelope=()=>({contractVersion:partnerContractVersion,requestId:randomUUID(),expectedVersion:0});
export async function partnerGuideFixture(title="Synthetic partner guide",published=false,source?:PartnerSource,evidenceDescription="Synthetic demonstrated delivery result",transform?:(content:PartnerGuideContent)=>PartnerGuideContent){
 const scoped=await withPartnerDatabase(async db=>{const actors=await partnerTestActors(db);await db.query("BEGIN");try{const baseline=await partnerDeliveryBaseline(db,actors.author,actors.reviewer);await db.query("COMMIT");return {...actors,baseline};}catch(error){await db.query("ROLLBACK");throw error;}});
 const evidence=source?null:await partnerAcceptedEvidence(scoped.author,scoped.reviewer,DEMO_IDS.sharedCustomer,evidenceDescription),reference=source??evidence!.reference,content=transform?transform(syntheticPartnerGuide(reference,title)):syntheticPartnerGuide(reference,title);
 const saved=await writePartnerGuide(scoped.author,{...partnerCommandEnvelope(),action:"guide.create",customerId:DEMO_IDS.sharedCustomer,engagementId:scoped.baseline.engagementId,acceptedRevisionId:scoped.baseline.created.revisionId,baselineId:scoped.baseline.baselineId,content}),draft=await readPartnerGuide(scoped.author,saved.targetId!);
 const submitted=await writePartnerGuide(scoped.author,{...partnerCommandEnvelope(),action:"guide.submit",guideId:saved.targetId!,revisionId:draft.revisionId,contentDigest:draft.contentDigest,expectedVersion:saved.version!});
 if(published){const input={...partnerCommandEnvelope(),action:"guide.publish" as const,guideId:saved.targetId!,revisionId:draft.revisionId,contentDigest:draft.contentDigest,expectedVersion:submitted.version!,rationale:"Reviewed exact synthetic learning guide",selfReview:false},preview=await previewPartnerGuide(scoped.reviewer,input);await decidePartnerGuide(scoped.reviewer,{...input,requestId:randomUUID(),previewId:preview.previewId});}
 return {...scoped,evidence,content,guideId:saved.targetId!,revisionId:draft.revisionId,checkpointId:content.checkpoints[0].id};
}
