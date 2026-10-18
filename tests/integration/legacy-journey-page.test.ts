import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {withTestDatabase} from '../fixtures/database';
import {createProfileTestSession} from '../fixtures/profiles';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {readJourneyPage} from '../../lib/server/profiles/journey-page';
import {readEligibleContext} from '../../lib/server/profiles/context';
import {readProfileHistory,listProfileRecords,listReviewQueue,listOwnSubmissions} from '../../lib/server/profiles/read';
import {listWorkspaceReview} from '../../lib/server/profiles/workspace-review';
import type {CustomerContext} from '../../lib/contracts/customer-journey';
it('journey draft/deny/resubmit/accept/correct/retract preserves exact history, explicit review and confidential original source',async()=>{
 const prior=process.env.TURAS_ENVIRONMENT_ID;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;
 try{await withTestDatabase(async db=>{await db.query('BEGIN');try{
  const admin=await createProfileTestSession(db,'mcteer'),member=await createProfileTestSession(db,'panel'),partner=await createProfileTestSession(db,'partner');
  const customerId=DEMO_IDS.sharedCustomer;
  const journey:CustomerContext={title:'Structured journey source',summary:'A user-supplied scoped customer operating observation.',scope:'A bounded delivery workflow',kind:'outcome',stage:'Adopt',observedAt:'2026-09-30',reviewAfter:'2026-12-30',confidence:'medium',source:{kind:'note',reference:'PRIVATE_SOURCE_REFERENCE_018',url:'https://example.com/private-original',excerpt:'PRIVATE_SOURCE_EXCERPT_018'},impact:{metric:'Weekly active administrators',unit:'%',baseline:20,current:40,target:50,direction:'increase',periodStart:'2026-09-01',periodEnd:'2026-09-30',basis:'measured',attribution:'Only this scoped fixture was measured.'}};
  const create={action:'propose_record',requestKey:randomUUID(),requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:journey.summary,sourceType:'manual',legacyJourney:journey}};
  const candidate=await submitProfileCommand(member,customerId,create,db) as {recordId:string;revisionId:string};
  expect(await submitProfileCommand(member,customerId,create,db)).toEqual(candidate);
  await expect(submitProfileCommand(member,customerId,{...create,payload:{...create.payload,text:'Different same-key content'}},db)).rejects.toMatchObject({status:409});
  const before=await readJourneyPage(member,customerId,{},db);expect(before.items).toContainEqual(expect.objectContaining({id:candidate.revisionId,reviewState:'pending',context:journey}));
  const facts=await readEligibleContext(member,customerId,{journeyOnly:true,offset:0},db) as {entries:unknown[]};expect(JSON.stringify(facts.entries)).not.toContain(candidate.revisionId);
  expect(JSON.stringify(await readJourneyPage(partner,customerId,{},db))).not.toContain(candidate.revisionId);
  await submitProfileCommand(admin,customerId,{action:'reject_revision',requestKey:randomUUID(),revisionId:candidate.revisionId,expectedRecordVersion:0,rationale:'The exact customer assertion needs correction.',partnerSafeReason:'The claim needs correction.'},db);
  expect((await readJourneyPage(member,customerId,{},db)).items).toContainEqual(expect.objectContaining({id:candidate.revisionId,reviewState:'rejected'}));
  const rejected=(await listWorkspaceReview(admin,{includeDenied:'true'},db));expect(rejected.items?.map(row=>row.id)).toContain(candidate.revisionId);
  let head=(await db.query('SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1',[candidate.recordId])).rows[0];
  const correctedJourney={...journey,summary:'A corrected human observation with its original measured scope.'};
  const revise={action:'propose_revision',requestKey:randomUUID(),recordId:candidate.recordId,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:null,workloadId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:correctedJourney.summary,sourceType:'manual',legacyJourney:correctedJourney}};
  const corrected=await submitProfileCommand(member,customerId,revise,db) as {revisionId:string};
  expect(await submitProfileCommand(member,customerId,revise,db)).toEqual(corrected);
  const revision=(await db.query('SELECT content_digest FROM profile_revisions WHERE id=$1',[corrected.revisionId])).rows[0];
  await expect(submitProfileCommand(partner,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:corrected.revisionId,digest:revision.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:null,rationale:'Partner cannot self approve this assertion.'},db)).rejects.toMatchObject({status:403});
  await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:corrected.revisionId,digest:revision.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:null,rationale:'Human reviewed the exact structured source and scope.',partnerSafeAttestation:'The scoped operating observation is suitable for delivery.'},db);
  const shared=await readJourneyPage(partner,customerId,{},db);const delivered=shared.items.find(item=>String((item as unknown as {id:string}).id)===corrected.revisionId)!;expect(delivered).toBeDefined();
  expect(delivered.context).toMatchObject({summary:correctedJourney.summary,impact:journey.impact,source:{reference:'Reviewed customer source'}});
  expect(JSON.stringify(shared)).not.toContain('PRIVATE_SOURCE_');expect(JSON.stringify(shared)).not.toContain('private-original');
  head=(await db.query('SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1',[candidate.recordId])).rows[0];
  await expect(submitProfileCommand(partner,customerId,{action:'propose_revision',requestKey:randomUUID(),recordId:candidate.recordId,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:corrected.revisionId,workloadId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:'An observation from a different supplied source.',sourceType:'manual',legacyJourney:{...delivered.context,source:{...delivered.context.source,reference:'A new legitimate source',excerpt:'New source evidence supplied by the partner.'}}}},db)).rejects.toMatchObject({status:422,code:'journey_source_change'});
  expect((await db.query('SELECT count(*)::int AS n FROM profile_revisions WHERE record_id=$1',[candidate.recordId])).rows[0].n).toBe(2);
  const partnerProposal=await submitProfileCommand(partner,customerId,{action:'propose_revision',requestKey:randomUUID(),recordId:candidate.recordId,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:corrected.revisionId,workloadId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:'Partner corrects only the shared customer observation.',sourceType:'manual',legacyJourney:{...delivered.context,summary:'Partner corrects only the shared customer observation.'}}},db) as {revisionId:string};
  const stored=(await db.query('SELECT payload FROM profile_revisions WHERE id=$1',[partnerProposal.revisionId])).rows[0].payload;expect(stored.legacyJourney.source).toEqual(journey.source);
  expect((await db.query('SELECT current_accepted_revision_id FROM profile_records WHERE id=$1',[candidate.recordId])).rows[0].current_accepted_revision_id).toBe(corrected.revisionId);
  const internal=await readJourneyPage(member,customerId,{},db);expect(internal.items.find(item=>String((item as unknown as {id:string}).id)===corrected.revisionId)?.context.source).toEqual(journey.source);
  await submitProfileCommand(admin,customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:corrected.revisionId,expectedRecordVersion:Number(head.version),rationale:'Human withdraws the original scoped assertion.'},db);
  expect(JSON.stringify((await readEligibleContext(member,customerId,{journeyOnly:true,offset:0},db) as {entries:unknown[]}).entries)).not.toContain(corrected.revisionId);
  expect((await readJourneyPage(member,customerId,{},db)).items).toContainEqual(expect.objectContaining({id:corrected.revisionId,reviewState:'retracted',context:correctedJourney,currentAcceptedRevisionId:null}));
  expect((await readJourneyPage(partner,customerId,{},db)).items.map(item=>item.id)).not.toContain(corrected.revisionId);
  const history=await readProfileHistory(admin,customerId,candidate.recordId,{},db);expect(JSON.stringify(history)).toContain(candidate.revisionId);expect(JSON.stringify(history)).toContain(corrected.revisionId);expect(JSON.stringify(history)).toContain('retracted');
  head=(await db.query('SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1',[candidate.recordId])).rows[0];
  const resubmitted=await submitProfileCommand(member,customerId,{...revise,requestKey:randomUUID(),expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:null},db) as {revisionId:string};
  expect(JSON.stringify((await readEligibleContext(member,customerId,{journeyOnly:true,offset:0},db) as {entries:unknown[]}).entries)).not.toContain(resubmitted.revisionId);
  await expect(readJourneyPage({...partner,workspaceId:randomUUID()},customerId,{},db)).rejects.toBeDefined();
 }finally{await db.query('ROLLBACK');}});}finally{process.env.TURAS_ENVIRONMENT_ID=prior;}
},60000);

