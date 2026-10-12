import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {executionCommandSchema,executionPreviewSchema} from '../lib/server/execution/schema';
const rowSchema=z.object({id:z.uuid(),revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),version:z.number().int().positive(),state:z.string()});
const resultSchema=z.object({state:z.literal('committed'),changed:z.array(z.object({id:z.uuid(),version:z.number().int().positive()})),requestKey:z.uuid()});
const overviewSchema=z.object({id:z.uuid().nullable(),engagementId:z.uuid(),customerId:z.uuid(),baselineId:z.uuid(),version:z.number().int().nonnegative(),baselineVersion:z.number().int().positive(),planVersion:z.number().int().positive(),initialized:z.boolean(),milestones:z.array(z.object({key:z.string(),state:z.string()}))});
export async function runHostedDeliveryReview(input:{scope:PilotHostedScope;db:Client;customerId:string;engagementId:string;baselineId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>}){
 const {scope,db,customerId,engagementId,baselineId,signal,request}=input;
 for(const id of [customerId,engagementId,baselineId])z.uuid().parse(id);
 const rows=(await db.query('SELECT c.synthetic FROM customer_references c JOIN engagements e ON e.customer_id=c.id AND e.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND e.id=$3 AND e.active_baseline_id=$4',[customerId,scope.workspaceId,engagementId,baselineId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic accepted delivery baseline required');
 const base='/api/execution/engagements/'+engagementId;
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 async function overview(){const value=overviewSchema.parse(unwrap(await request(base,'GET')));if(value.engagementId!==engagementId||value.customerId!==customerId||value.baselineId!==baselineId)throw Error('Linked delivery identity differs');return value;}
 async function command(raw:unknown){signal.throwIfAborted();const value=executionCommandSchema.parse(raw);let result:unknown;
  try{result=unwrap(await request(base+'/commands','POST',value));}
  catch{result=unwrap(await request('/api/execution/receipts/'+value.requestKey,'GET'));}
  const parsed=resultSchema.parse(result);if(parsed.requestKey!==value.requestKey)throw Error('Original delivery command identity differs');return parsed;
 }
 let view=await overview();if(view.initialized)throw Error('Fresh linked delivery demonstration required');
 await command({version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:view.baselineVersion,plan:view.planVersion},payload:{baselineId}});
 view=await overview();
 const created=await command({version:'execution-v1',action:'record.create',requestKey:randomUUID(),expectedVersions:{execution:view.version},payload:{baselineId,record:{kind:'activity',subtype:'work',title:'Synthetic linked reviewed work',narrative:'Controlled synthetic delivery demonstration. Activity does not establish accepted milestone completion or a real customer outcome.',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:['proof_reviewed'],ownerMembershipId:null,unknownOwnerReason:'Synthetic demonstration retains explicit unknown ownership',references:[]}}});
 if(!view.id||created.changed.length!==2||created.changed[1].id!==view.id||created.changed[0].id===view.id)throw Error('Exact synthetic activity identity required');const recordId=created.changed[0].id;
 async function record(){const page=z.object({records:z.array(rowSchema)}).parse(unwrap(await request(base+'/records?recordId='+recordId+'&limit=1','GET')));if(page.records.length!==1||page.records[0].id!==recordId)throw Error('Exact linked activity unavailable');return page.records[0];}
 let row=await record();view=await overview();
 await command({version:'execution-v1',action:'record.submit',requestKey:randomUUID(),expectedVersions:{execution:view.version,record:row.version},payload:{recordId,revisionId:row.revisionId,contentDigest:row.contentDigest}});
 row=await record();if(row.state!=='submitted')throw Error('Synthetic activity is not submitted');view=await overview();
 const candidate=executionPreviewSchema.parse({version:'execution-v1',action:'record.accept',expectedVersions:{execution:view.version,record:row.version},payload:{recordId,revisionId:row.revisionId,contentDigest:row.contentDigest}});
 const preview=z.object({previewDigest:z.string().regex(/^[a-f0-9]{64}$/),previewExpiresAt:z.iso.datetime(),expectedVersions:z.object({execution:z.number().int().positive(),record:z.number().int().positive()})}).parse(unwrap(await request(base+'/preview','POST',candidate)));
 if(preview.expectedVersions.execution!==view.version||preview.expectedVersions.record!==row.version)throw Error('Exact linked activity preview changed');
 await command({...candidate,...preview,requestKey:randomUUID(),rationale:'Operator review of the controlled synthetic activity'});
 row=await record();if(row.state!=='accepted')throw Error('Synthetic activity is not accepted');view=await overview();
 if(view.milestones.some(x=>['accepted','completed'].includes(x.state)))throw Error('Activity incorrectly became accepted milestone completion');
 return {contract:'pilot-hosted-delivery-review-v1',journey:'J008',engagementId,baselineId,recordId,revisionId:row.revisionId,normalCommands:4,providerCalls:0,activityIsNotCompletionVerified:true,fullDeliveryJourneyVerified:false,fullLinkedJourneyVerified:false};
}

/** A separate reviewer decision is required even after the activity is accepted.
 * Fixed synthetic baseline only; no activity/hour-derived completion. */
export async function runHostedMilestoneReview(input:{scope:PilotHostedScope;db:Client;customerId:string;engagementId:string;baselineId:string;activityRevisionId:string;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>}){
 const {scope,db,customerId,engagementId,baselineId,activityRevisionId,signal,request}=input;
 for(const id of [customerId,engagementId,baselineId,activityRevisionId])z.uuid().parse(id);
 const rows=(await db.query(`SELECT c.synthetic FROM customer_references c JOIN engagements e ON e.customer_id=c.id AND e.workspace_id=c.workspace_id
  JOIN execution_records r ON r.engagement_id=e.id JOIN execution_record_revisions v ON v.id=r.accepted_revision_id
  JOIN execution_record_payloads p ON p.revision_id=v.id WHERE c.id=$1 AND c.workspace_id=$2 AND e.id=$3 AND e.active_baseline_id=$4 AND v.id=$5
  AND v.audience='delivery' AND p.content->>'kind'='activity' AND p.content->>'subtype'='work'`,[customerId,scope.workspaceId,engagementId,baselineId,activityRevisionId])).rows;
 if(rows.length!==1||rows[0].synthetic!==true)throw Error('Exact synthetic accepted milestone activity required');
 const base='/api/execution/engagements/'+engagementId,unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 const viewSchema=overviewSchema.extend({milestones:z.array(z.object({key:z.string(),version:z.number().int().positive(),state:z.string()}))});
 async function view(){signal.throwIfAborted();const value=viewSchema.parse(unwrap(await request(base,'GET')));if(value.engagementId!==engagementId||value.customerId!==customerId||value.baselineId!==baselineId)throw Error('Milestone baseline differs');return value;}
 const key='proof_reviewed',steps=[['start','not_started','in_progress'],['request_review','in_progress','ready_for_review'],['accept','ready_for_review','accepted']] as const;
 for(const [decision,before,after] of steps){
  const current=await view(),milestone=current.milestones.find(row=>row.key===key);if(!milestone||milestone.state!==before)throw Error('Exact fresh synthetic milestone transition required');
  const candidate=executionPreviewSchema.parse({version:'execution-v1',action:'milestone.decide',expectedVersions:{execution:current.version,milestone:milestone.version},payload:{baselineId,milestoneKey:key,decision,evidenceRevisionIds:decision==='accept'?[activityRevisionId]:[]}});
  const preview=z.object({previewDigest:z.string().regex(/^[a-f0-9]{64}$/),previewExpiresAt:z.iso.datetime(),expectedVersions:z.object({execution:z.number().int().positive(),milestone:z.number().int().positive()})}).parse(unwrap(await request(base+'/preview','POST',candidate)));
  if(preview.expectedVersions.execution!==current.version||preview.expectedVersions.milestone!==milestone.version)throw Error('Exact milestone decision preview differs');
  const command=executionCommandSchema.parse({...candidate,...preview,requestKey:randomUUID(),rationale:'Separate operator decision on the controlled synthetic milestone and exact reviewed activity'});
  let raw:unknown;try{raw=unwrap(await request(base+'/commands','POST',command));}catch(error){try{raw=unwrap(await request('/api/execution/receipts/'+command.requestKey,'GET'));}catch{throw error;}}
  const receipt=resultSchema.parse(raw);if(receipt.requestKey!==command.requestKey||(await view()).milestones.find(row=>row.key===key)?.state!==after)throw Error('Exact milestone decision not committed');
 }
 return {contract:'pilot-hosted-milestone-review-v1',journey:'J008',engagementId,baselineId,milestoneKey:key,activityRevisionId,normalCommands:3,reviewPreviews:3,explicitMilestoneAcceptanceVerified:true,providerCalls:0,customerOutcomeEstablished:false,fullDeliveryJourneyVerified:false};
}
