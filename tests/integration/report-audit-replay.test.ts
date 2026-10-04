import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createProfileTestSession} from '../fixtures/profiles';
import {reportTransaction,reportDigest,executeReportCommand} from '../../lib/server/reports/commands';
import {readReportCommandReceipt} from '../../lib/server/reports/service';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {cleanupReportReceiptAudit,cleanupReportDecisionAudit,cleanupReportRevisionAudit,cleanupExpiredReportPreviews} from '../../lib/server/reports/cleanup';
import {insertReportRevisionFixture} from '../fixtures/reports/revision';
it('retains an expired technical identity but never replays its old result or reruns its mutation',async()=>{
 const actor=await reportTransaction(db=>createProfileTestSession(db,'panel')),requestKey=randomUUID();
 const schema=z.strictObject({action:z.literal('prepare'),requestKey:z.uuid(),expectedVersion:z.literal(0)});
 const command={action:'prepare' as const,requestKey,expectedVersion:0 as const};
 await reportTransaction(db=>db.query(`INSERT INTO report_command_receipts(id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,action,input_digest,result_ids,created_at)
  VALUES($1,$2,$3,$4,$5,$6,'prepare',$7,$8,now()-interval '731 days')`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,requestKey,reportDigest({customerId:DEMO_IDS.sharedCustomer,subjectId:null,command}),JSON.stringify({privateExpiredSentinel:'EXPIRED_RESULT_MUST_NOT_REPLAY'})]));
 let writes=0,projections=0;
 await expect(executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','prepare',schema,command,async()=>{writes++;return {};},async()=>{projections++;return 'EXPIRED_RESULT_MUST_NOT_REPLAY';})).rejects.toMatchObject({status:409,code:'payload_expired'});
 await expect(readReportCommandReceipt(actor,requestKey)).rejects.toMatchObject({status:409,code:'payload_expired'});
 expect(writes).toBe(0);expect(projections).toBe(0);
 await reportTransaction(async db=>{
  const receipt=(await db.query('SELECT id FROM report_command_receipts WHERE request_key=$1',[requestKey])).rows[0];
  const jobId=randomUUID(),lease=randomUUID();
  await db.query(`INSERT INTO report_cleanup_jobs(id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at,state,lease_token,lease_until)
   VALUES($1,$2,$3,$4,'audit_receipt',$5,$6,1,'audit_retention_v2',now(),'leased',$7,now()+interval '180 seconds')`,[jobId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,receipt.id,'0'.repeat(64),lease]);
  expect((await db.query('SELECT turas_report_purge_receipt_audit($1,$2,$3) AS purged',['wrong-environment',jobId,lease])).rows[0].purged).toBe(false);
  expect((await db.query('SELECT turas_report_purge_receipt_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,jobId,randomUUID()])).rows[0].purged).toBe(false);
  expect((await db.query('SELECT turas_report_purge_receipt_audit($1,$2,$3) AS purged',[process.env.TURAS_ENVIRONMENT_ID,jobId,lease])).rows[0].purged).toBe(false);
  await db.query('SAVEPOINT immutable_receipt');
  await expect(db.query("UPDATE report_command_receipts SET result_ids='{}' WHERE id=$1",[receipt.id])).rejects.toMatchObject({code:'23514'});
  await db.query('ROLLBACK TO SAVEPOINT immutable_receipt');
  await db.query('SET LOCAL ROLE turas_runtime');
  await db.query('SAVEPOINT runtime_receipt');
  await expect(db.query("UPDATE report_command_receipts SET result_ids='{}' WHERE id=$1",[receipt.id])).rejects.toMatchObject({code:'42501'});
  await db.query('ROLLBACK TO SAVEPOINT runtime_receipt');await db.query('RESET ROLE');
 });
 expect(await reportTransaction(async db=>{
  await db.query('SET LOCAL ROLE turas_runtime');
  return cleanupReportReceiptAudit(db);
 })).toEqual({claimed:1,purged:1});
 expect(await reportTransaction(async db=>(await db.query('SELECT action,result_ids FROM report_command_receipts WHERE request_key=$1',[requestKey])).rows[0])).toEqual({action:'expired',result_ids:{expired:true}});
 await expect(readReportCommandReceipt(actor,requestKey)).rejects.toMatchObject({status:409,code:'payload_expired'});
 await expect(executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','prepare',schema,command,async()=>{writes++;return {};},async()=>{projections++;return 'EXPIRED_RESULT_MUST_NOT_REPLAY';})).rejects.toMatchObject({status:409,code:'payload_expired'});
 expect(await reportTransaction(db=>cleanupReportReceiptAudit(db))).toEqual({claimed:0,purged:0});
 expect(writes).toBe(0);expect(projections).toBe(0);
 expect(await reportTransaction(async db=>(await db.query('SELECT 1 FROM report_command_receipts WHERE request_key=$1',[requestKey])).rowCount)).toBe(1);
});

it('minimizes expired decision audit under an exact lease without deleting approval identity',async()=>{
 const actor=await reportTransaction(db=>createProfileTestSession(db,'mcteer')),id=randomUUID(),subject=randomUUID(),request=randomUUID(),digest='a'.repeat(64);
 await reportTransaction(async db=>{
  await db.query(`INSERT INTO report_decisions(id,environment_id,workspace_id,customer_id,actor_membership_id,action,subject_id,expected_version,preview_digest,rationale_digest,request_key,created_at)
   VALUES($1,$2,$3,$4,$5,'reconcile',$6,1,$7,$7,$8,now()-interval '731 days')`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,subject,digest,request]);
  await db.query("INSERT INTO report_decision_payloads(decision_id,rationale,expires_at) VALUES($1,'EXPIRED_DECISION_SENTINEL',now()-interval '1 day')",[id]);
  const job=randomUUID(),lease=randomUUID();
  await db.query(`INSERT INTO report_cleanup_jobs(id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at,state,lease_token,lease_until)
   VALUES($1,$2,$3,$4,'audit_decision',$5,$6,1,'audit_retention_v2',now(),'leased',$7,now()+interval '180 seconds')`,[job,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,DEMO_IDS.sharedCustomer,id,'0'.repeat(64),lease]);
  for(const [env,token] of [['wrong-environment',lease],[process.env.TURAS_ENVIRONMENT_ID,randomUUID()],[process.env.TURAS_ENVIRONMENT_ID,lease]])expect((await db.query('SELECT turas_report_purge_decision_audit($1,$2,$3) AS purged',[env,job,token])).rows[0].purged).toBe(false);
 });
 expect(await reportTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return cleanupReportDecisionAudit(db);})).toEqual({claimed:1,purged:1});
 await reportTransaction(async db=>{
  const row=(await db.query('SELECT * FROM report_decisions WHERE id=$1',[id])).rows[0];
  expect(row).toMatchObject({id,subject_id:subject,request_key:request,action:'reconcile',actor_membership_id:null,preview_digest:'0'.repeat(64),rationale_digest:'0'.repeat(64)});
  expect(row.audit_expired_at).toBeTruthy();expect(row.created_at.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  expect((await db.query('SELECT 1 FROM report_decision_payloads WHERE decision_id=$1',[id])).rowCount).toBe(0);
  await db.query('SAVEPOINT denied_restore');
  await expect(db.query('UPDATE report_decisions SET actor_membership_id=$2 WHERE id=$1',[id,actor.membershipId])).rejects.toMatchObject({code:'23514'});
  await db.query('ROLLBACK TO SAVEPOINT denied_restore');
 });
 expect(await reportTransaction(db=>cleanupReportDecisionAudit(db))).toEqual({claimed:0,purged:0});
});

it('minimizes obsolete revision authorship only after payload expiry and preserves correction identity',async()=>{
 const fixture=await reportTransaction(db=>insertReportRevisionFixture(db));
 await reportTransaction(async db=>{
  await db.query('ALTER TABLE report_revisions DISABLE TRIGGER report_revisions_immutable');
  await db.query("UPDATE report_revisions SET created_at=now()-interval '731 days' WHERE id=$1",[fixture.revisionId]);
  await db.query('ALTER TABLE report_revisions ENABLE TRIGGER report_revisions_immutable');
 });
 expect((await reportTransaction(db=>cleanupReportRevisionAudit(db))).purged).toBe(0);
 await reportTransaction(async db=>{
  await db.query('DELETE FROM report_revision_payloads WHERE revision_id=$1',[fixture.revisionId]);
  await db.query("UPDATE report_revision_states SET visibility='expired',payload_expires_at=now()-interval '1 day' WHERE revision_id=$1",[fixture.revisionId]);
 });
 expect(await reportTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return cleanupReportRevisionAudit(db);})).toEqual({claimed:1,purged:1});
 await reportTransaction(async db=>{
  const row=(await db.query('SELECT id,report_id,content_digest,source_set_digest,author_membership_id,generation_watches,created_at,audit_expired_at FROM report_revisions WHERE id=$1',[fixture.revisionId])).rows[0];
  expect(row).toMatchObject({id:fixture.revisionId,report_id:fixture.reportId,content_digest:fixture.digest,source_set_digest:fixture.digest,author_membership_id:null,generation_watches:[]});
  expect(row.created_at.toISOString()).toBe('1970-01-01T00:00:00.000Z');expect(row.audit_expired_at).toBeTruthy();
 });
 expect(await reportTransaction(db=>cleanupReportRevisionAudit(db))).toEqual({claimed:0,purged:0});
});

