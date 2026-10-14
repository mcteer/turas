import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { issueSession,getCurrentSession,sessionCookieName } from "../../../lib/server/auth/sessions";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from "../../../lib/server/knowledge/service";
import { requireOwnedPilotDatabase } from "../../../scripts/pilot-environment";

/** An unactivated legacy-workspace fixture exercises shared-origin eligibility;
 * it cannot establish evaluated publication or hosted readiness. */
export async function pilotPublishedKnowledgeFixture(db:PoolClient,classification:"primary"|"synthetic_pilot"){
 requireOwnedPilotDatabase(process.env,true);
 let workspaceId:string|undefined;
 if(classification==="synthetic_pilot")workspaceId=(await db.query("SELECT id FROM workspaces WHERE classification='synthetic_pilot' AND active")).rows[0]?.id;
 if(!workspaceId){workspaceId=randomUUID();await db.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic shared-origin fixture',$2,$3,$4)",[workspaceId,classification,classification==="synthetic_pilot"?process.env.TURAS_ENVIRONMENT_ID:null,classification==="synthetic_pilot"?randomUUID():null]);}
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin') ON CONFLICT(principal_id,workspace_id) DO NOTHING",[randomUUID(),DEMO_IDS.mcteer,workspaceId]);
 const membershipId=(await db.query("SELECT id FROM memberships WHERE principal_id=$1 AND workspace_id=$2",[DEMO_IDS.mcteer,workspaceId])).rows[0].id as string;
 const issued=await issueSession({principalId:DEMO_IDS.mcteer,loginName:"mcteer",displayName:"mcteer",membershipId,workspaceId,kind:"internal",role:"admin"});
 const actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${sessionCookieName()}=${issued.token}`}})))!;
 const customerId=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic shared-origin customer',true)",[customerId,workspaceId]);await db.query("INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[customerId,workspaceId]);
 await db.query("INSERT INTO learning_workspace_state(environment_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[process.env.TURAS_ENVIRONMENT_ID,workspaceId]);
 await db.query("BEGIN");
 const proposed=await submitProfileCommand(actor,customerId,{action:"propose_record",requestKey:randomUUID(),workloadId:null,requestedAudience:"delivery",dataCategory:"delivery_context",payload:{kind:"product_use",productKey:"synthetic-pilot-"+randomUUID(),displayName:"Synthetic Pipeline",state:"actual",usageDescription:"Synthetic observed build stage timing",observedAt:new Date(Date.now()-1000).toISOString()},qualityInput:{rubricVersion:"evidence-quality-v1",R:4,D:4,C:2,reliabilityRationale:"Controlled synthetic observation",directnessRationale:"Exact observed stage timing",corroborationRationale:"Independent synthetic source",informationType:"adoption_process",dateBasis:"observation"}},db) as {recordId:string;revisionId:string};
 const fact=(await db.query("SELECT v.content_digest,v.revision_number,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1",[proposed.revisionId])).rows[0];
 await submitProfileCommand(actor,customerId,{action:"accept_revision",requestKey:randomUUID(),revisionId:proposed.revisionId,digest:fact.content_digest,expectedRecordVersion:Number(fact.version),expectedAcceptedRevisionId:fact.current_accepted_revision_id,rationale:"Reviewed controlled synthetic observation"},db);
 const draft=await createKnowledgeCandidate(db,actor,{idempotencyKey:randomUUID(),customerId,payload:{title:"Synthetic Shared Engineering Practice",productVersion:"2026.10",problem:"Unknown build bottleneck",prerequisites:"A supported build pipeline",solution:"Measure stages individually",reasoning:"Timing identifies bottlenecks",applicability:"Build pipelines",limitations:"Validate each workload",validation:"Compare stage timings"},lineage:[{sourceKind:"accepted_profile",sourceRevisionId:proposed.revisionId,sourceGeneration:Number(fact.revision_number),sourceDigest:fact.content_digest,rightsBasis:"Controlled synthetic reusable observation"}]});
 await submitKnowledgeCandidate(db,actor,draft.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:draft.digest});
 await decideKnowledgeCandidate(db,actor,draft.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:draft.digest,action:"publish",rightsAttested:true,sanitizationRationale:"Generic process guidance only",checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
 const publication=(await db.query("SELECT id,revision_id,head_generation FROM knowledge_publications WHERE contribution_id=$1",[draft.id])).rows[0];
 await db.query("COMMIT");
 return {actor,customerId,originalRevisionId:proposed.revisionId,publicationId:publication.id as string,revisionId:publication.revision_id as string,generation:Number(publication.head_generation),digest:draft.digest};
}
