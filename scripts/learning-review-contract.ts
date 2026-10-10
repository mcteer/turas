import {z} from 'zod';
import {learningArmOutputSchema,learningId,learningScoresSchema} from '../lib/contracts/learning';
import {learningPriceSchema} from '../lib/server/learning/pricing';
import {learningHash} from '../lib/server/learning/repository';
import {learningEvaluationVerdict} from '../lib/server/learning/evaluation-review';
import {learningEvaluationCatalogDigest,learningEvaluationRubricDigest,learningEvaluationModelIdentity} from '../lib/server/learning/evaluation-context';
import {learningEvaluationCases} from '../lib/learning/evaluation-cases';
const hash=z.string().regex(/^[a-f0-9]{64}$/),uint=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const learningActualCaptureSchema=z.object({
 version:z.literal('learning-actual-capture-v1'),sourceDigest:hash,rootAgentDigest:hash,catalogDigest:hash,rubricDigest:hash,modelIdentity:z.literal(learningEvaluationModelIdentity),evaluationId:learningId,budgetId:learningId,budgetMicroUsd:z.string().regex(/^[1-9]\d*$/).refine(value=>BigInt(value)<=25000000n),priceContract:learningPriceSchema,actualConfiguredProvider:z.literal(true),complete:z.literal(true),automaticPaidRetries:z.literal(0),
 arms:z.array(z.object({caseId:z.string().regex(/^E0[1-8]$/),purpose:z.enum(['evaluation_baseline','evaluation_candidate']),attemptId:learningId,nativeSessionId:z.string().min(1).max(200),nativeTurnId:z.string().min(1).max(200),output:learningArmOutputSchema,outputDigest:hash,contextDigest:hash,rawCaptureDigest:hash,modelSteps:z.literal(1),readCalls:z.literal(0),outputTokens:uint.max(8192),settlement:z.object({kind:z.enum(['actual','conservative_bound']),amountMicroUsd:z.string().regex(/^\d+$/),inputTokens:uint,outputTokens:uint,providerGenerationId:z.string().min(1).max(500).nullable(),ceilingMicroUsd:z.string().regex(/^[1-9]\d*$/)}).strict(),durationMs:uint.max(120000)}).strict()).length(16),
}).strict();
export const learningIndependentReviewSchema=z.object({version:z.literal('learning-independent-review-v1'),captureDigest:hash,sourceDigest:hash,catalogDigest:hash,rubricDigest:hash,reviewer:z.object({identity:z.string().trim().min(1).max(200),independent:z.literal(true),reviewedAt:z.string().datetime({offset:true})}).strict(),cases:z.array(z.object({caseId:z.string().regex(/^E0[1-8]$/),baselineCaptureDigest:hash,candidateCaptureDigest:hash,baseline:learningScoresSchema,candidate:learningScoresSchema,safetyPassed:z.boolean(),citationPassed:z.boolean(),authorityPassed:z.boolean(),rationale:z.string().trim().min(1).max(2000)}).strict()).length(8)}).strict();
export function verifyLearningActualCapture(raw:unknown){
 const capture=learningActualCaptureSchema.parse(raw);if(capture.catalogDigest!==learningEvaluationCatalogDigest()||capture.rubricDigest!==learningEvaluationRubricDigest())throw Error('Fixed learning catalog or rubric changed');
 const price=capture.priceContract;const expectedCeiling=(BigInt(price.providerInputLimit)*BigInt(price.inputMicroUsdPerMillion)+BigInt(price.providerOutputLimit)*BigInt(price.outputMicroUsdPerMillion)+999999n)/1000000n;
 let total=0n;const sessions=new Set<string>(),attempts=new Set<string>();
 capture.arms.forEach((arm,index)=>{if(arm.caseId!==learningEvaluationCases[Math.floor(index/2)].id||arm.purpose!==(index%2?'evaluation_candidate':'evaluation_baseline')||learningHash(arm.output)!==arm.outputDigest||sessions.has(arm.nativeSessionId)||attempts.has(arm.attemptId))throw Error('Missing, reordered, duplicated or changed actual capture');sessions.add(arm.nativeSessionId);attempts.add(arm.attemptId);const amount=BigInt(arm.settlement.amountMicroUsd),ceiling=BigInt(arm.settlement.ceilingMicroUsd);if(ceiling!==expectedCeiling||arm.settlement.providerGenerationId?.startsWith('synthetic')||total+ceiling>BigInt(capture.budgetMicroUsd)||amount>ceiling||arm.settlement.outputTokens!==arm.outputTokens||(arm.settlement.kind==='actual'&&!arm.settlement.providerGenerationId)||(arm.settlement.kind==='conservative_bound'&&amount<ceiling))throw Error('Incomplete or invalid actual/bounded accounting');total+=amount;});
 if(total>BigInt(capture.budgetMicroUsd))throw Error('Actual evaluation exceeded operator budget');return {capture,chargedMicroUsd:total.toString(),captureDigest:learningHash(capture)};
}
function assessLearningIndependentReview(rawCapture:unknown,rawReview:unknown){
 const verified=verifyLearningActualCapture(rawCapture),review=learningIndependentReviewSchema.parse(rawReview);if(review.captureDigest!==verified.captureDigest||review.sourceDigest!==verified.capture.sourceDigest||review.catalogDigest!==verified.capture.catalogDigest||review.rubricDigest!==verified.capture.rubricDigest)throw Error('Review does not identify the exact actual capture');
 const cases=review.cases.map((row,index)=>{const baseline=verified.capture.arms[index*2],candidate=verified.capture.arms[index*2+1];if(row.caseId!==baseline.caseId||row.baselineCaptureDigest!==baseline.outputDigest||row.candidateCaptureDigest!==candidate.outputDigest)throw Error('Independent review is incomplete, reordered or stale');const score=(value:typeof row.baseline)=>Object.values(value).reduce((sum,n)=>sum+n,0);return {caseId:row.caseId,baselineScore:score(row.baseline),candidateScore:score(row.candidate),safetyPassed:row.safetyPassed,citationPassed:row.citationPassed,authorityPassed:row.authorityPassed};});
 return {...verified,review,cases,verdict:learningEvaluationVerdict(cases)};
}
/** Per-practice publication verification still requires a measured improvement. */
export function verifyLearningIndependentReview(rawCapture:unknown,rawReview:unknown){
 const assessed=assessLearningIndependentReview(rawCapture,rawReview);if(assessed.verdict!=='passed')throw Error('Independent actual-model assessment did not pass all eight pairs');return assessed;
}
/** Feature proof may demonstrate correct rejection of a safe no-benefit candidate.
 * This verifier cannot authorize publication or convert a tie into improvement. */
export function verifyLearningFeatureAcceptance(rawCapture:unknown,rawReview:unknown){
 const assessed=assessLearningIndependentReview(rawCapture,rawReview);
 if(assessed.cases.some(row=>row.candidateScore<7||row.candidateScore<row.baselineScore||!row.safetyPassed||!row.citationPassed||!row.authorityPassed)||!['passed','failed'].includes(assessed.verdict))throw Error('Actual-model quality does not satisfy feature acceptance');
 return {...assessed,featureVerdict:'passed' as const,publicationVerdict:assessed.verdict,publicationPermitted:assessed.verdict==='passed'};
}
