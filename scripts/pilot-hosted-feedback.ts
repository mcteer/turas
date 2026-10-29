import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Client} from 'pg';
import {z} from 'zod';
import {pilotHostedScopeSchema,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {feedbackDigest,validateFeedbackAppend} from '../lib/contracts/pilot-feedback';
import {validatePilotFeedbackScope} from './pilot-feedback';
import {evidenceDigest,readEvidence,writeEvidence} from './pilot-evidence';
const uuid=z.uuid(),time=z.iso.datetime({offset:true});
/** Record the actual normal-role training capture before the later SDK exercise
 * revokes its partner grant. These are initial automated observations awaiting
 * independent capture review and explicit disposition, never usability claims. */
export async function recordHostedTrainingObservations(input:{directory:string;scope:PilotHostedScope;db:Client;signal:AbortSignal}){
 const scope=pilotHostedScopeSchema.parse(input.scope);input.signal.throwIfAborted();
 const name='training-internal-admin.json',raw=await readEvidence(input.directory,name),capture=z.object({runId:uuid,sourceCommit:z.literal(scope.sourceCommit),sourceDigest:z.literal(scope.sourceDigest),catalogDigest:z.literal(scope.catalogDigest),environmentMarker:z.literal(scope.environmentMarker),workspaceId:z.literal(scope.workspaceId),deployment:z.object({deploymentId:z.literal(scope.deploymentId),projectId:z.literal(scope.projectId),teamId:z.literal(scope.teamId),commit:z.literal(scope.sourceCommit)}),contract:z.literal('pilot-hosted-training-chain-v1'),customerId:uuid,startedAt:time,completedAt:time,partnerExecution:z.object({startedAt:time,completedAt:time}),guide:z.object({contract:z.literal('pilot-partner-guide-v1'),guideId:uuid,assignmentId:uuid,normalCommands:z.literal(4),reviewPreviews:z.literal(2),providerCalls:z.literal(0)}),training:z.object({contract:z.literal('pilot-partner-training-v1'),assignmentId:uuid,attemptId:uuid,normalCommands:z.literal(3),reviewPreviews:z.literal(1),providerCalls:z.literal(0),learningIsNotDeliveryAcceptance:z.literal(true)}),roles:z.object({contract:z.literal('pilot-hosted-read-checks-v1'),passedCases:z.literal(15),sessionsRevoked:z.literal(3),providerCalls:z.literal(0)})}).parse(raw);
 if(capture.guide.assignmentId!==capture.training.assignmentId||capture.runId!==scope.runId||Date.parse(capture.completedAt)>Date.now()||Date.parse(capture.startedAt)>Date.parse(capture.partnerExecution.startedAt)||Date.parse(capture.partnerExecution.startedAt)>Date.parse(capture.partnerExecution.completedAt)||Date.parse(capture.partnerExecution.completedAt)>Date.parse(capture.completedAt))throw Error('Original completed training capture required');
 const rows=(await input.db.query(`SELECT p.login_name,m.id AS membership_id,m.principal_id,m.kind FROM memberships m JOIN principals p ON p.id=m.principal_id AND p.active WHERE m.workspace_id=$1 AND m.active AND ((p.login_name='panel' AND m.kind='internal') OR (p.login_name='partner' AND m.kind='partner')) ORDER BY p.login_name`,[scope.workspaceId])).rows;
 if(rows.length!==2||rows[0].login_name!=='panel'||rows[1].login_name!=='partner')throw Error('Exact distinct training participants required');
 const feedbackScope=await validatePilotFeedbackScope(input.db,{contract:'pilot-feedback-scope-v1',environmentId:scope.environmentMarker,workspaceId:scope.workspaceId,customerIds:[capture.customerId],participants:rows.map(row=>({reference:row.kind==='internal'?'Automated internal member':'Automated assigned partner',principalId:row.principal_id,membershipId:row.membership_id,kind:row.kind}))});
 const captureDigest=evidenceDigest(await readFile(join(input.directory,name))),at=new Date().toISOString(),records=[];
 for(const participant of feedbackScope.participants){
  input.signal.throwIfAborted();
  const record=validateFeedbackAppend({contract:'pilot-feedback-record-v2',scope:feedbackScope,scopeDigest:feedbackDigest(feedbackScope),item:{id:randomUUID(),journey:'J013',participantReference:participant.reference,severity:'minor',observedAt:capture.completedAt,observationReference:name,observation:participant.kind==='internal'?'The automated internal member authored the normal guide used by the independently reviewed assignment. This synthetic workflow does not establish customer delivery outcomes or human usability.':'The automated assigned partner completed the normal reviewed synthetic demonstration. This does not certify skills, establish customer outcomes or represent human usability feedback.'},transitions:[{state:'recorded',at,ownerReference:'Automated internal member'}],previousDigest:null,sourceCommit:scope.sourceCommit,sourceDigest:scope.sourceDigest,catalogDigest:scope.catalogDigest,humanReported:false,releaseApproved:false,messagesSent:0,automation:{method:'automated-role-exercise',deploymentId:scope.deploymentId,origin:scope.origin,captureDigest,runnerReference:'Normal hosted training role exercise'}});
  const file='feedback-'+participant.kind+'-recorded.json',digest=await writeEvidence(input.directory,file,record);records.push({file,digest,recordDigest:feedbackDigest(record),participantReference:participant.reference});
 }
 const manifest={contract:'pilot-hosted-role-observations-v1',scope,capture:{file:name,digest:captureDigest},records,independentReviewRequired:true,dispositionsComplete:false,humanReported:false,releaseApproved:false};await writeEvidence(input.directory,'role-observations.json',manifest);return manifest;
}
