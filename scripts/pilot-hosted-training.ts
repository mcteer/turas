import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {partnerGuideContentSchema,partnerSourceSchema} from '../lib/contracts/partners';
import {runPartnerGuide,runPartnerTraining} from './pilot-hosted-partners';
import {runHostedReadChecks} from './pilot-hosted-http';
import {pilotHostedRequest} from './pilot-hosted-request';
/** Uses independently bound contributor and partner sessions while the exact
 * administrator reviewer session remains active. All sessions use normal login
 * and logout, and all acceptance uses normal preview/decision commands. */
export async function runHostedTrainingJourney(input:{scope:PilotHostedScope;db:Client;headers:Headers;configuration:HostedConfiguration;customerId:string;engagementId:string;baselineId:string;acceptedRevisionId:string;sourceRevisionId:string;signal:AbortSignal;transport?:typeof fetch}){
 const startedAt=new Date().toISOString();let partnerExecution:{startedAt:string;completedAt:string}|undefined;
 const {scope,db,signal}=input,transport=input.transport??fetch,reviewerRequest=pilotHostedRequest({...input,transport});
 const members=(await db.query("SELECT m.id FROM memberships m JOIN workspaces w ON w.id=m.workspace_id AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=$3 JOIN customer_references c ON c.workspace_id=w.id AND c.id=$2 AND c.synthetic JOIN principals p ON p.id=m.principal_id JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id AND o.active WHERE m.workspace_id=$1 AND m.active AND m.kind='partner' AND p.active AND p.login_name='partner' AND EXISTS(SELECT 1 FROM customer_grants g WHERE g.workspace_id=m.workspace_id AND g.membership_id=m.id AND g.customer_id=$2 AND g.state='active')",[scope.workspaceId,input.customerId,scope.environmentMarker])).rows;
 if(members.length!==1)throw Error('Exact currently assigned synthetic partner required');
 const evidence=z.object({data:z.object({items:z.array(z.object({reference:partnerSourceSchema})).max(50)})}).parse(await reviewerRequest('/api/partners/evidence?customerId='+input.customerId+'&engagementId='+input.engagementId+'&limit=50','GET')).data;
 const reference=evidence.items.find(row=>row.reference.sourceRevisionId===input.sourceRevisionId)?.reference;
 if(!reference)throw Error('Exact ordinarily accepted training source required');
 const lessonId=randomUUID(),content=partnerGuideContentSchema.parse({title:'Controlled synthetic pilot training',lessons:[{id:lessonId,order:1,objective:'Demonstrate the reviewed synthetic delivery practice',what:'Use the accepted delivery baseline',how:'Follow the reviewed plan and record independently accepted evidence',why:'Keep learning grounded in observed delivery work',alternatives:'Escalate when the reviewed plan cannot be followed',limitations:'This guide does not approve delivery or certify skills',validation:'Compare retained accepted evidence with the demonstration criterion',escalation:'Ask the internal account owner to review blockers',prerequisites:[],unknowns:['Future customer changes remain unknown'],sourceIds:[reference.id]}],checkpoints:[{id:randomUUID(),lessonId,order:1,title:'Demonstrate delivery practice',criterion:'Show the reviewed practice in accepted customer-specific evidence',required:true,prerequisiteIds:[],sourceIds:[reference.id]}],sources:[reference]});
 let guide:Awaited<ReturnType<typeof runPartnerGuide>>|undefined,training:Awaited<ReturnType<typeof runPartnerTraining>>|undefined;
 const roles=await runHostedReadChecks(scope,db,signal,transport,process.env,async role=>{
  const request=pilotHostedRequest({scope,headers:role.headers,signal,transport});
  if(role.role==='internal-member')guide=await runPartnerGuide({...input,workspaceId:scope.workspaceId,membershipId:members[0].id,content,authorRequest:request,reviewerRequest});
  if(role.role==='assigned-partner'){
   if(!guide||!role.partnerCustomerIds.includes(input.customerId))throw Error('Normally reviewed assigned guide required');
   const partnerStartedAt=new Date().toISOString();training=await runPartnerTraining({...input,workspaceId:scope.workspaceId,assignmentId:guide.assignmentId,membershipId:members[0].id,partnerRequest:request,reviewerRequest,content:{attempted:'Controlled synthetic demonstration of the reviewed practice',result:'Controlled synthetic retained source was independently reviewed',blockers:[],observedAt:new Date(Date.now()-1000).toISOString(),sources:[reference]}});partnerExecution={startedAt:partnerStartedAt,completedAt:new Date().toISOString()};
  }
 },input.configuration);
 if(!guide||!training||!partnerExecution)throw Error('Full normal synthetic training step incomplete');
 return {contract:'pilot-hosted-training-chain-v1',guide,training,roles,customerId:input.customerId,sourceRevisionId:input.sourceRevisionId,acceptedRevisionId:input.acceptedRevisionId,engagementId:input.engagementId,baselineId:input.baselineId,startedAt,completedAt:new Date().toISOString(),partnerExecution,humanFeedbackRecorded:false,skillsCertified:false,fullPartnerJourneyVerified:false};
}
