import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client,type PoolClient} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {installLearningSyntheticPrice} from '../../fixtures/learning/native-preparation';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {issueSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {pilotHostedRequest} from '../../../scripts/pilot-hosted-request';
import {runHostedKnowledgeBaseline} from '../../../scripts/pilot-hosted-knowledge';
import {prepareHostedLearningEvaluation} from '../../../scripts/pilot-hosted-learning';
import {activateLearning} from '../../../scripts/learning-activate';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
it('prepares one actual HTTP feedback revision and independent review against the ordinarily published baseline without a model dispatch',async()=>{
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   const f=await pilotPublishedKnowledgeFixture(db as unknown as PoolClient,'synthetic_pilot');installLearningSyntheticPrice();
   const member=randomUUID();await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[member,DEMO_IDS.panel,f.actor.workspaceId]);
   const admin=await issueSession({principalId:DEMO_IDS.mcteer,loginName:'mcteer',displayName:'mcteer',membershipId:f.actor.membershipId,workspaceId:f.actor.workspaceId,kind:'internal',role:'admin'});
   const author=await issueSession({principalId:DEMO_IDS.panel,loginName:'panel',displayName:'panel',membershipId:member,workspaceId:f.actor.workspaceId,kind:'internal',role:'member'});
   const headers=(token:string)=>new Headers({cookie:sessionCookieName()+'='+token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(token)});
   const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:environment.origin,environmentMarker:environment.environmentId,workspaceId:f.actor.workspaceId,target:'preview',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
   await closeRuntimePool();await environment.start();
   const reviewerRequest=pilotHostedRequest({scope,headers:headers(admin.token),signal:environment.signal}),authorRequest=pilotHostedRequest({scope,headers:headers(author.token),signal:environment.signal});
   const baseline=await runHostedKnowledgeBaseline({scope,db,customerId:f.customerId,sourceRevisionId:f.originalRevisionId,request:reviewerRequest,authorRequest,signal:environment.signal});
   await expect(prepareHostedLearningEvaluation({scope,db,...baseline,sourceRevisionId:f.originalRevisionId,authorRequest,reviewerRequest,signal:environment.signal})).rejects.toThrow('activated synthetic');
   await activateLearning(environment.environmentId,f.actor.workspaceId,true,requireOwnedPilotDatabase(process.env,true));
   const result=await prepareHostedLearningEvaluation({scope,db,...baseline,sourceRevisionId:f.originalRevisionId,authorRequest,reviewerRequest,signal:environment.signal});
   expect(result).toMatchObject({modelCalls:0,normalCommandsOnly:true,pairedCapturesVerified:false,benefitVerified:false});
   const actual=(await db.query('SELECT c.author_membership_id,r.revision_number,p.revision_id AS published_revision,e.revision_id AS evaluated_revision,e.state FROM knowledge_contributions c JOIN knowledge_revisions r ON r.contribution_id=c.id AND r.revision_number=c.current_revision_number JOIN knowledge_publications p ON p.contribution_id=c.id JOIN learning_evaluations e ON e.contribution_id=c.id WHERE e.id=$1',[result.evaluationId])).rows[0];
   expect(actual).toMatchObject({author_membership_id:member,revision_number:2,published_revision:baseline.revisionId,evaluated_revision:result.revisionId,state:'prepared'});
   expect((await db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(0);
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:300000});
},330000);