it('reuses an identical active attachment proposal across request keys, but permits resubmission after denial',async()=>{
 const prior=process.env.TURAS_ENVIRONMENT_ID;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;
 try{await withTestDatabase(async db=>{await db.query('BEGIN');try{
  const admin=await createProfileTestSession(db,'mcteer'),member=await createProfileTestSession(db,'panel');
  const customerId=DEMO_IDS.sharedCustomer;
  const journey:CustomerContext={title:'Attachment intake',summary:'A supplied attachment awaiting exact human review.',scope:'Synthetic scoped delivery',kind:'note',stage:'Adopt',observedAt:'2026-09-30',reviewAfter:'2026-12-30',confidence:'medium',impact:null,source:{kind:'attachment',reference:'synthetic-brief.docx',url:'',excerpt:'Synthetic supplied attachment excerpt.'}};
  const command={action:'propose_record',requestKey:randomUUID(),requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'claim',text:journey.summary,sourceType:'manual',legacyJourney:journey}};
  const first=await submitProfileCommand(member,customerId,command,db) as {recordId:string;revisionId:string};
  const secondRequest={...command,requestKey:randomUUID()};
  expect(await submitProfileCommand(member,customerId,secondRequest,db)).toEqual(first);
  expect(await submitProfileCommand(member,customerId,secondRequest,db)).toEqual(first);
  expect((await db.query('SELECT count(*)::int n FROM profile_revisions WHERE record_id=$1',[first.recordId])).rows[0].n).toBe(1);
  const otherAuthor=await submitProfileCommand(admin,customerId,{...command,requestKey:randomUUID()},db) as {revisionId:string};
  expect(otherAuthor.revisionId).not.toBe(first.revisionId);
  await submitProfileCommand(admin,customerId,{action:'reject_revision',requestKey:randomUUID(),revisionId:first.revisionId,expectedRecordVersion:0,rationale:'The supplied source needs correction.',partnerSafeReason:'The source needs correction.'},db);
  const resubmitted=await submitProfileCommand(member,customerId,{...command,requestKey:randomUUID()},db) as {revisionId:string};
  expect(resubmitted.revisionId).not.toBe(first.revisionId);
  const note={...journey,source:{...journey.source,kind:'note'}};
  const noteCommand={...command,payload:{...command.payload,legacyJourney:note}};
  const one=await submitProfileCommand(member,customerId,{...noteCommand,requestKey:randomUUID()},db) as {revisionId:string};
  const two=await submitProfileCommand(member,customerId,{...noteCommand,requestKey:randomUUID()},db) as {revisionId:string};
  expect(one.revisionId).not.toBe(two.revisionId);
 }finally{await db.query('ROLLBACK');}});}finally{process.env.TURAS_ENVIRONMENT_ID=prior;}
},60000);

