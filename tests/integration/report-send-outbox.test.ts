import {beforeAll,describe,it,expect} from 'vitest';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {publishedReportFixture} from '../fixtures/reports/published';
import {reportTransaction} from '../../lib/server/reports/commands';
import {verifyConfiguredReportSender,registerVerifiedReportSender} from '../../lib/server/reports/senders';
import {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy} from '../../lib/server/reports/recipient-policy';
import {previewReportSend,submitReportSendDecision} from '../../lib/server/reports/service';
import {claimReportDeliveries,dispatchReportDelivery} from '../../lib/server/reports/outbox';
import {acceptReportWebhook} from '../../lib/server/reports/webhooks';
import {cleanupReportRevisionPayloads,cleanupReportDeliveryAudit,cleanupUnmatchedReportEvents} from '../../lib/server/reports/cleanup';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
import {invalidateReportSource} from '../../lib/server/reports/invalidation';
describe('persistent exact-review send and durable outbox',()=>{
 let fixture:Awaited<ReturnType<typeof publishedReportFixture>>;
 let policyId:string;
 beforeAll(async()=>{
  fixture=await publishedReportFixture();
  const domainId=process.env.TURAS_REPORT_SENDER_DOMAIN_ID!;
  const verified=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:domainId,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
  await reportTransaction(db=>registerVerifiedReportSender(db,fixture.reviewer.workspaceId,verified));
  const policy=await reportTransaction(db=>createReportRecipientPolicy(db,fixture.reviewer,fixture.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[fixture.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:verified.id,recipients:[{address:'synthetic-recipient@example.invalid',entitlementRationale:'Explicitly approved synthetic transport fixture'}]}));policyId=policy.policyId;
  const preview=await reportTransaction(db=>createReportPolicyPreview(db,fixture.reviewer,policyId,'approve',1));
  await reportTransaction(db=>decideReportPolicy(db,fixture.reviewer,policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve exact synthetic recipient policy',previewId:preview.previewId,previewDigest:preview.previewDigest}));
 });
 it('requires mcteer exact approval, saves bytes and intent, and keeps provider acceptance distinct from delivery',async()=>{
  const input={action:'send' as const,policyId,expectedVersion:fixture.published.version,expectedPolicyVersion:2};
  await expect(previewReportSend(fixture.author,fixture.published.publicationId,input)).rejects.toMatchObject({status:403});
  const preview=await previewReportSend(fixture.reviewer,fixture.published.publicationId,input);
  const command={...input,requestKey:randomUUID(),rationale:'Approve this exact synthetic report and recipient',previewId:preview.previewId,previewDigest:preview.previewDigest};
  const authorized=await submitReportSendDecision(fixture.reviewer,fixture.published.publicationId,command) as any;
  expect(authorized.deliveries).toHaveLength(1);expect(authorized.deliveries[0].state).toBe('queued');
  const replay=await submitReportSendDecision(fixture.reviewer,fixture.published.publicationId,command) as any;expect(replay.deliveries).toHaveLength(1);
  const [claim]=await reportTransaction(db=>claimReportDeliveries(db));expect(claim.first_dispatch_at).toBeTruthy();expect(claim.attempt_count).toBe(1);
  let posts=0;const messageId=randomUUID();let receiptPromise:Promise<unknown>|undefined;
  const sent=await dispatchReportDelivery(claim,async(url,options)=>{
   expect(url).toBe('https://api.resend.com/emails');expect(options.method).toBe('POST');posts++;
   const intent=await reportTransaction(async db=>(await db.query('SELECT count(*)::int AS n FROM report_delivery_attempts WHERE delivery_id=$1',[claim.id])).rows[0]);expect(intent.n).toBe(1);
   expect(new Headers(options.headers).get('Idempotency-Key')).toBe(claim.provider_key);
   const body=JSON.parse(String(options.body));expect(body.tags[0].value).toBe(claim.id);expect(body.to).toEqual(['synthetic-recipient@example.invalid']);
   const receipt=JSON.stringify({type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:messageId,from:body.from,to:body.to,subject:body.subject,tags:{turas_delivery:claim.id}}});
   const eventId='msg_'+randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),key=Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/,''),'base64');
   const signature=createHmac('sha256',key).update(`${eventId}.${timestamp}.${receipt}`).digest('base64');
   receiptPromise=acceptReportWebhook(new Request('http://localhost/api/webhooks/reports/resend',{method:'POST',headers:{'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body:receipt}));
   const until=Date.now()+10000;let persisted=false;
   while(Date.now()<until){persisted=await reportTransaction(async db=>Boolean((await db.query('SELECT 1 FROM report_delivery_events WHERE provider_event_id=$1',[eventId])).rowCount));if(persisted)break;await new Promise(resolve=>setTimeout(resolve,50));}
    expect(persisted).toBe(true);
    // Receipt projection must complete while the provider request is still in flight:
    // dispatch must not retain a database row lock across the external POST.
    await receiptPromise;
    const concurrent=await reportTransaction(async db=>(await db.query('SELECT state FROM report_deliveries WHERE id=$1',[claim.id])).rows[0]);
    expect(concurrent.state).toBe('delivered');
   return new Response(JSON.stringify({id:messageId}));
  });
   expect(posts).toBe(1);expect(sent.state).toBe('delivered');
  await receiptPromise;
  const final=await reportTransaction(async db=>(await db.query('SELECT state FROM report_deliveries WHERE id=$1',[claim.id])).rows[0]);expect(final.state).toBe('delivered');
  expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
   await expect(dispatchReportDelivery(claim,async()=>{posts++;throw new Error('Must not post twice');})).rejects.toMatchObject({code:'version_conflict'});expect(posts).toBe(1);
  });
   it('purges expired recipient and request bytes without changing delivered audit status',async()=>{
   await requireOwnedReportsDatabase();
   process.env.TURAS_REPORTS_ENABLED='false';
   await reportTransaction(async db=>{
    // Only the owned migration fixture can advance immutable expiry timestamps.
    await db.query('ALTER TABLE report_policy_recipients DISABLE TRIGGER report_policy_recipients_no_update');
    await db.query('ALTER TABLE report_delivery_payloads DISABLE TRIGGER report_delivery_payloads_no_update');
    await db.query("UPDATE report_policy_recipients SET expires_at=now()-interval '1 second'");
    await db.query("UPDATE report_delivery_payloads SET expires_at=now()-interval '1 second'");
    await db.query('ALTER TABLE report_policy_recipients ENABLE TRIGGER report_policy_recipients_no_update');
    await db.query('ALTER TABLE report_delivery_payloads ENABLE TRIGGER report_delivery_payloads_no_update');
    expect((await cleanupReportRevisionPayloads(db)).purged).toBe(2);
    expect((await db.query('SELECT 1 FROM report_policy_recipients')).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM report_delivery_payloads')).rowCount).toBe(0);
    expect((await db.query('SELECT state FROM report_deliveries')).rows.map(row=>row.state)).toEqual(['delivered']);
   });
  });
   it('minimizes expired provider diagnostics without losing the permanent send identity',async()=>{
    await requireOwnedReportsDatabase();
    const before=await reportTransaction(async db=>(await db.query('SELECT id,provider_key,recipient_identity,publication_id,state FROM report_deliveries')).rows[0]);
    await reportTransaction(async db=>{
     await db.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_identity');
     await db.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_audit_identity');
     await db.query("UPDATE report_deliveries SET created_at=now()-interval '731 days'");
     await db.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_identity');
     await db.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_audit_identity');
     const delivery=(await db.query('SELECT * FROM report_deliveries WHERE id=$1',[before.id])).rows[0];
     const job=randomUUID(),lease=randomUUID();
     await db.query(`INSERT INTO report_cleanup_jobs(id,environment_id,workspace_id,customer_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind,due_at,state,lease_token,lease_until)
      VALUES($1,$2,$3,$4,'audit_delivery',$5,$6,1,'audit_retention_v2',now(),'leased',$7,now()+interval '180 seconds')`,[job,delivery.environment_id,delivery.workspace_id,delivery.customer_id,delivery.id,'0'.repeat(64),lease]);
     for(const [environment,token] of [['wrong-environment',lease],[delivery.environment_id,randomUUID()],[delivery.environment_id,lease]])expect((await db.query('SELECT turas_report_purge_delivery_audit($1,$2,$3) AS purged',[environment,job,token])).rows[0].purged).toBe(false);
     await db.query('SAVEPOINT deny_audit_update');
     await expect(db.query('UPDATE report_deliveries SET audit_expired_at=now() WHERE id=$1',[before.id])).rejects.toMatchObject({code:'23514'});
     await db.query('ROLLBACK TO SAVEPOINT deny_audit_update');
    });
    expect(await reportTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return cleanupReportDeliveryAudit(db);})).toEqual({claimed:1,purged:1});
    await reportTransaction(async db=>{
     const after=(await db.query('SELECT id,provider_key,recipient_identity,publication_id,state,provider_message_id,failure_code FROM report_deliveries')).rows[0];
     expect(after).toEqual({...before,provider_message_id:null,failure_code:null});
     expect((await db.query('SELECT provider_message_id,response_class FROM report_attempt_results')).rows).toEqual([{provider_message_id:null,response_class:'expired'}]);
     const events=(await db.query('SELECT id,provider_event_id,provider_message_id FROM report_delivery_events')).rows;
     expect(events).toHaveLength(1);
     expect(events[0].provider_event_id).toBe('expired:'+events[0].id);
      expect(events[0].provider_message_id).toBe('expired:'+events[0].id);
      expect((await db.query('SELECT settled_at FROM report_attempt_results')).rows[0].settled_at.toISOString()).toBe('1970-01-01T00:00:00.000Z');
      const minimizedEvent=(await db.query('SELECT occurred_at,verified_at FROM report_delivery_events')).rows[0];
      expect(minimizedEvent.occurred_at.toISOString()).toBe('1970-01-01T00:00:00.000Z');expect(minimizedEvent.verified_at.toISOString()).toBe('1970-01-01T00:00:00.000Z');
     await db.query('SAVEPOINT deny_diagnostic_restore');
     await expect(db.query("UPDATE report_deliveries SET provider_message_id='restored' WHERE id=$1",[before.id])).rejects.toMatchObject({code:'23514'});
     await db.query('ROLLBACK TO SAVEPOINT deny_diagnostic_restore');
    });
    expect(await reportTransaction(db=>cleanupReportDeliveryAudit(db))).toEqual({claimed:0,purged:0});
    process.env.TURAS_REPORTS_ENABLED='true';
    expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
   });
   it('purges expired review rationale while retaining technical approval and delivery identities',async()=>{
    await requireOwnedReportsDatabase();
    await reportTransaction(async db=>{
     const decision=(await db.query("SELECT d.id FROM report_decisions d JOIN report_decision_payloads p ON p.decision_id=d.id WHERE d.subject_id=$1 AND d.action='publish'",[fixture.published.reportId])).rows[0];
     await db.query('ALTER TABLE report_decision_payloads DISABLE TRIGGER report_decision_payloads_no_update');
     await db.query("UPDATE report_decision_payloads SET expires_at=now()-interval '1 second' WHERE decision_id=$1",[decision.id]);
     await db.query('ALTER TABLE report_decision_payloads ENABLE TRIGGER report_decision_payloads_no_update');
     expect((await cleanupReportRevisionPayloads(db)).purged).toBe(1);
     expect((await db.query('SELECT 1 FROM report_decision_payloads WHERE decision_id=$1',[decision.id])).rowCount).toBe(0);
     expect((await db.query('SELECT 1 FROM report_decisions WHERE id=$1',[decision.id])).rowCount).toBe(1);
     expect((await db.query('SELECT state FROM report_deliveries')).rows.map(row=>row.state)).toEqual(['delivered']);
    });
   });
   it.each(['before_claim','after_claim','after_post'] as const)('fences source withdrawal %s while preserving truthful dispatch history',async phase=>{
    await requireOwnedReportsDatabase();
    // These are independent synthetic race scenarios, not one rate-limit workload.
    await reportTransaction(db=>db.query('DELETE FROM report_rate_windows WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID]));
    process.env.TURAS_REPORTS_ENABLED='true';const f=await publishedReportFixture();
    const policy=await reportTransaction(db=>createReportRecipientPolicy(db,f.reviewer,f.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:process.env.TURAS_REPORT_SENDER_ID!,recipients:[{address:`withdrawal-${phase}@example.invalid`,entitlementRationale:'Explicit synthetic withdrawal race fixture'}]}));
    const review=await reportTransaction(db=>createReportPolicyPreview(db,f.reviewer,policy.policyId,'approve',1));
    await reportTransaction(db=>decideReportPolicy(db,f.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve exact withdrawal-race recipient',previewId:review.previewId,previewDigest:review.previewDigest}));
    const input={action:'send' as const,policyId:policy.policyId,expectedVersion:f.published.version,expectedPolicyVersion:2};
    const preview=await previewReportSend(f.reviewer,f.published.publicationId,input);
    const authorized=await submitReportSendDecision(f.reviewer,f.published.publicationId,{...input,requestKey:randomUUID(),rationale:'Approve exact synthetic withdrawal-race mail',previewId:preview.previewId,previewDigest:preview.previewDigest}) as {deliveries:Array<{deliveryId:string}>};
    const deliveryId=authorized.deliveries[0].deliveryId;
    const withdraw=()=>reportTransaction(db=>invalidateReportSource(db,'milestone_baseline',f.baselineId));
    let posts=0;
    if(phase==='before_claim'){
     await withdraw();expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
    }else{
     const [claim]=await reportTransaction(db=>claimReportDeliveries(db));expect(claim.id).toBe(deliveryId);
     if(phase==='after_claim')await withdraw();
     const outcome=await dispatchReportDelivery(claim,async()=>{posts++;await withdraw();return new Response(JSON.stringify({id:randomUUID()}));});
     expect(outcome.state).toBe(phase==='after_claim'?'uncertain':'provider_accepted');
    }
    expect(posts).toBe(phase==='after_post'?1:0);
    const row=await reportTransaction(async db=>(await db.query('SELECT state,first_dispatch_at,attempt_count FROM report_deliveries WHERE id=$1',[deliveryId])).rows[0]);
    expect(row.state).toBe(phase==='before_claim'?'blocked':phase==='after_claim'?'uncertain':'provider_accepted');
    expect(row.attempt_count).toBe(phase==='before_claim'?0:1);
    expect(Boolean(row.first_dispatch_at)).toBe(phase!=='before_claim');
    expect(await reportTransaction(db=>claimReportDeliveries(db))).toEqual([]);
   },300000);
   it('bounds unmatched receipt quarantine and purges only exact expired unmatched identities',async()=>{
    await requireOwnedReportsDatabase();const environment=process.env.TURAS_ENVIRONMENT_ID!,expiredId=randomUUID(),providerEventId='msg_'+randomUUID();
    await reportTransaction(async db=>{
     await db.query(`INSERT INTO report_delivery_events(id,environment_id,provider_event_id,provider_message_id,event_type,occurred_at,verified_at)
      VALUES($1,$2,$3,$4,'delivered',now()-interval '25 hours',now()-interval '25 hours')`,[expiredId,environment,providerEventId,randomUUID()]);
     for(const [env,id,digest] of [['wrong-environment',expiredId,createHash('sha256').update(providerEventId).digest('hex')],[environment,randomUUID(),createHash('sha256').update(providerEventId).digest('hex')],[environment,expiredId,'0'.repeat(64)]])expect((await db.query('SELECT turas_report_purge_unmatched_event($1,$2,$3) AS purged',[env,id,digest])).rows[0].purged).toBe(false);
    });
    expect(await reportTransaction(async db=>{await db.query('SET LOCAL ROLE turas_runtime');return cleanupUnmatchedReportEvents(db);})).toEqual({claimed:1,purged:1});
    expect(await reportTransaction(db=>cleanupUnmatchedReportEvents(db))).toEqual({claimed:0,purged:0});
    await reportTransaction(async db=>{
     await db.query(`INSERT INTO report_delivery_events(id,environment_id,provider_event_id,provider_message_id,event_type,occurred_at)
      SELECT gen_random_uuid(),$1,'unmatched:'||n,gen_random_uuid()::text,'accepted',now() FROM generate_series(1,1000) n`,[environment]);
    });
    const body=JSON.stringify({type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:randomUUID(),from:'sender@example.invalid',to:['private-unmatched@example.invalid'],subject:'UNMATCHED_PRIVATE_SENTINEL',tags:{turas_delivery:randomUUID()}}}),id='msg_'+randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),key=Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/,''),'base64');
    const signature=createHmac('sha256',key).update(`${id}.${timestamp}.${body}`).digest('base64');
    expect(await acceptReportWebhook(new Request('http://localhost/api/webhooks/reports/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body}))).toEqual({accepted:true});
    await reportTransaction(async db=>{
     expect((await db.query('SELECT count(*)::int AS n FROM report_delivery_events WHERE environment_id=$1 AND delivery_id IS NULL',[environment])).rows[0].n).toBe(1000);
     expect((await db.query('SELECT 1 FROM report_delivery_events WHERE provider_event_id=$1',[id])).rowCount).toBe(0);
     expect(JSON.stringify((await db.query('SELECT * FROM report_delivery_events WHERE environment_id=$1',[environment])).rows)).not.toContain('UNMATCHED_PRIVATE_SENTINEL');
     expect((await db.query('SELECT 1 FROM report_delivery_events WHERE delivery_id IS NOT NULL')).rowCount).toBeGreaterThan(0);
    });
   });
});
