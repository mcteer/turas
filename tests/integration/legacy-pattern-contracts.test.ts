import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {reviewSolutionPattern,reviewSolutionApplication,inspectSolutionKnowledge,searchSolutionPatterns} from '../../lib/server/knowledge/workspace-patterns/repository';
import {fitDimensions,type ApplicationCommand,type PatternCommand} from '../../lib/contracts/solution-patterns';
import type {AppIdentity} from '../../lib/server/research/specialists/identity';
const url=requireTestDatabaseUrl();
beforeAll(()=>{process.env.DATABASE_URL=url;process.env.DATABASE_URL_UNPOOLED=url;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('invalidates target applications after accepted context changes and preserves exact versioned withdrawal and replay after pattern withdrawal',async()=>{
 const db=new Client({connectionString:url});await db.connect();try{
  const admin=await isolatedChatActor(db,'internal','admin'),author=await isolatedChatActor(db,'internal','member',admin.workspaceId);
  const identity:AppIdentity={...admin,userId:admin.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  const sourceCustomer=randomUUID(),targetCustomer=randomUUID();
  for(const id of [sourceCustomer,targetCustomer])await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic pattern contract account',false)",[id,admin.workspaceId]);
  async function accepted(customerId:string,text:string){
   const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text,sourceType:'manual'}}) as {revisionId:string};
   const row=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
   await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:row.content_digest,expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Reviewed this exact synthetic original independently.'});return proposed.revisionId;
  }
  const sourceRecordId=await accepted(sourceCustomer,'Synthetic independently reviewed source practice.' );await accepted(targetCustomer,'Synthetic accepted target constraint baseline.');
  const text='Synthetic generalized operating guidance with exact separately reviewed applicability.';
  const patternId=randomUUID(),publish:PatternCommand={action:'publish',patternId,expectedVersion:0,requestId:randomUUID(),rationale:text,sourceRecordId,pattern:{title:'Synthetic reusable bounded practice',problem:text,prerequisites:text,approach:text,delivery:text,processAndAdoption:text,limitations:text,alternatives:text,lessons:text,outcome:{basis:'approved_design',description:text,measurementLimits:text},reviewAfter:'2099-01-01'},attestation:{generalizedContentReviewed:true,workspaceReuseApproved:true,outcomeBasisVerified:true}};
  await reviewSolutionPattern(identity,sourceCustomer,publish);
  const current=await inspectSolutionKnowledge(identity,targetCustomer),application:ApplicationCommand={action:'approve',applicationId:randomUUID(),requestId:randomUUID(),expectedVersion:0,pattern:{patternId,version:1},targetContextHash:current.targetContextHash,fit:fitDimensions.map(dimension=>({dimension,status:'compatible',evidence:text,adaptation:text})),validationPlan:text,rationale:text,targetApprovalConfirmed:true};
  const approved=await reviewSolutionApplication(identity,targetCustomer,application);expect(await reviewSolutionApplication(identity,targetCustomer,application)).toEqual(approved);expect((await inspectSolutionKnowledge(identity,targetCustomer)).applications[0].eligibility).toBe('current');
  await accepted(targetCustomer,'Synthetic newly accepted target constraint changes applicability.');
  expect((await inspectSolutionKnowledge(identity,targetCustomer)).applications[0].eligibility).toBe('context_changed');
  await expect(reviewSolutionApplication(identity,targetCustomer,{...application,applicationId:randomUUID(),requestId:randomUUID()})).rejects.toMatchObject({code:'solution_knowledge_changed'});
  await reviewSolutionPattern(identity,sourceCustomer,{action:'withdraw',patternId,expectedVersion:1,requestId:randomUUID(),rationale:text});
  expect((await searchSolutionPatterns(identity,targetCustomer,'bounded practice')).patterns).toEqual([]);expect((await inspectSolutionKnowledge(identity,targetCustomer)).applications[0].eligibility).toBe('pattern_unavailable');
  const withdrawal:ApplicationCommand={...application,action:'withdraw',requestId:randomUUID(),expectedVersion:1,fit:application.fit.map((row,index)=>index?row:{...row,status:'unknown'}),rationale:'Explicitly withdraw this prior adaptation after its pattern was withdrawn.'};
  const withdrawn=await reviewSolutionApplication(identity,targetCustomer,withdrawal);expect(withdrawn).toMatchObject({version:2,action:'withdraw'});expect(await reviewSolutionApplication(identity,targetCustomer,withdrawal)).toEqual(withdrawn);expect((await inspectSolutionKnowledge(identity,targetCustomer)).applications[0].eligibility).toBe('withdrawn');
  await expect(reviewSolutionApplication(identity,targetCustomer,{...withdrawal,rationale:'Different content with the exact retained request identity.'})).rejects.toMatchObject({code:'solution_knowledge_changed'});
  await expect(reviewSolutionApplication(identity,targetCustomer,{...withdrawal,requestId:randomUUID(),expectedVersion:1})).rejects.toMatchObject({code:'solution_knowledge_changed'});
  expect(Number((await db.query('SELECT count(*) AS n FROM workspace_solution_applications WHERE application_id=$1',[application.applicationId])).rows[0].n)).toBe(2);
 }finally{await db.end();}
});