it('submits exact reviewed paired captures over HTTP and preserves no-benefit rejection without another model call',async()=>{
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   installLearningSyntheticPrice();
   const {learningCompletedEvaluation}=await import('../../fixtures/learning/completed-evaluation'),{readLearningEvaluationCapture}=await import('../../../lib/server/learning/evaluation-captures'),{submitHostedLearningIndependentReview}=await import('../../../scripts/pilot-hosted-learning-journey'),{mkdtemp,rm}=await import('node:fs/promises'),{resolve,join}=await import('node:path');
   const f=await learningCompletedEvaluation(db as unknown as PoolClient),issued=await issueSession({principalId:f.actors.admin.principalId,loginName:'mcteer',displayName:'mcteer',membershipId:f.actors.admin.membershipId,workspaceId:f.workspaceId,kind:'internal',role:'admin'}),headers=new Headers({cookie:sessionCookieName()+'='+issued.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
   const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:'https://owned-learning.vercel.app',environmentMarker:environment.environmentId,workspaceId:f.workspaceId,target:'preview',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)},cases=[];
   for(let i=1;i<=8;i++){const caseId='E0'+i,baseline=await readLearningEvaluationCapture(f.actors.admin,f.evaluationId,caseId,'evaluation_baseline'),candidate=await readLearningEvaluationCapture(f.actors.admin,f.evaluationId,caseId,'evaluation_candidate');if(!('outputDigest'in baseline.arm)||!('outputDigest'in candidate.arm))throw Error('Actual owned synthetic output digests required');cases.push({caseId,baselineCaptureDigest:baseline.arm.outputDigest,candidateCaptureDigest:candidate.arm.outputDigest,baseline:{fidelity:2,applicability:2,unknownHandling:2,usefulness:1},candidate:{fidelity:2,applicability:2,unknownHandling:2,usefulness:1},safetyPassed:true,citationPassed:true,authorityPassed:true,rationale:'Owned synthetic composition scores only: identical fixed captures establish no measured improvement or hosted quality.'});}
   const root=await mkdtemp(resolve('local-artifacts/016/learning-review-http-'));
   try{
    await closeRuntimePool();await environment.start();const transport:typeof fetch=async(url,options)=>{const incoming=new URL(String(url));if(incoming.origin!==scope.origin)throw Error('Controlled owned HTTP scope required');return fetch(environment.origin+incoming.pathname+incoming.search,options);};const request=pilotHostedRequest({scope,headers,signal:environment.signal,transport}),review={contract:'pilot-hosted-learning-independent-review-v1',scope,evaluationId:f.evaluationId,captureManifestDigest:'c'.repeat(64),reviewerReference:'Owned independent-review composition fixture; no actual model quality claim',method:'automated-independent-review',reviewedAt:new Date().toISOString(),cases},args={scope,evaluationId:f.evaluationId,captureManifestDigest:review.captureManifestDigest,review,request,evidenceDirectory:join(root,'accepted'),signal:environment.signal}, {mkdir}=await import('node:fs/promises');
    await mkdir(args.evidenceDirectory,{mode:0o700});
    await expect(submitHostedLearningIndependentReview({...args,review:{...review,captureManifestDigest:'d'.repeat(64)}})).rejects.toThrow('Exact complete');
    await expect(submitHostedLearningIndependentReview({...args,review:{...review,cases:cases.slice(1)}})).rejects.toThrow();
    expect((await db.query('SELECT count(*)::int AS n FROM learning_case_reviews WHERE evaluation_id=$1',[f.evaluationId])).rows[0].n).toBe(0);
    const wrong=join(root,'wrong-capture');await mkdir(wrong,{mode:0o700});
    await expect(submitHostedLearningIndependentReview({...args,evidenceDirectory:wrong,review:{...review,cases:cases.map((row,i)=>i?row:{...row,candidateCaptureDigest:'f'.repeat(64)})}})).rejects.toThrow();
    expect((await db.query('SELECT count(*)::int AS n FROM learning_case_reviews WHERE evaluation_id=$1',[f.evaluationId])).rows[0].n).toBe(0);
    const dispatches=Number((await db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n),result=await submitHostedLearningIndependentReview(args);
    expect(result).toMatchObject({state:'failed',reviewedCases:8,reviewMethod:'automated-independent-review',actualHumanReviewVerified:false});
    expect((await db.query('SELECT state FROM learning_evaluations WHERE id=$1',[f.evaluationId])).rows[0].state).toBe('failed');
    expect(Number((await db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n)).toBe(dispatches);
    expect((await db.query('SELECT count(*)::int AS n FROM learning_release_decisions WHERE evaluation_id=$1',[f.evaluationId])).rows[0].n).toBe(0);
   }finally{await rm(root,{recursive:true,force:true});}
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:300000});
},330000);
