import {randomUUID} from 'node:crypto';
import {dirname,basename,resolve} from 'node:path';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {hostedLearningBindingSchema} from '../lib/contracts/pilot-hosted-learning';
import {learningCaseReviewSchema} from '../lib/contracts/learning';
import {knowledgeDecisionSchema} from '../lib/contracts/knowledge';
import {learningHash} from '../lib/server/learning/repository';
import {learningEvaluationVerdict} from '../lib/server/learning/evaluation-review';
import {activateLearningOnConnection} from './learning-activate';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {assertHostedLearningCaptureAuthority,captureHostedLearningEvaluation} from './pilot-hosted-learning-capture';
import {prepareHostedLearningEvaluation} from './pilot-hosted-learning';
import {pilotHostedRequest,PilotHostedResponseError} from './pilot-hosted-request';
import {readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';
const digest=z.string().regex(/^[a-f0-9]{64}$/),file=z.string().min(1).max(4096);
export const hostedLearningJourneyConfigurationSchema=z.strictObject({contract:z.literal('pilot-hosted-learning-journey-input-v1'),binding:hostedLearningBindingSchema,originalLedgerDirectory:file,independentReviewFile:file});
const reviewedCase=learningCaseReviewSchema.omit({contractVersion:true,requestId:true,expectedVersion:true});
export const hostedLearningIndependentReviewSchema=z.strictObject({contract:z.literal('pilot-hosted-learning-independent-review-v1'),scope:pilotHostedScopeSchema,evaluationId:z.uuid(),captureManifestDigest:digest,reviewerReference:z.string().trim().min(1).max(512),method:z.literal('automated-independent-review'),reviewedAt:z.iso.datetime({offset:true}),cases:z.array(reviewedCase).length(8)});
const data=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
type Request=ReturnType<typeof pilotHostedRequest>;
/** Scores are review inputs submitted through normal administrator commands.
 * They never substitute for actual paired captures or authorize publication.
 * The server independently binds each digest and derives the final verdict. */
export async function submitHostedLearningIndependentReview(input:{scope:PilotHostedScope;evaluationId:string;captureManifestDigest:string;review:unknown;request:Request;evidenceDirectory:string;signal:AbortSignal}){
 const review=hostedLearningIndependentReviewSchema.parse(input.review);
 if(JSON.stringify(review.scope)!==JSON.stringify(input.scope)||review.evaluationId!==input.evaluationId||review.captureManifestDigest!==input.captureManifestDigest||Date.parse(review.reviewedAt)>Date.now()||Date.now()-Date.parse(review.reviewedAt)>900000||new Set(review.cases.map(c=>c.caseId)).size!==8||review.cases.some(c=>!/^E0[1-8]$/.test(c.caseId)))throw Error('Exact complete fresh independent capture review required');
 const current=()=>input.request('/api/learning/evaluations/'+input.evaluationId,'GET').then(value=>z.object({id:z.uuid(),version:z.number().int().positive(),state:z.string()}).parse(data(value)));
 let view=await current();if(view.id!==input.evaluationId||view.state!=='awaiting_review')throw Error('Fresh complete actual evaluation awaiting review required');
 for(const row of [...review.cases].sort((a,b)=>a.caseId.localeCompare(b.caseId))){
  input.signal.throwIfAborted();
  const command=learningCaseReviewSchema.parse({...row,contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:view.version});
  await writeEvidence(input.evidenceDirectory,'learning-review-'+row.caseId+'-intent.json',{evaluationId:input.evaluationId,command,reviewDigest:evidenceDigest(JSON.stringify(review)),reviewerReference:review.reviewerReference,method:review.method});
  // On uncertain acknowledgement inspect only the original receipt, then stop.
  // A new key or repeated POST must not manufacture an independently reviewed case.
  let result:unknown;try{result=data(await input.request('/api/learning/evaluations/'+input.evaluationId+'/case-reviews','POST',command));}catch(error){await input.request('/api/learning/requests/'+command.requestId,'GET').catch(()=>undefined);throw error;}
  const receipt=z.object({targetId:z.uuid(),version:z.number().int().positive()}).parse(result);if(receipt.version!==view.version+1)throw Error('Exact immutable case review receipt differs');
  await writeEvidence(input.evidenceDirectory,'learning-review-'+row.caseId+'-receipt.json',{requestId:command.requestId,...receipt});view=await current();if(view.version!==receipt.version)throw Error('Actual evaluation review version changed');
 }
 const score=(value:typeof review.cases[number]['baseline'])=>Object.values(value).reduce((a,b)=>a+b,0),expected=learningEvaluationVerdict(review.cases.map(row=>({...row,baselineScore:score(row.baseline),candidateScore:score(row.candidate)})));
 if(!['passed','failed'].includes(expected)||view.state!==expected)throw Error('Actual domain verdict differs from exact complete reviewed captures');
 return {evaluationId:input.evaluationId,state:view.state,reviewDigest:evidenceDigest(JSON.stringify(review)),reviewerReference:review.reviewerReference,reviewMethod:review.method,reviewedCases:8,actualHumanReviewVerified:false};
}
export async function runHostedLearningJourney(input:{scope:PilotHostedScope;db:Client;ownerDb:Client;headers:Headers;authorRequest:Request;contributionId:string;publicationId:string;sourceRevisionId:string;configuration:unknown;evidenceDirectory:string;signal:AbortSignal}){
 const config=hostedLearningJourneyConfigurationSchema.parse(input.configuration),ledger=new QualityBudgetLedger(resolve(config.originalLedgerDirectory)),authority={scope:input.scope,db:input.ownerDb,headers:input.headers,binding:config.binding,ledger,signal:input.signal};
 const {request}=await assertHostedLearningCaptureAuthority(authority);
 if(process.env.TURAS_ENVIRONMENT_ID!==input.scope.environmentMarker)throw Error('Explicit selected operator environment required for activation');
 const before=(await input.ownerDb.query('SELECT enabled,gate_activated_at,version FROM learning_workspace_state WHERE environment_id=$1 AND workspace_id=$2',[input.scope.environmentMarker,input.scope.workspaceId])).rows;
 if(before.length!==1||before[0].enabled||before[0].gate_activated_at||Number(before[0].version)!==1)throw Error('Exact never-activated synthetic baseline required');
 await writeEvidence(input.evidenceDirectory,'learning-activation-intent.json',{scope:input.scope,contributionId:input.contributionId,publicationId:input.publicationId,originalLedgerDirectory:resolve(config.originalLedgerDirectory),modelCalls:0});
 await activateLearningOnConnection(input.ownerDb,input.scope.environmentMarker,input.scope.workspaceId,true);
 const prepared=await prepareHostedLearningEvaluation({...input,reviewerRequest:request});await writeEvidence(input.evidenceDirectory,'learning-prepared.json',prepared);
 const captured=await captureHostedLearningEvaluation({...authority,evaluationId:prepared.evaluationId,evidenceDirectory:input.evidenceDirectory});
 if(!captured.complete||!captured.retirementVerified||captured.arms.length!==16)throw Error('Actual full retired paired batch required');
 const manifest={contract:'pilot-hosted-learning-review-manifest-v1',scope:input.scope,evaluationId:prepared.evaluationId,cases:z.array(z.object({caseId:z.string(),purpose:z.enum(['evaluation_baseline','evaluation_candidate']),capture:z.unknown()}).passthrough()).length(16).parse(captured.arms).map(row=>({caseId:row.caseId,purpose:row.purpose,capture:row.capture}))},manifestDigest=learningHash(manifest),preparedAt=Date.now();
 await writeEvidence(input.evidenceDirectory,'learning-independent-review-manifest.json',{...manifest,captureManifestDigest:manifestDigest,independentReviewFile:resolve(config.independentReviewFile),reviewMethod:'automated-independent-review',actualHumanReviewVerified:false});
 let review:unknown;const deadline=Math.min(preparedAt+900000,Date.parse(config.binding.expiresAt));
 for(;;){input.signal.throwIfAborted();try{review=await readEvidence(dirname(resolve(config.independentReviewFile)),basename(config.independentReviewFile));break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(Date.now()>=deadline)throw Error('Independent actual capture review pending; do not rerun paired models');await new Promise<void>((done,reject)=>{const abort=()=>{clearTimeout(timer);reject(input.signal.reason);},timer=setTimeout(()=>{input.signal.removeEventListener('abort',abort);done();},2000);input.signal.addEventListener('abort',abort,{once:true});});}
 const parsed=hostedLearningIndependentReviewSchema.parse(review);if(Date.parse(parsed.reviewedAt)<preparedAt)throw Error('Independent review must observe the actual completed capture manifest');
 const reviewed=await submitHostedLearningIndependentReview({scope:input.scope,evaluationId:prepared.evaluationId,captureManifestDigest:manifestDigest,review:parsed,request,evidenceDirectory:input.evidenceDirectory,signal:input.signal});
 const candidate=z.object({revision:z.number().int().positive(),digest}).parse(data(await request('/api/knowledge/contributions/'+input.contributionId,'GET'))),decision=knowledgeDecisionSchema.parse({idempotencyKey:randomUUID(),expectedRevision:candidate.revision,expectedDigest:candidate.digest,expectedPublicationGeneration:prepared.baselineGeneration,action:'publish',rightsAttested:true,sanitizationRationale:'Exact independently reviewed automated synthetic paired exercise; no actual customer outcome is asserted.',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true},learningEvaluationId:prepared.evaluationId,learningReviewId:prepared.reviewId,expectedBaselineGeneration:prepared.baselineGeneration});
 await writeEvidence(input.evidenceDirectory,'learning-publication-intent.json',{contributionId:input.contributionId,decision,reviewed});
 let publicationDenied=false;
 if(reviewed.state==='failed'){
  try{await request('/api/knowledge/contributions/'+input.contributionId+'/decisions','POST',decision);}catch(error){if(error instanceof PilotHostedResponseError&&error.status===409&&error.releaseMatches&&error.errorCode==='evaluation_unavailable')publicationDenied=true;else throw error;}
  if(!publicationDenied)throw Error('No-benefit or failed evaluation publication was not denied');
 }else try{await request('/api/knowledge/contributions/'+input.contributionId+'/decisions','POST',decision);}catch(error){const originalReceipt=await request('/api/learning/requests/'+decision.idempotencyKey,'GET').catch(()=>null);await writeEvidence(input.evidenceDirectory,'learning-publication-uncertain.json',{contributionId:input.contributionId,requestId:decision.idempotencyKey,originalReceipt,automaticPostRetries:0,automaticModelRetries:0,publicationVerified:false});throw error;}
 const publication=(await input.db.query("SELECT revision_id,head_generation,state FROM knowledge_publications WHERE id=$1 AND environment_id=$2",[input.publicationId,input.scope.environmentMarker])).rows;
 if(publication.length!==1||publication[0].state!=='published'||Number(publication[0].head_generation)!==prepared.baselineGeneration+(reviewed.state==='passed'?1:0)||reviewed.state==='passed'&&publication[0].revision_id!==prepared.revisionId)throw Error('Actual publication does not match the independently reviewed verdict');
 const result={contract:'pilot-hosted-learning-journey-v1',journey:'J014',...reviewed,publicationDenied,publicationId:input.publicationId,publicationGeneration:Number(publication[0].head_generation),pairedModelArms:16,originalBudgetId:config.binding.budgetId,originalAccountingPreserved:true,retirementVerified:true,automatedObservation:true,actualHumanObservation:false,fullHostedCatalogVerified:false};await writeEvidence(input.evidenceDirectory,'learning-completed.json',result);return result;
}
