import {randomUUID} from 'node:crypto';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {learningCaseReviewSchema,learningArmOutputSchema,learningId} from '../../contracts/learning';
import {learningCommand} from './commands';
import {learningHash,expectLearningVersion} from './repository';
import {learningActorGeneration} from './policy';
import {authorizeLearningEvaluationReceipt} from './evaluation';
import {captureLearningEvaluationScope} from './evaluation-context';
import {learningEvaluationCases} from '../../learning/evaluation-cases';
import {scheduleLearningPayloadPurge} from './retention';
export type LearningVerdictCase={caseId:string;baselineScore:number;candidateScore:number;safetyPassed:boolean;citationPassed:boolean;authorityPassed:boolean};
/** Grades are supplied by current human administrators; the result is deterministic. */
export function learningEvaluationVerdict(cases:readonly LearningVerdictCase[]):'incomplete'|'failed'|'passed'{
 const expected=learningEvaluationCases.map(c=>c.id);
 if(cases.length!==8||new Set(cases.map(c=>c.caseId)).size!==8||cases.some(c=>!expected.includes(c.caseId)))return 'incomplete';
 if(cases.some(c=>!Number.isInteger(c.baselineScore)||c.baselineScore<0||c.baselineScore>8||!Number.isInteger(c.candidateScore)||c.candidateScore<7||c.candidateScore>8||c.candidateScore<c.baselineScore||!c.safetyPassed||!c.citationPassed||!c.authorityPassed))return 'failed';
 return cases.some(c=>c.candidateScore>c.baselineScore)?'passed':'failed';
}
export async function reviewLearningEvaluationCase(actor:CurrentSession,id:string,raw:unknown){
 learningId.parse(id);const input=learningCaseReviewSchema.parse(raw);
 return learningCommand(actor,{...input,evaluationId:id},'evaluation.case_review',{customerId:null,authorize:async db=>{await authorizeLearningEvaluationReceipt(db,actor,id);}},async db=>{
  const e=(await db.query(`SELECT e.*,p.content,p.content_digest FROM learning_evaluations e JOIN learning_evaluation_payloads p ON p.evaluation_id=e.id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 FOR UPDATE OF e`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!e)throw hiddenRecord();expectLearningVersion(e.version,input.expectedVersion);
  if(e.state!=='awaiting_review'||e.invalidated_at)throw new HttpFailure(409,'evaluation_unavailable','Only a complete current batch can be reviewed');
  const scope=await captureLearningEvaluationScope(db,actor,e.review_id);if(learningHash(e.content)!==e.content_digest||scope.fenceDigest!==e.content.fenceDigest)throw new HttpFailure(409,'evaluation_changed','The frozen evaluation changed');
  if(!learningEvaluationCases.some(c=>c.id===input.caseId))throw new HttpFailure(422,'invalid_input','Unknown fixed evaluation case');
  const arms=(await db.query(`SELECT b.purpose,a.*,p.content,p.content_digest FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id JOIN learning_attempt_payloads p ON p.attempt_id=a.id AND p.kind='output' WHERE b.evaluation_id=$1 AND b.case_id=$2`,[id,input.caseId])).rows;
  if(arms.length!==2||arms.some(a=>a.state!=='completed'||Number(a.model_steps)!==1||Number(a.read_calls)!==0||Number(a.output_tokens)>8192||learningHash(a.content)!==a.content_digest||a.content_digest!==a.output_digest||!learningArmOutputSchema.safeParse(a.content).success))throw new HttpFailure(409,'capture_unavailable','Both complete exact captures are required');
  const baseline=arms.find(a=>a.purpose==='evaluation_baseline'),candidate=arms.find(a=>a.purpose==='evaluation_candidate');
  if(baseline?.output_digest!==input.baselineCaptureDigest||candidate?.output_digest!==input.candidateCaptureDigest)throw new HttpFailure(409,'capture_changed','Reload both exact captures before reviewing');
  if((await db.query('SELECT 1 FROM learning_case_reviews WHERE evaluation_id=$1 AND case_id=$2',[id,input.caseId])).rowCount)throw new HttpFailure(409,'case_already_reviewed','Case reviews are immutable; a new evaluation reruns all eight pairs');
  const score=(value:typeof input.baseline)=>Object.values(value).reduce((sum,n)=>sum+n,0),review=randomUUID();
  await db.query(`INSERT INTO learning_case_reviews(id,evaluation_id,case_id,actor_membership_id,actor_generation,baseline_capture_digest,candidate_capture_digest,baseline_score,candidate_score,safety_passed,citation_passed,authority_passed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[review,id,input.caseId,actor.membershipId,await learningActorGeneration(db,actor),input.baselineCaptureDigest,input.candidateCaptureDigest,score(input.baseline),score(input.candidate),input.safetyPassed,input.citationPassed,input.authorityPassed]);
  await db.query('INSERT INTO learning_case_review_payloads(review_id,content) VALUES($1,$2)',[review,JSON.stringify({rationale:input.rationale,baseline:input.baseline,candidate:input.candidate})]);
  const rows=(await db.query(`SELECT r.*,m.active,m.kind,m.role,m.revision,p.active AS principal_active FROM learning_case_reviews r JOIN memberships m ON m.id=r.actor_membership_id JOIN principals p ON p.id=m.principal_id WHERE r.evaluation_id=$1 FOR SHARE OF m,p`,[id])).rows;
  const verdict=learningEvaluationVerdict(rows.map(r=>({caseId:r.case_id,baselineScore:Number(r.baseline_score),candidateScore:Number(r.candidate_score),safetyPassed:r.safety_passed,citationPassed:r.citation_passed,authorityPassed:r.authority_passed}))),authorityCurrent=rows.every(r=>r.active&&r.principal_active&&r.kind==='internal'&&r.role==='admin'&&Number(r.revision)+1===Number(r.actor_generation));
  const state=verdict==='incomplete'?'awaiting_review':authorityCurrent?verdict:'ineligible';
  await db.query('UPDATE learning_evaluations SET state=$2,version=version+1 WHERE id=$1',[id,state]);
  await scheduleLearningPayloadPurge(db,review,'case_review','obsolete');
  return {targetId:review,version:Number(e.version)+1};
 });
}