it('pages all 101 immutable history revisions without duplicates and binds the cursor to its record and actor',async()=>{
 const prior=process.env.TURAS_ENVIRONMENT_ID;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;
 try{await withTestDatabase(async db=>{await db.query('BEGIN');try{
  const admin=await createProfileTestSession(db,'mcteer'),member=await createProfileTestSession(db,'panel');
  const customerId=DEMO_IDS.sharedCustomer;
  const first=await submitProfileCommand(member,customerId,{action:'propose_record',requestKey:randomUUID(),requestedAudience:'internal',dataCategory:'other_internal',payload:{kind:'claim',text:'Synthetic retained history fixture.',sourceType:'manual'}},db) as {recordId:string;revisionId:string};
  // Seed retained history only; the behavior under test is the real authorized,
  // keyset-paginated reader, including equal timestamps and its cursor binding.
  await db.query(`INSERT INTO profile_revisions(id,record_id,workspace_id,customer_id,revision_number,
    base_accepted_revision_id,payload_schema_version,payload,quality_input,author_membership_id,
    origin,audience,data_category,source_references,content_digest,submission_channel,created_at)
    SELECT gen_random_uuid(),record_id,workspace_id,customer_id,n,NULL,payload_schema_version,
      payload,quality_input,author_membership_id,origin,audience,data_category,source_references,
      content_digest,submission_channel,created_at FROM profile_revisions CROSS JOIN generate_series(2,101) n WHERE id=$1`,[first.revisionId]);
  const expected=(await db.query('SELECT id FROM profile_revisions WHERE record_id=$1 ORDER BY created_at DESC,id DESC',[first.recordId])).rows.map(row=>row.id);
  const ids:string[]=[];let cursor:string|undefined,firstCursor:string|undefined,pages=0;
  do{
   const page=await readProfileHistory(admin,customerId,first.recordId,{limit:25,cursor},db);
   ids.push(...page.items.map(row=>String(row.id)));pages++;
   firstCursor??=page.nextCursor??undefined;cursor=page.nextCursor??undefined;
  }while(cursor&&pages<6);
  expect(ids).toEqual(expected);expect(new Set(ids).size).toBe(101);expect(pages).toBe(5);expect(cursor).toBeUndefined();
  // The same timestamp contract governs the journey collection, review queue
  // and own submissions. Exercise each actual reader against this tied cohort.
  type Result={items?:Record<string,unknown>[];pending?:Record<string,unknown>[];nextCursor:string|null};
  for(const read of [
   (cursor?:string)=>listProfileRecords(member,customerId,{limit:25,cursor,query:'Synthetic retained history fixture.'},db),
   (cursor?:string)=>listReviewQueue(admin,customerId,{limit:25,cursor},db),
   (cursor?:string)=>listOwnSubmissions(member,customerId,{limit:25,cursor},db),
  ]){
   const all:string[]=[];let next:string|undefined,rounds=0;
   do{const result=await read(next) as Result;all.push(...(result.items??result.pending??[]).filter(row=>row.recordId===first.recordId).map(row=>String(row.id)));next=result.nextCursor??undefined;rounds++;}while(next&&rounds<10);
   expect(all).toEqual(expected);expect(next).toBeUndefined();
  }
  await expect(readProfileHistory(member,customerId,first.recordId,{cursor:firstCursor},db)).rejects.toMatchObject({status:422});
  await expect(readProfileHistory(admin,customerId,randomUUID(),{cursor:firstCursor},db)).rejects.toMatchObject({status:422});
 }finally{await db.query('ROLLBACK');}});}finally{process.env.TURAS_ENVIRONMENT_ID=prior;}
},60000);