it('purges only expired exact preview identities and never a current preview',async()=>{
 const actor=await reportTransaction(db=>createProfileTestSession(db,'mcteer')),expired=randomUUID(),current=randomUUID(),digest='b'.repeat(64),environment=process.env.TURAS_ENVIRONMENT_ID!;
 await reportTransaction(async db=>{
  for(const [id,interval] of [[expired,'-1 second'],[current,'5 minutes']])await db.query(`INSERT INTO report_previews(id,environment_id,workspace_id,customer_id,actor_membership_id,subject_id,kind,expected_version,binding_digest,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,'publication',1,$7,now()+$8::interval)`,[id,environment,actor.workspaceId,DEMO_IDS.sharedCustomer,actor.membershipId,randomUUID(),digest,interval]);
  for(const [env,id,hash] of [['wrong-environment',expired,digest],[environment,expired,'0'.repeat(64)],[environment,current,digest]])expect((await db.query('SELECT turas_report_purge_preview($1,$2,$3) AS purged',[env,id,hash])).rows[0].purged).toBe(false);
 });
 expect(await reportTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return cleanupExpiredReportPreviews(db);})).toEqual({claimed:1,purged:1});
 expect(await reportTransaction(async db=>(await db.query('SELECT id FROM report_previews WHERE id=ANY($1::uuid[])',[[expired,current]])).rows)).toEqual([{id:current}]);
});
