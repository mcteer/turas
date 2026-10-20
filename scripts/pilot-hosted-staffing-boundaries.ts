import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {staffingCreateResourceSchema} from '../lib/contracts/staffing';
import {workforceManualAssessmentSchema,workforceReviewSchema} from '../lib/contracts/staffing-imports';
import {staffingCreateCalendarSchema} from '../lib/contracts/staffing-calendar';
import {staffingCreateDemandSchema,staffingQualifyDemandSchema} from '../lib/contracts/staffing-demands';
import {staffingProposeAllocationSchema,staffingAllocationPreviewSchema} from '../lib/contracts/staffing-allocations';
import {PilotHostedResponseError} from './pilot-hosted-request';
import type {HostedJourneyRequest} from './pilot-hosted-baseline';

export async function runHostedStaffingBoundaries(input:{scope:PilotHostedScope;db:Client;resourceId:string;skillId:string;demandId:string;allocationId:string;allocationRevisionId:string;serviceDate:string;request:HostedJourneyRequest;signal:AbortSignal}){
 const {scope,db,request,signal}=input,unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 const identity=z.object({revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),aggregateVersion:z.number().int().positive()});
 let normalCommands=0;
 async function command(path:string,body:unknown){signal.throwIfAborted();const result=unwrap(await request(path,'POST',body));normalCommands++;return result;}
 const demand=identity.extend({demand:z.unknown()}).parse(unwrap(await request('/api/staffing/demands/'+input.demandId,'GET')));
 const content=staffingCreateDemandSchema.shape.demand.parse(demand.demand),rationale='Controlled synthetic staffing feasibility boundary only';
 const larger=identity.extend({demandId:z.uuid()}).parse(await command('/api/staffing/demands',staffingCreateDemandSchema.parse({requestKey:randomUUID(),rationale,demand:{...content,title:'Synthetic overload boundary demand',days:[{date:input.serviceDate,requiredMinutes:960}]}})));
 const exact=(value:z.infer<typeof identity>)=>({revisionId:value.revisionId,contentDigest:value.contentDigest,expectedAggregateVersion:value.aggregateVersion});
 const qualified=identity.extend({demandId:z.uuid()}).parse(await command('/api/staffing/demands/'+larger.demandId+'/qualify',staffingQualifyDemandSchema.parse({...exact(larger),requestKey:randomUUID(),rationale})));
 if(qualified.demandId!==larger.demandId)throw Error('Exact overload demand differs');
 const allocationSchema=identity.extend({allocationId:z.uuid(),state:z.literal('proposed')});
 async function propose(resourceId:string,demandId:string,value:z.infer<typeof identity>,minutes:number){return allocationSchema.parse(await command('/api/staffing/allocations',staffingProposeAllocationSchema.parse({requestKey:randomUUID(),rationale,allocation:{resourceId,demandId,demandRevisionId:value.revisionId,demandDigest:value.contentDigest,expectedDemandVersion:value.aggregateVersion,days:[{date:input.serviceDate,minutes}]}})));}
 async function deniedPreview(proposal:z.infer<typeof allocationSchema>,code:'capacity_conflict'|'source_changed'){
  let denied=false;try{await request('/api/staffing/allocations/'+proposal.allocationId+'/review-preview','POST',staffingAllocationPreviewSchema.parse({...exact(proposal),requestKey:randomUUID(),rationale,action:'confirm'}));}catch(error){if(error instanceof PilotHostedResponseError&&error.releaseMatches&&error.status===409&&error.errorCode===code)denied=true;else throw error;}
  if(!denied)throw Error('Required staffing feasibility denial absent');
  const row=(await db.query('SELECT state,confirmed_revision_id FROM staffing_allocations WHERE id=$1 AND workspace_id=$2',[proposal.allocationId,scope.workspaceId])).rows;
  if(row.length!==1||row[0].state!=='proposed'||row[0].confirmed_revision_id!==null)throw Error('Denied staffing proposal became a commitment');
 }
 const overload=await propose(input.resourceId,qualified.demandId,qualified,960);await deniedPreview(overload,'capacity_conflict');
 const staleResource=z.object({resourceId:z.uuid()}).parse(await command('/api/staffing/resources',staffingCreateResourceSchema.parse({requestKey:randomUUID(),rationale,resource:{displayName:'Synthetic stale competency boundary resource',externalKey:'synthetic-stale-'+randomUUID(),kind:'internal',state:'active',membershipId:null,partnerOrganizationId:null,timezone:'UTC',regionCode:'US'}})));
 const assessmentDate=new Date(Date.now()-60*86400000).toISOString().slice(0,10),nextReviewDate=new Date(Date.now()-86400000).toISOString().slice(0,10);
 const candidate=identity.extend({competencyId:z.uuid(),generation:z.literal(1)}).parse(await command('/api/staffing/competencies',workforceManualAssessmentSchema.parse({requestKey:randomUUID(),rationale,resourceId:staleResource.resourceId,skillId:input.skillId,level:3,assessmentDate,nextReviewDate,evidence:'Controlled synthetic historical assessment; explicitly overdue for review'})));
 await command('/api/staffing/competency-decisions',workforceReviewSchema.parse({requestKey:randomUUID(),rows:[{competencyId:candidate.competencyId,candidateRevisionId:candidate.revisionId,candidateDigest:candidate.contentDigest,expectedAggregateVersion:candidate.aggregateVersion,sourceGeneration:1,action:'accept',rationale:'Review exact historical assessment without treating its expired review date as current'}]}));
 await command('/api/staffing/resources/'+staleResource.resourceId+'/calendar',staffingCreateCalendarSchema.parse({requestKey:randomUUID(),rationale,calendar:{timezone:'UTC',observedAt:new Date(Date.now()-1000).toISOString(),nextReviewAt:new Date(Date.now()+14*86400000).toISOString(),fromDate:input.serviceDate,toDate:input.serviceDate,days:[{date:input.serviceDate,contracted:[{date:input.serviceDate,from:input.serviceDate+'T09:00',to:input.serviceDate+'T17:00',fromOffset:null,toOffset:null}],holidays:[],leave:[],protected:[]}]}}));
 const stale=await propose(staleResource.resourceId,input.demandId,demand,60);await deniedPreview(stale,'source_changed');
 const match=z.object({entityId:z.uuid(),demandId:z.uuid()}).parse(await command('/api/staffing/demands/'+input.demandId+'/matches',{...exact(demand),requestKey:randomUUID(),rationale}));
 if(match.demandId!==input.demandId)throw Error('Exact staffing comparison differs');
 const comparison=z.object({items:z.array(z.object({resourceId:z.uuid(),status:z.string(),constraints:z.array(z.object({kind:z.string(),outcome:z.string(),reason:z.string(),skillId:z.uuid().optional()}))}))}).parse(unwrap(await request('/api/staffing/demands/'+input.demandId+'/matches?resultId='+match.entityId,'GET')));
 const staleMatch=comparison.items.find(row=>row.resourceId===staleResource.resourceId);
 if(!staleMatch||staleMatch.status==='eligible'||!staleMatch.constraints.some(row=>row.kind==='required_skill'&&row.skillId===input.skillId&&row.outcome==='unknown'&&row.reason==='stale'))throw Error('Stale competency treated as eligible');
 const original=(await db.query('SELECT state,confirmed_revision_id FROM staffing_allocations WHERE id=$1 AND workspace_id=$2',[input.allocationId,scope.workspaceId])).rows;
 if(original.length!==1||original[0].state!=='confirmed'||original[0].confirmed_revision_id!==input.allocationRevisionId)throw Error('Feasibility boundary changed original commitment');
 return {contract:'pilot-hosted-staffing-boundaries-v1',journey:'J007',originalAllocationId:input.allocationId,originalAllocationRevisionId:input.allocationRevisionId,overloadAllocationId:overload.allocationId,staleAllocationId:stale.allocationId,staleResourceId:staleResource.resourceId,staleCompetencyRevisionId:candidate.revisionId,matchingResultId:match.entityId,normalCommands,deniedPreviews:2,overloadDenied:true,staleSkillsDenied:true,staleMatchWithheld:true,originalCommitmentPreserved:true,providerCalls:0};
}
