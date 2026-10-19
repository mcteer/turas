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
