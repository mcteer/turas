import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {publishedReportFixture} from '../fixtures/reports/published';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
import {reportTransaction} from '../../lib/server/reports/commands';
import {verifyConfiguredReportSender,registerVerifiedReportSender} from '../../lib/server/reports/senders';
import {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy} from '../../lib/server/reports/recipient-policy';
import {previewReportSend,submitReportSendDecision} from '../../lib/server/reports/service';
import {claimReportDeliveries,dispatchReportDelivery} from '../../lib/server/reports/outbox';
import {submitReportDeliveryCommand} from '../../lib/server/reports/delivery-commands';

it('quarantines an actual process exit after provider acceptance and never resends the successful recipient',async()=>{
 const fixture=await publishedReportFixture();await requireOwnedReportsDatabase();
 const sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:process.env.TURAS_REPORT_SENDER_DOMAIN_ID,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
 await reportTransaction(db=>registerVerifiedReportSender(db,fixture.reviewer.workspaceId,sender));
 const policy=await reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:sender.id,recipients:['accepted','interrupted'].map(name=>({address:`${name}@example.invalid`,entitlementRationale:'Explicit synthetic recovery fixture entitlement'}))}));
 const review=await reportTransaction(db=>createReportPolicyPreview(db,fixture.reviewer,policy.policyId,'approve',1));
 await reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve two exact synthetic recovery recipients',previewId:review.previewId,previewDigest:review.previewDigest}));
 const input={action:'send' as const,policyId:policy.policyId,expectedVersion:fixture.published.version,expectedPolicyVersion:2};
 const preview=await previewReportSend(fixture.reviewer,fixture.published.publicationId,input);
 await submitReportSendDecision(fixture.reviewer,fixture.published.publicationId,{...input,requestKey:randomUUID(),rationale:'Authorize exact synthetic crash recovery fixture',previewId:preview.previewId,previewDigest:preview.previewDigest});
 const target=await reportTransaction(async db=>(await db.query('SELECT id,payload_digest FROM report_deliveries ORDER BY id LIMIT 1')).rows[0]);
 expect(await reportTransaction(db=>claimReportDeliveries(db,1,{deliveryId:target.id,payloadDigest:'0'.repeat(64),firstAttemptOnly:true}))).toEqual([]);
 expect(await reportTransaction(async db=>(await db.query('SELECT count(*)::int AS n FROM report_delivery_attempts')).rows[0].n)).toBe(0);
 const workers=await Promise.all([reportTransaction(db=>claimReportDeliveries(db,1,{deliveryId:target.id,payloadDigest:target.payload_digest,firstAttemptOnly:true})),reportTransaction(db=>claimReportDeliveries(db,1))]);
 const claims=workers.flat();expect(claims).toHaveLength(2);expect(new Set(claims.map(row=>row.id)).size).toBe(2);
 expect(workers[0][0].id).toBe(target.id);
 expect(await reportTransaction(db=>claimReportDeliveries(db,1,{deliveryId:target.id,payloadDigest:target.payload_digest,firstAttemptOnly:true}))).toEqual([]);
 let successfulPosts=0;
 expect((await dispatchReportDelivery(claims[0],async()=>{successfulPosts++;return new Response(JSON.stringify({id:randomUUID()}));})).state).toBe('provider_accepted');
 const directory=await mkdtemp(join(process.env.TURAS_REPORT_STORE_ROOT!,'recovery-')),marker=join(directory,'accepted.json');
 const program=`import {readFileSync,writeFileSync} from 'node:fs';import {dispatchReportDelivery} from './lib/server/reports/outbox.ts';const claim=JSON.parse(readFileSync(0,'utf8'));await dispatchReportDelivery(claim,async(url,options)=>{writeFileSync(process.env.RECOVERY_MARKER,JSON.stringify({providerKey:new Headers(options.headers).get('Idempotency-Key'),requestBytes:String(options.body)}),{mode:0o600,flag:'wx'});process.exit(91);});`;
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',program],{env:{...process.env,RECOVERY_MARKER:marker},input:JSON.stringify(claims[1]),encoding:'utf8',timeout:30000});
 expect(child.status).toBe(91);
 const accepted=JSON.parse(await readFile(marker,'utf8'));expect(accepted.providerKey).toBe(claims[1].provider_key);
 await reportTransaction(async db=>{
  const interrupted=(await db.query('SELECT state,attempt_count FROM report_deliveries WHERE id=$1',[claims[1].id])).rows[0];expect(interrupted).toMatchObject({state:'dispatching',attempt_count:1});
  expect((await db.query('SELECT 1 FROM report_attempt_results WHERE attempt_id=$1',[claims[1].attemptId])).rowCount).toBe(0);
  // Advance immutable first-dispatch time only in this explicitly owned fixture.
  await db.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_identity');
  await db.query("UPDATE report_deliveries SET first_dispatch_at=now()-interval '24 hours',lease_until=now()-interval '1 second' WHERE id=$1",[claims[1].id]);
  await db.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_identity');
 });
 expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
 expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
 await expect(dispatchReportDelivery(claims[1],async()=>{throw new Error('Stale process must never post');})).rejects.toMatchObject({code:'version_conflict'});
 const states=await reportTransaction(async db=>(await db.query('SELECT id,state,attempt_count,provider_key FROM report_deliveries ORDER BY id')).rows);
 expect(states.find(row=>row.id===claims[0].id)?.state).toBe('provider_accepted');
  expect(states.find(row=>row.id===claims[1].id)).toMatchObject({state:'uncertain',attempt_count:1,provider_key:accepted.providerKey});expect(successfulPosts).toBe(1);
  const uncertain=await reportTransaction(async db=>(await db.query('SELECT version FROM report_deliveries WHERE id=$1',[claims[1].id])).rows[0]);
  const messageId=randomUUID(),original=JSON.parse(accepted.requestBytes);
  const command={action:'reconcile',expectedVersion:Number(uncertain.version),requestKey:randomUUID(),rationale:'Reconcile the original interrupted synthetic delivery using exact provider evidence',providerMessageId:messageId};
  let lookups=0;
  const provider=async(_url:string,options:RequestInit)=>{
   expect(options.method).toBe('GET');lookups++;
   return new Response(JSON.stringify({...original,id:messageId,last_event:'delivered',cc:null,bcc:null}));
  };
  const reconciled=await submitReportDeliveryCommand(fixture.reviewer,claims[1].id,command,provider);
  expect(reconciled).toMatchObject({deliveryId:claims[1].id,state:'delivered',providerMessageId:messageId});
  // Lost acknowledgement replay uses the original receipt, never another lookup or POST.
  expect(await submitReportDeliveryCommand(fixture.reviewer,claims[1].id,command,provider)).toMatchObject({state:'delivered'});
  expect(lookups).toBe(1);expect(successfulPosts).toBe(1);
  expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
  await expect(submitReportDeliveryCommand(fixture.reviewer,claims[1].id,{...command,rationale:'Changed replay body'},provider)).rejects.toMatchObject({code:'request_conflict'});
},300000);
