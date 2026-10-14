import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {staffingCreateCalendarSchema} from '../lib/contracts/staffing-calendar';
import {staffingCreateDemandSchema,staffingQualifyDemandSchema} from '../lib/contracts/staffing-demands';
import {staffingProposeAllocationSchema,staffingAllocationPreviewSchema,staffingAllocationDecisionSchema} from '../lib/contracts/staffing-allocations';
const identity=z.object({revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),aggregateVersion:z.number().int().positive()});
/** One dated synthetic commitment, based on an ordinary reviewed plan and
 * separately reviewed competency/calendar. Matching alone never confirms it. */
export async function runHostedStaffingCommitment(input:{scope:PilotHostedScope;db:Client;customerId:string;workloadId:string;engagementId:string;planId:string;baselineId:string;planRevisionId:string;resourceId:string;skillId:string;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;signal:AbortSignal}){
 const {scope,db,request,signal}=input;
 const binding=(await db.query("SELECT b.content_digest FROM milestone_baselines b JOIN engagements e ON e.active_baseline_id=b.id AND e.id=b.engagement_id JOIN customer_references c ON c.id=e.customer_id AND c.workspace_id=e.workspace_id AND c.synthetic JOIN workspaces w ON w.id=c.workspace_id AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=$1 WHERE w.id=$2 AND c.id=$3 AND e.id=$4 AND b.id=$5 AND b.plan_id=$6 AND b.revision_id=$7",[scope.environmentMarker,scope.workspaceId,input.customerId,input.engagementId,input.baselineId,input.planId,input.planRevisionId])).rows;
 if(binding.length!==1)throw Error('Exact ordinarily accepted synthetic staffing baseline required');
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 async function command(path:string,body:{requestKey:string;[key:string]:unknown}){signal.throwIfAborted();try{return unwrap(await request(path,'POST',body));}catch(error){await request('/api/staffing/commands/'+body.requestKey,'GET').catch(()=>undefined);throw error;}}
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10),rationale='Operator review of controlled synthetic dated staffing only';
 await command('/api/staffing/resources/'+input.resourceId+'/calendar',staffingCreateCalendarSchema.parse({requestKey:randomUUID(),rationale,calendar:{timezone:'UTC',observedAt:new Date(Date.now()-1000).toISOString(),nextReviewAt:new Date(Date.now()+14*86400000).toISOString(),fromDate:date,toDate:date,days:[{date,contracted:[{date,from:date+'T09:00',to:date+'T17:00',fromOffset:null,toOffset:null}],holidays:[],leave:[],protected:[]}]}}));
 const demand=identity.extend({demandId:z.uuid()}).parse(await command('/api/staffing/demands',staffingCreateDemandSchema.parse({requestKey:randomUUID(),rationale,demand:{customerId:input.customerId,workloadId:input.workloadId,engagementId:input.engagementId,planId:input.planId,baselineId:input.baselineId,planRevisionId:input.planRevisionId,baselineDigest:binding[0].content_digest,workPackageKey:'proof',title:'Synthetic dated delivery demand',role:'Synthetic pilot operator',fromDate:date,toDate:date,requiredSkills:[{skillId:input.skillId,minimumLevel:2}],desiredSkills:[],days:[{date,requiredMinutes:60}],allowedRegions:['US'],billable:false,overlap:null}})));
 const exact=(value:z.infer<typeof identity>)=>({revisionId:value.revisionId,contentDigest:value.contentDigest,expectedAggregateVersion:value.aggregateVersion});
 const qualified=identity.extend({demandId:z.uuid(),state:z.literal('qualified')}).parse(await command('/api/staffing/demands/'+demand.demandId+'/qualify',staffingQualifyDemandSchema.parse({...exact(demand),requestKey:randomUUID(),rationale})));
 if(qualified.demandId!==demand.demandId)throw Error('Qualified staffing demand differs');
 const proposal=identity.extend({allocationId:z.uuid(),state:z.literal('proposed')}).parse(await command('/api/staffing/allocations',staffingProposeAllocationSchema.parse({requestKey:randomUUID(),rationale,allocation:{resourceId:input.resourceId,demandId:qualified.demandId,demandRevisionId:qualified.revisionId,demandDigest:qualified.contentDigest,expectedDemandVersion:qualified.aggregateVersion,days:[{date,minutes:60}]}})));
 const preview=identity.extend({allocationId:z.uuid(),previewId:z.uuid(),state:z.literal('prepared')}).parse(await command('/api/staffing/allocations/'+proposal.allocationId+'/review-preview',staffingAllocationPreviewSchema.parse({...exact(proposal),requestKey:randomUUID(),rationale,action:'confirm'})));
 if(preview.allocationId!==proposal.allocationId||preview.revisionId!==proposal.revisionId||preview.contentDigest!==proposal.contentDigest||preview.aggregateVersion!==proposal.aggregateVersion)throw Error('Exact staffing confirmation preview differs');
 await command('/api/staffing/allocations/'+proposal.allocationId+'/decisions',staffingAllocationDecisionSchema.parse({...exact(proposal),requestKey:randomUUID(),rationale,action:'confirm',reviewPreviewId:preview.previewId}));
 const final=(await db.query('SELECT state,confirmed_revision_id FROM staffing_allocations WHERE id=$1 AND workspace_id=$2',[proposal.allocationId,scope.workspaceId])).rows;
 if(final.length!==1||final[0].state!=='confirmed'||final[0].confirmed_revision_id!==proposal.revisionId)throw Error('Ordinary exact staffing commitment incomplete');
 return {contract:'pilot-hosted-staffing-commitment-v1',journey:'J007',demandId:qualified.demandId,allocationId:proposal.allocationId,allocationRevisionId:proposal.revisionId,serviceDate:date,minutes:60,normalCommands:6,providerCalls:0,matchingIsNotConfirmationVerified:true,humanFeedbackRecorded:false,fullWorkforceJourneyVerified:false};
}
