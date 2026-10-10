import {planDraftContentSchema} from '../../../lib/contracts/plan-content';
import { randomUUID } from 'node:crypto';
import type { CurrentSession } from '../../../lib/server/auth/sessions';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { syntheticPlanContent } from '../plans/seed';
import { submitPlanCommand } from '../../../lib/server/plans/commands';
import { createPlanReviewPreview,decidePlan } from '../../../lib/server/plans/decisions';
/** Actual source-free proposal review. No model calls or accepted customer facts. */
export async function mcpAcceptedPlan(author:CurrentSession,reviewer:CurrentSession,customerId:string,options:{audience?:'internal'|'delivery';large?:boolean}={}){
 requireOwnedMcpDatabase();const content=planDraftContentSchema.parse(syntheticPlanContent());content.assertions=[];content.sourceDependencies=[];
 if(options.large)content.assertions=Array.from({length:20},(_,i)=>({key:'synthetic_proposal_'+i,kind:'proposal' as const,text:'A'.repeat(4000),sourceDependencyIds:[],decisionCritical:false}));
 const created=await submitPlanCommand(author,{action:'create',requestKey:randomUUID(),workspaceId:author.workspaceId,customerId,
   workloadId:null,audience:options.audience??'delivery',ownerMembershipId:author.membershipId,content});
 const submitted=await submitPlanCommand(author,{action:'submit',requestKey:randomUUID(),planId:created.planId,
   expectedAggregateVersion:created.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest});
 const preview=await createPlanReviewPreview(reviewer,created.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
   revisionId:submitted.revisionId,contentDigest:submitted.contentDigest});
 const decision=await decidePlan(reviewer,created.planId,{action:'accept',requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
   revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,reviewPreviewId:preview.previewId,rationale:'Reviewed synthetic proposal',deliverySuitabilityConfirmed:true});
 return {created,content,decision};
}
