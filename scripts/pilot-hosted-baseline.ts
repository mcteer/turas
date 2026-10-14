import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {planDraftContentSchema} from '../lib/contracts/plan-content';
export type HostedJourneyRequest=(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;
export type HostedBaselineInput={scope:PilotHostedScope;db:Client;customerId:string;workloadId:string;planId:string;revisionId:string;engagementId:string;ownerMembershipId:string;reviewerRequest:HostedJourneyRequest;signal:AbortSignal};

/** Metadata admission precedes the normal, independently authorized plan read.
 * The accepted head must have its exact review decision and active baseline.
 * The returned dependency comes from the authorized API; this performs no writes. */
export async function readHostedBaseline(input:HostedBaselineInput){
 const {scope,db,customerId,workloadId,planId,revisionId,engagementId,ownerMembershipId,reviewerRequest,signal}=input;
 for(const id of [customerId,workloadId,planId,revisionId,engagementId,ownerMembershipId])z.uuid().parse(id);
 signal.throwIfAborted();
 const rows=(await db.query(`SELECT c.synthetic FROM customer_references c
  JOIN workspaces ws ON ws.id=c.workspace_id AND ws.active AND ws.classification='synthetic_pilot' AND ws.pilot_environment_id=$8
  JOIN customer_workloads w ON w.customer_id=c.id AND w.workspace_id=c.workspace_id
  JOIN delivery_plans p ON p.customer_id=c.id AND p.workspace_id=c.workspace_id AND p.workload_id=w.id
  JOIN engagements e ON e.id=p.engagement_id AND e.customer_id=c.id AND e.workspace_id=c.workspace_id
  JOIN milestone_baselines b ON b.id=e.active_baseline_id AND b.engagement_id=e.id AND b.revision_id=p.accepted_revision_id
  JOIN plan_decisions d ON d.plan_id=p.id AND d.revision_id=p.accepted_revision_id AND d.action='accept' AND d.engagement_id=e.id AND d.baseline_id=b.id AND d.workspace_id=c.workspace_id
  JOIN memberships m ON m.workspace_id=c.workspace_id AND m.id=$7 AND m.active AND m.kind='internal'
  JOIN principals a ON a.id=m.principal_id AND a.active
  WHERE c.id=$1 AND c.workspace_id=$2 AND w.id=$3 AND w.lifecycle='active' AND p.id=$4 AND p.accepted_revision_id=$5 AND p.audience='delivery' AND e.id=$6 AND p.environment_id=$8`,[customerId,scope.workspaceId,workloadId,planId,revisionId,engagementId,ownerMembershipId,scope.environmentMarker])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic accepted baseline required');
 const plan=z.object({data:z.object({planId:z.literal(planId),revisionId:z.literal(revisionId),reviewState:z.literal('accepted'),acceptedRevisionId:z.literal(revisionId),engagementId:z.literal(engagementId),contentAvailability:z.literal('readable'),content:z.object({sourceDependencies:planDraftContentSchema.shape.sourceDependencies})})}).parse(await reviewerRequest('/api/plans/'+planId,'GET')).data;
 const dependency=plan.content.sourceDependencies.find(source=>source.kind==='accepted_profile');
 if(!dependency)throw Error('An actual linked accepted-profile source is required');
 signal.throwIfAborted();return dependency;
}
