import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {knowledgeLineageSchema,knowledgeRevisionSchema,sanitizedKnowledgeSchema} from '../lib/contracts/knowledge';
import {learningTargetSchema,learningCandidateReviewSchema,learningEvaluationSchema} from '../lib/contracts/learning';
import {learningEvaluationCatalogDigest} from '../lib/server/learning/evaluation-context';
type Request=(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;
const data=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
const command=z.object({targetId:z.uuid(),version:z.number().int().positive()});
/** An ordinary same-contribution improvement. Caller activates only the exact
 * synthetic workspace after its separately authored/reviewed baseline exists. */
export async function prepareHostedLearningEvaluation(input:{scope:PilotHostedScope;db:Client;contributionId:string;publicationId:string;sourceRevisionId:string;authorRequest:Request;reviewerRequest:Request;signal:AbortSignal}){
 const {scope,db,authorRequest:author,reviewerRequest:reviewer,signal}=input;signal.throwIfAborted();
 const authority=(await db.query(`SELECT c.author_membership_id,m.principal_id AS author_principal,
  l.enabled,l.gate_activated_at,w.classification,w.pilot_environment_id,
  reviewer.principal_id AS reviewer_principal,reviewer.id AS reviewer_membership
  FROM knowledge_contributions c JOIN memberships m ON m.id=c.author_membership_id AND m.active
  JOIN principals a ON a.id=m.principal_id AND a.active AND a.login_name='panel'
  JOIN knowledge_publications p ON p.contribution_id=c.id AND p.id=$3 AND p.state='published'
  JOIN learning_workspace_state l ON l.workspace_id=c.workspace_id AND l.environment_id=c.environment_id
  JOIN workspaces w ON w.id=c.workspace_id AND w.active
  JOIN memberships reviewer ON reviewer.workspace_id=w.id AND reviewer.active AND reviewer.kind='internal' AND reviewer.role='admin'
  JOIN principals r ON r.id=reviewer.principal_id AND r.active AND r.login_name='mcteer'
  WHERE c.id=$4 AND c.environment_id=$1 AND c.workspace_id=$2`,[scope.environmentMarker,scope.workspaceId,input.publicationId,input.contributionId])).rows;
 if(authority.length!==1||!authority[0].enabled||!authority[0].gate_activated_at||authority[0].classification!=='synthetic_pilot'
  ||authority[0].pilot_environment_id!==scope.environmentMarker||authority[0].author_principal===authority[0].reviewer_principal)throw Error('Exact activated synthetic baseline and separate actual author/reviewer required');
 const target=learningTargetSchema.parse(z.object({target:z.unknown()}).parse(data(await author('/api/learning/targets/shared_practice/'+input.publicationId,'GET'))).target);
 if(target.id!==input.publicationId||target.kind!=='shared_practice')throw Error('Actual current baseline feedback target differs');
 const feedback=command.parse(data(await author('/api/learning/feedback','POST',{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,target,category:'missing_guidance',text:'Controlled synthetic exercise: make the observation window, comparison scope and unknowns explicit before interpreting a measurement. This is a proposed improvement, with no claimed measured benefit.'})));
 const current=z.object({id:z.uuid(),revision:z.number().int().positive(),digest:z.string().regex(/^[a-f0-9]{64}$/),payload:sanitizedKnowledgeSchema}).parse(data(await author('/api/knowledge/contributions/'+input.contributionId,'GET')));
 const options=z.array(knowledgeLineageSchema.omit({rightsBasis:true}).strip()).parse(data(await author('/api/knowledge/sources?customerId='+(await db.query('SELECT customer_id FROM knowledge_contributions WHERE id=$1',[input.contributionId])).rows[0].customer_id,'GET')));
 const original=options.find(row=>row.sourceRevisionId===input.sourceRevisionId);if(!original)throw Error('Actual accepted improvement original unavailable');
 const revised=z.object({id:z.uuid(),revision:z.number().int().positive(),digest:z.string().regex(/^[a-f0-9]{64}$/)}).parse(data(await author('/api/knowledge/contributions/'+input.contributionId+'/revisions','POST',knowledgeRevisionSchema.parse({idempotencyKey:randomUUID(),expectedRevision:current.revision,expectedDigest:current.digest,payload:{...current.payload,validation:'Record the observation window, comparison scope and missing information before comparing results. Review the original observations with the responsible owner. This synthetic practice claims no measured customer outcome.'},lineage:[{...original,rightsBasis:'Operator-controlled synthetic original with explicit synthetic reuse rights'}]}))));
 if(revised.id!==current.id||revised.revision!==current.revision+1)throw Error('Ordinary exact next private revision required');
 await author('/api/knowledge/contributions/'+current.id+'/submit','POST',{idempotencyKey:randomUUID(),expectedRevision:revised.revision,expectedDigest:revised.digest});
 const view=z.object({revision:z.number().int().positive(),revisionId:z.uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),closureDigest:z.string().regex(/^[a-f0-9]{64}$/),canReview:z.boolean()}).parse(data(await reviewer('/api/learning/candidates/'+current.id,'GET')));
 if(!view.canReview||view.revision!==revised.revision||view.digest!==revised.digest)throw Error('Actual independent exact candidate review unavailable');
 const review=command.parse(data(await reviewer('/api/learning/candidates/'+current.id+'/reviews','POST',learningCandidateReviewSchema.parse({contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.revision,revisionId:view.revisionId,contentDigest:view.digest,closureDigest:view.closureDigest,decision:'accept',rightsAttested:true,checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},rationale:'Reviewed the exact generic synthetic revision and its accepted controlled original. No private customer identity, outcome or measured benefit is asserted.'}))));
 await reviewer('/api/learning/feedback/'+feedback.targetId+'/dispositions','POST',{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:feedback.version,state:'linked',candidateRevisionId:view.revisionId,rationale:'The exact ordinary revision addresses this controlled proposal; paired model benefit remains unmeasured.'});
 const evaluation=command.parse(data(await reviewer('/api/learning/candidates/'+current.id+'/evaluations','POST',learningEvaluationSchema.parse({contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.revision,reviewId:review.targetId,baselineGeneration:target.generation,catalogDigest:learningEvaluationCatalogDigest(),budgetUsd:'25'}))));
 return {contract:'pilot-hosted-learning-preparation-v1',contributionId:current.id,revisionId:view.revisionId,reviewId:review.targetId,feedbackId:feedback.targetId,evaluationId:evaluation.targetId,baselineGeneration:target.generation,modelCalls:0,normalCommandsOnly:true,pairedCapturesVerified:false,benefitVerified:false};
}
