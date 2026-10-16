import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {getAdoptionPatterns,reviewLearningContribution} from '../../lib/server/learning/customer-adoption/repository';
import type {AppIdentity} from '../../lib/server/research/specialists/identity';
import type {LearningCommand} from '../../lib/contracts/customer-adoption';
const isolated=requireTestDatabaseUrl();
beforeAll(()=>{const url=new URL(isolated);url.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=url.href;process.env.DATABASE_URL_UNPOOLED=url.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('suppresses5+4, computes equal-account5+5 means, and invalidates consent/source loss without disclosing account rows',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const admin=await isolatedChatActor(db,'internal','admin'),author=await isolatedChatActor(db,'internal','member',admin.workspaceId);
  const identity:AppIdentity={...admin,userId:admin.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  const included:Array<{customerId:string;revisionId:string;recordId:string;command:Extract<LearningCommand,{action:'include'}>}>=[];
  for(let i=0;i<10;i++){
   const customerId=randomUUID(),population=i===0?2:100,baseline=i===0?1:i<5?i*10:10,current=i===0?2:baseline+10;
   await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic explicitly contributed account',false)",[customerId,admin.workspaceId]);
   const journey={title:'Reviewed measured pilot',summary:'Synthetic scoped customer operating measurement.',scope:'One governed execution pilot',kind:'outcome',stage:'Adopt',observedAt:'2026-09-30',reviewAfter:'2026-12-01',confidence:'high',source:{kind:'note',reference:'Synthetic private measurement',url:'',excerpt:'Exact synthetic source measurement.'},impact:{metric:'Weekly active administrators',unit:'%',baseline:100*baseline/population,current:100*current/population,target:null,direction:'increase',periodStart:'2026-09-01',periodEnd:'2026-09-30',basis:'measured',attribution:'Only this synthetic pilot and unchanged eligible population.'}};
   const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:journey.summary,sourceType:'manual',legacyJourney:journey}}) as {revisionId:string;recordId:string};
   const command:Extract<LearningCommand,{action:'include'}>={action:'include',requestId:randomUUID(),quarter:'2026-Q3',expectedVersion:0,rationale:'Separately approve the exact measurement for restricted portfolio reuse.',sourceRecordId:proposed.revisionId,contribution:{baselineActive:baseline,currentActive:current,eligibleAdministrators:population,intervention:i<5?'enablement_and_handoff':'no_recorded_intervention',definitionAndSamePopulationConfirmed:true}};
   if(i===0)await expect(reviewLearningContribution(identity,customerId,command)).rejects.toMatchObject({status:409});
   const head=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
   await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:head.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:head.current_accepted_revision_id,rationale:'Reviewed this exact synthetic measured source independently of portfolio reuse.'});
   if(i===9)expect(await getAdoptionPatterns(identity,'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
   const receipt=await reviewLearningContribution(identity,customerId,command);
   expect(await reviewLearningContribution(identity,customerId,command)).toEqual(receipt);
   await expect(reviewLearningContribution(identity,customerId,{...command,rationale:'Changed content with the same request identity.'})).rejects.toMatchObject({status:409});
   included.push({customerId,revisionId:proposed.revisionId,recordId:proposed.recordId,command});
  }
  const report=await getAdoptionPatterns(identity,'2026-Q3');
  expect(report).toMatchObject({status:'available',groups:[
   {intervention:'enablement_and_handoff',accountCount:5,meanBaselinePercent:30,meanCurrentPercent:48,meanChangePercentagePoints:18},
   {intervention:'no_recorded_intervention',accountCount:5,meanBaselinePercent:10,meanCurrentPercent:20,meanChangePercentagePoints:10},
  ]});
  for(const row of included){expect(JSON.stringify(report)).not.toContain(row.customerId);expect(JSON.stringify(report)).not.toContain(row.revisionId);}
  expect(JSON.stringify(report)).not.toContain('Synthetic private measurement');
  await expect(getAdoptionPatterns({...identity,...author,userId:author.principalId},'2026-Q3')).rejects.toMatchObject({status:403});
  const secondAdmin=await isolatedChatActor(db,'internal','admin',admin.workspaceId);
  expect(await getAdoptionPatterns({...secondAdmin,userId:secondAdmin.principalId,environmentId:identity.environmentId},'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
  const last=included[9];
  await reviewLearningContribution(identity,last.customerId,{action:'revoke',requestId:randomUUID(),quarter:'2026-Q3',expectedVersion:1,rationale:'Withdraw explicit portfolio reuse consent.'});
  expect(await getAdoptionPatterns(identity,'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
  await reviewLearningContribution(identity,last.customerId,{...last.command,requestId:randomUUID(),expectedVersion:2});
  expect((await getAdoptionPatterns(identity,'2026-Q3')).status).toBe('available');
  const head=(await db.query('SELECT version FROM profile_records WHERE id=$1',[last.recordId])).rows[0];
  await submitProfileCommand(admin,last.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:last.revisionId,expectedRecordVersion:Number(head.version),rationale:'Withdraw the underlying exact measurement source.'});
  expect(await getAdoptionPatterns(identity,'2026-Q3')).toMatchObject({status:'insufficient_evidence',groups:[]});
  await expect(reviewLearningContribution(identity,last.customerId,{...last.command,requestId:randomUUID(),expectedVersion:3})).rejects.toMatchObject({status:409});
 }finally{await db.end();}
});
