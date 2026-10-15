import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {POST as login} from '../../app/api/auth/login/route';
import {getCurrentSession,type CurrentSession} from '../../lib/server/auth/sessions';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {reviewSolutionPattern,searchSolutionPatterns,inspectSolutionKnowledge,reviewSolutionApplication} from '../../lib/server/knowledge/workspace-patterns/repository';
import {reviewLearningContribution,getAdoptionPatterns} from '../../lib/server/learning/customer-adoption/repository';
import {fitDimensions} from '../../lib/contracts/solution-patterns';
const isolatedTestUrl=requireTestDatabaseUrl();
beforeAll(()=>{process.env.DATABASE_URL=isolatedTestUrl;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
async function actor(username:string,password:string):Promise<CurrentSession>{
 const origin=process.env.TURAS_APP_ORIGIN!;const result=await login(new Request(`${origin}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username,password})}));
 const session=await getCurrentSession(new Request(origin,{headers:{cookie:result.headers.get('set-cookie')!.split(';')[0]}}));if(!session)throw Error('Fixture identity unavailable');return session;
}
it('retains complete reviewed patterns and target fit, invalidates withdrawn source lineage, and suppresses small adoption cohorts',async()=>{
 const db=new Client({connectionString:isolatedTestUrl});await db.connect();
 try{
  const author=await actor('panel',process.env.PANEL_PASSWORD!),admin=await actor('mcteer',process.env.TURAS_DEMO_PASSWORD!);
  const identity={...admin,userId:admin.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  const customerId=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Local knowledge fixture',false)",[customerId,admin.workspaceId]);
  const journey={title:'Measured execution pilot',summary:'Reviewed local fixture measurement and operating handoff.',scope:'A bounded synthetic pilot',kind:'outcome',stage:'Adopt',observedAt:'2026-09-30',reviewAfter:'2026-12-01',confidence:'high',source:{kind:'note',reference:'Synthetic measured note',url:'',excerpt:'Synthetic approved customer observation.'},impact:{metric:'Weekly active administrators',unit:'%',baseline:20,current:40,target:50,direction:'increase',periodStart:'2026-09-01',periodEnd:'2026-09-30',basis:'measured',attribution:'Only the bounded synthetic pilot was measured.'}};
  const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:journey.summary,sourceType:'manual',legacyJourney:journey}}) as {revisionId:string;recordId:string};
  const head=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
  await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:head.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:head.current_accepted_revision_id,rationale:'Independently reviewed the exact synthetic source measurement.'});
  const accepted=(await db.query('SELECT version FROM profile_records WHERE id=$1',[proposed.recordId])).rows[0];
  const correction=await submitProfileCommand(author,customerId,{action:'propose_revision',requestKey:randomUUID(),recordId:proposed.recordId,expectedRecordVersion:Number(accepted.version),expectedAcceptedRevisionId:proposed.revisionId,workloadId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:'A corrected human summary with the original measured pilot preserved.',sourceType:'manual'}}) as {revisionId:string};
  const corrected=(await db.query('SELECT payload FROM profile_revisions WHERE id=$1',[correction.revisionId])).rows[0].payload;
  expect(corrected.legacyJourney).toMatchObject({summary:'A corrected human summary with the original measured pilot preserved.',impact:journey.impact,source:journey.source,stage:journey.stage});
  expect((await db.query('SELECT current_accepted_revision_id FROM profile_records WHERE id=$1',[proposed.recordId])).rows[0].current_accepted_revision_id).toBe(proposed.revisionId);
  const paragraph='A bounded isolated execution workflow with explicit operating ownership.';
  const pattern={title:'Isolated execution handoff',problem:paragraph,prerequisites:paragraph,approach:paragraph,delivery:paragraph,processAndAdoption:paragraph,limitations:paragraph,alternatives:paragraph,lessons:paragraph,outcome:{basis:'measured' as const,description:paragraph,measurementLimits:'Only a bounded pilot with a reviewed baseline was measured.'},reviewAfter:'2026-12-01'};
  const command={action:'publish' as const,patternId:randomUUID(),expectedVersion:0,requestId:randomUUID(),rationale:'Reviewed the complete generalized synthetic derivative.',sourceRecordId:proposed.revisionId,pattern,attestation:{generalizedContentReviewed:true as const,workspaceReuseApproved:true as const,outcomeBasisVerified:true as const}};
  expect(await reviewSolutionPattern(identity,customerId,command)).toMatchObject({version:1,action:'publish'});
  expect(await reviewSolutionPattern(identity,customerId,command)).toMatchObject({version:1});
  await expect(reviewSolutionPattern(identity,customerId,{...command,rationale:'A different rationale for the same idempotency key.'})).rejects.toMatchObject({status:409});
  expect((await searchSolutionPatterns(identity,customerId,'isolated execution')).patterns[0].pattern).toEqual(pattern);
  const inspected=await inspectSolutionKnowledge(identity,customerId);
  const application={applicationId:randomUUID(),requestId:randomUUID(),expectedVersion:0,action:'approve' as const,pattern:{patternId:command.patternId,version:1},targetContextHash:inspected.targetContextHash,fit:fitDimensions.map(dimension=>({dimension,status:'compatible' as const,evidence:paragraph,adaptation:paragraph})),validationPlan:paragraph,rationale:paragraph,targetApprovalConfirmed:true as const};
  await reviewSolutionApplication(identity,customerId,application);
  expect((await inspectSolutionKnowledge(identity,customerId)).applications[0].eligibility).toBe('current');
  await expect(reviewSolutionApplication(identity,customerId,{...application,applicationId:randomUUID(),requestId:randomUUID(),fit:application.fit.map((item,index)=>index?item:{...item,status:'unknown'})})).rejects.toThrow('Resolve unknown');
  await reviewLearningContribution(identity,customerId,{action:'include',requestId:randomUUID(),quarter:'2026-Q3',expectedVersion:0,rationale:'Explicitly approved this measured fixture for portfolio reuse.',sourceRecordId:proposed.revisionId,contribution:{baselineActive:2,currentActive:4,eligibleAdministrators:10,intervention:'enablement_and_handoff',definitionAndSamePopulationConfirmed:true}});
  expect(await getAdoptionPatterns(identity,'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
  const current=(await db.query('SELECT version FROM profile_records WHERE id=$1',[proposed.recordId])).rows[0];
  await submitProfileCommand(admin,customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,expectedRecordVersion:Number(current.version),rationale:'Withdrew the synthetic source to verify derivative invalidation.'});
  expect((await searchSolutionPatterns(identity,customerId,'isolated execution')).patterns).toEqual([]);
  expect((await inspectSolutionKnowledge(identity,customerId)).applications[0].eligibility).toBe('pattern_unavailable');
  expect(await getAdoptionPatterns(identity,'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
 }finally{await db.end();}
});
