import { randomBytes,randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createProfileTestSession } from "../profiles";
import { hashSessionToken, type CurrentSession } from "../../../lib/server/auth/sessions";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { requireOwnedPartnerDatabase } from "../../../scripts/partners-environment";
import { submitPlanCommand } from "../../../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../../../lib/server/plans/decisions";
import { syntheticPlanContent } from "../plans/seed";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
export async function partnerTestActors(db:PoolClient){requireOwnedPartnerDatabase();const result={} as Record<"reviewer"|"author"|"partner",CurrentSession>;
 for(const [key,login] of [["reviewer","mcteer"],["author","panel"],["partner","partner"]] as const){const actor=await createProfileTestSession(db,login),token=randomBytes(32).toString("base64url");await db.query("UPDATE login_sessions SET token_hash=$1 WHERE id=$2",[hashSessionToken(token),actor.sessionId]);result[key]={...actor,token};}return result;
}
export async function partnerDeliveryBaseline(db:PoolClient,author:CurrentSession,reviewer:CurrentSession,customerId=DEMO_IDS.sharedCustomer,title="Synthetic reviewed delivery plan",sources:PlanDraftContent["sourceDependencies"]=[]){
 requireOwnedPartnerDatabase();const content=syntheticPlanContent() as PlanDraftContent;content.assertions=sources.map((s,n)=>({key:`accepted-source-${n+1}`,text:"Synthetic separately accepted delivery observation",kind:"accepted_fact" as const,sourceDependencyIds:[s.id],decisionCritical:true}));content.sourceDependencies=sources;content.asOf=new Date(Date.now()-10000).toISOString();content.title=title;
 const created=await submitPlanCommand(author,{action:"create",requestKey:randomUUID(),workspaceId:author.workspaceId,customerId,workloadId:null,audience:"delivery",ownerMembershipId:author.membershipId,content},db);
 const submitted=await submitPlanCommand(author,{action:"submit",requestKey:randomUUID(),planId:created.planId,revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:created.aggregateVersion},db);
 const preview=await createPlanReviewPreview(reviewer,created.planId,{requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion},db);
 const decision=await decidePlan(reviewer,created.planId,{action:"accept",requestKey:randomUUID(),revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:"Explicit synthetic delivery baseline review",deliverySuitabilityConfirmed:true},db);
 if(!decision.engagementId||!decision.baselineId)throw Error("Reviewed synthetic baseline required");return {created,decision,customerId,engagementId:decision.engagementId,baselineId:decision.baselineId};
}
export async function partnerAdditionalMember(db:PoolClient,grantCustomerId:string|null=DEMO_IDS.sharedCustomer,organizationId:string=DEMO_IDS.partnerOrganization){
 requireOwnedPartnerDatabase();const principalId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString("base64url"),loginName=`synthetic-partner-${principalId}`;
 await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic Partner')",[principalId,loginName]);
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,partner_org_id,role) VALUES($1,$2,$3,'partner',$4,'member')",[membershipId,principalId,DEMO_IDS.workspace,organizationId]);
 await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,principalId,hashSessionToken(token)]);
 if(grantCustomerId)await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),membershipId,DEMO_IDS.workspace,grantCustomerId,DEMO_IDS.mcteer]);
 return {sessionId,token,principalId,membershipId,workspaceId:DEMO_IDS.workspace,loginName,displayName:"Synthetic Partner",kind:"partner",role:"member",expiresAt:new Date(Date.now()+3600000)} as CurrentSession;
}
