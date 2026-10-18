import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {hostedConfigurationSchema,type HostedConfiguration} from '../lib/server/operations/hosted-configuration';
export const previewInfrastructureAuthorizationSchema=z.object({
 contract:z.literal('pilot-preview-infrastructure-user-authorization-v1'),id:z.uuid(),
 approvedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
 planDigest:z.string().regex(/^[a-f0-9]{64}$/),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),environmentMarker:z.string().min(1).max(128),target:z.literal('preview'),capMicroUsd:z.literal(10000000),
 partitionsMicroUsd:z.strictObject({sandbox:z.literal(3000000),blobAndTransfer:z.literal(2000000),functionsAndWorkflow:z.literal(3000000),builds:z.literal(2000000)}),
 maximumSandboxJobs:z.literal(32),maximumConcurrentJobs:z.literal(2),maximumJobDeadlineMs:z.literal(300000),maximumPreviewDeployments:z.literal(2),maximumPrivateStores:z.literal(1),automaticTopUp:z.literal(false),automaticBillingChanges:z.literal(false),productionChangesAuthorized:z.literal(false),additionalModelAllowanceAuthorized:z.literal(false),
}).superRefine((value,ctx)=>{if(Date.parse(value.expiresAt)-Date.parse(value.approvedAt)!==172800000)ctx.addIssue({code:'custom',message:'Exact 48-hour infrastructure authorization required'});});

export async function assertHostedPaidAdmission(input:{scope:PilotHostedScope;db:Client;configuration:HostedConfiguration;authorizationDigest:string;authorizationExpiresAt:string;requiredJobs:number}){
 const {scope,db}=input,cfg=hostedConfigurationSchema.parse(input.configuration);
 z.string().regex(/^[a-f0-9]{64}$/).parse(input.authorizationDigest);z.iso.datetime({offset:true}).parse(input.authorizationExpiresAt);
 z.number().int().min(1).max(32).parse(input.requiredJobs);
 if(new URL(scope.origin).protocol!=='https:'||scope.target!=='preview'||cfg.environmentMarker!==scope.environmentMarker||cfg.projectId!==scope.projectId||cfg.teamId!==scope.teamId||!cfg.dispatcherEnabled||cfg.maximumSandboxDispatches>32)throw Error('Exact admitted Preview execution required');
 const rows=(await db.query(`SELECT e.environment_id,e.schema_version,c.mode,b.state,b.authorization_digest,b.scope_digest,b.pricing_digest,b.cap_micro_usd,b.expires_at,clock_timestamp() AS now,
  (SELECT count(*)::int FROM turas_environment) AS marker_count,
  COALESCE(sum(CASE WHEN r.state='released' THEN 0 WHEN r.state='settled' THEN r.charged_micro_usd ELSE r.upper_bound_micro_usd END),0) AS committed,
  count(*) FILTER(WHERE r.state<>'released') AS used_count,count(*) FILTER(WHERE r.state='unknown') AS unknown_count
  FROM turas_environment e JOIN operations_control c USING(environment_id)
  JOIN workspaces w ON w.id=$2 AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=e.environment_id
  JOIN operations_cost_budgets b ON b.environment_id=e.environment_id AND b.category='sandbox' AND b.id=$1
  LEFT JOIN operations_cost_reservations r ON r.budget_id=b.id
  GROUP BY e.environment_id,e.schema_version,c.mode,b.id`,[cfg.costBudgetId,scope.workspaceId])).rows;
 const row=rows[0];
 if(rows.length!==1||row.marker_count!==1||row.environment_id!==scope.environmentMarker||row.schema_version!==79||row.mode!=='open'||row.state!=='active'||row.authorization_digest!==input.authorizationDigest||row.scope_digest!==cfg.costScopeDigest||row.pricing_digest!==cfg.costPricingDigest||Number(row.cap_micro_usd)>3000000||row.expires_at.getTime()>Date.parse(input.authorizationExpiresAt)||row.expires_at<=row.now||Number(row.unknown_count)!==0||Number(row.used_count)+input.requiredJobs>cfg.maximumSandboxDispatches||BigInt(row.committed)>=BigInt(row.cap_micro_usd))throw Error('Current applicable Preview cost authority unavailable');
 return {budgetId:cfg.costBudgetId,scopeDigest:cfg.costScopeDigest,pricingDigest:cfg.costPricingDigest,heldOrCompletedJobs:Number(row.used_count),automaticTopUp:false};
}
/** Actual normal worker records, not caller booleans or executor exit codes. */
export async function verifyHostedPaidJobs(input:{scope:PilotHostedScope;db:Client;configuration:HostedConfiguration;domainKind:'artifact'|'report'|'workforce';domainJobIds:string[];expectedImageDigests:string[]}){
 const {scope,db,configuration:cfg}=input;
 for(const id of input.domainJobIds)z.uuid().parse(id);
 if(!input.domainJobIds.length||input.domainJobIds.length>32||new Set(input.domainJobIds).size!==input.domainJobIds.length||!input.expectedImageDigests.length||input.expectedImageDigests.length>32)throw Error('Fixed paid journey inventory required');
 const rows=(await db.query(`SELECT j.id,j.domain_job_id,j.image_digest,j.state,j.provider_id,j.code_version,j.output_digest,r.budget_id,r.state AS cost_state
  FROM operations_hosted_jobs j JOIN operations_cost_reservations r ON r.id=j.budget_reservation_id
  WHERE j.environment_id=$1 AND j.domain_kind=$2 AND j.domain_job_id=ANY($3::uuid[]) ORDER BY j.id`,[scope.environmentMarker,input.domainKind,input.domainJobIds])).rows;
 if(rows.length!==input.expectedImageDigests.length||input.domainJobIds.some(id=>!rows.some(row=>row.domain_job_id===id))||JSON.stringify(rows.map(r=>r.image_digest).sort())!==JSON.stringify([...input.expectedImageDigests].sort())||rows.some(row=>row.state!=='succeeded'||!row.provider_id||row.code_version!==scope.sourceCommit||!row.output_digest||row.budget_id!==cfg.costBudgetId||!['dispatched','settled'].includes(row.cost_state)))throw Error('Actual hosted program or cost receipts incomplete');
 return rows.map(row=>({jobId:row.id,domainJobId:row.domain_job_id,providerId:row.provider_id,imageDigest:row.image_digest,codeVersion:row.code_version,costState:row.cost_state}));
}
