import {serviceBudgetAuthority} from '../../../lib/server/operations/cost';
import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {quarantineRestoredAuthority,requiredRecoveryQuarantineScopes} from '../../../lib/server/operations/recovery-quarantine';
import {transitionRecoveryControl} from '../../../lib/server/operations/control';
import {currentRecoveryStateDigest} from '../../../lib/server/operations/recovery-state';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {recordPilotCost} from '../../../scripts/pilot-cost';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {readOperationalHealth} from '../../../lib/server/operations/health';

async function fixture(run:(owner:Client,runtime:Client,environmentId:string)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
  try{await run(owner,runtime,environment.environmentId);}finally{await runtime.end();await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
async function lock(owner:Client,environmentId:string){const recoveryId=randomUUID();const row=(await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0];return {environmentId,recoveryId,controlRevision:Number(row.revision)};}

it('persists every required quarantine without extending its timestamps on replay',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary');
 await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic unknown authority',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1});
 const before=(await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0];
 const scope=await lock(owner,environmentId),first=await quarantineRestoredAuthority(owner,scope);
 expect(first).toMatchObject({allRequiredScopesQuarantined:true,currentAuthorityVerified:false,restorationReady:false});expect(first.quarantinedScopes).toEqual([...requiredRecoveryQuarantineScopes].sort());
 const recorded=(await owner.query('SELECT * FROM operations_recovery_quarantines ORDER BY scope_kind')).rows;
 await quarantineRestoredAuthority(owner,scope);expect((await owner.query('SELECT * FROM operations_recovery_quarantines ORDER BY scope_kind')).rows).toEqual(recorded);
 expect((await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0]).toEqual(before);
 expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
 expect((await owner.query('SELECT count(*)::int AS n FROM mcp_connections WHERE credential_hash IS NOT NULL')).rows[0].n).toBe(0);
 expect((await owner.query("SELECT count(*)::int AS n FROM customer_grants WHERE state='active'")).rows[0].n).toBe(0);
}),210000);

it('denies unresolved quarantine unlock even with a fresh owner verification label',async()=>fixture(async(owner,runtime,environmentId)=>{
 const scope=await lock(owner,environmentId);await quarantineRestoredAuthority(owner,scope);
 await owner.query('BEGIN');
 const digest=await currentRecoveryStateDigest(owner),bundle='a'.repeat(64);
 await owner.query(`INSERT INTO operations_recovery_verifications(id,environment_id,recovery_id,control_revision,bundle_digest,ledger_digest,objects_digest,denial_digest,replay_digest,workflow_digest,scope_digest,current_state_digest,required_scope_healthy,integrity_verified,denial_verified,replay_verified,workflow_verified) VALUES($1,$2,$3,$4,$5,$5,$5,$5,$5,$5,$5,$6,true,true,true,true,true)`,[randomUUID(),environmentId,scope.recoveryId,scope.controlRevision,bundle,digest]);
 await owner.query('COMMIT');
 await expect(transitionRecoveryControl(owner,{environmentId,recoveryId:scope.recoveryId,expectedRevision:scope.controlRevision,operationId:randomUUID(),mode:'open',verifiedBundleDigest:bundle})).rejects.toThrow('scopes remain quarantined');
 await expect(owner.query("UPDATE operations_control SET mode='open' WHERE environment_id=$1",[environmentId])).rejects.toThrow('scopes remain quarantined');
 await expect(runtime.query('DELETE FROM operations_recovery_quarantines')).rejects.toMatchObject({code:'42501'});
 await expect(owner.query('DELETE FROM operations_recovery_quarantines')).rejects.toThrow('immutable');
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
 expect(await readOperationalHealth()).toMatchObject({ready:false,admission:'closed',recovery:{quarantinedScopes:[...requiredRecoveryQuarantineScopes].sort(),requiredScopesQuarantined:7}});
}),210000);

it('holds dispatched charges while preserving settled permanent cost receipts',async()=>fixture(async(owner,_runtime,environmentId)=>{
 async function charge(char:string,settled:boolean){const budgetId=randomUUID(),reservationId=randomUUID(),digest=char.repeat(64);
  await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,1000000,clock_timestamp()+interval '1 hour')",[budgetId,environmentId,digest]);
  await owner.query('INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,$3,100000)',[reservationId,budgetId,digest]);
  await owner.query("UPDATE operations_cost_reservations SET job_id=$2,state='dispatched',dispatched_at=clock_timestamp() WHERE id=$1",[reservationId,randomUUID()]);
  if(settled){await owner.query("UPDATE operations_cost_reservations SET state='unknown' WHERE id=$1",[reservationId]);await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'reconcile',budgetId,reservationId,operationDigest:digest,expectedState:'unknown',chargedMicroUsd:100000,chargeKind:'estimate',chargeEvidenceDigest:digest,operatorReviewDigest:digest});}
  return reservationId;
 }
 const settled=await charge('b',true),dispatched=await charge('c',false),receipt=(await owner.query('SELECT * FROM operations_cost_reconciliations WHERE reservation_id=$1',[settled])).rows[0];
 const scope=await lock(owner,environmentId);expect((await quarantineRestoredAuthority(owner,scope)).newlyHeldPaidReservations).toBe(1);
 expect((await owner.query('SELECT state,charged_micro_usd,charge_kind FROM operations_cost_reservations WHERE id=$1',[settled])).rows[0]).toMatchObject({state:'settled',charged_micro_usd:'100000',charge_kind:'estimate'});
 expect((await owner.query('SELECT * FROM operations_cost_reconciliations WHERE reservation_id=$1',[settled])).rows[0]).toEqual(receipt);
 expect((await owner.query('SELECT state FROM operations_cost_reservations WHERE id=$1',[dispatched])).rows[0].state).toBe('unknown');
 await expect(owner.query("UPDATE operations_cost_reservations SET state='reserved' WHERE id=$1",[dispatched])).rejects.toThrow('Invalid cost transition');
 expect((await quarantineRestoredAuthority(owner,scope)).newlyHeldPaidReservations).toBe(0);
}),210000);

it('holds interrupted native dispatch without altering completed attempts or extending replay',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');
 async function attempt(completed:boolean){
  const conversation=await createOwnedConversation(f.actor,{customerId:f.customerId,requestKey:randomUUID(),title:'Synthetic interrupted recovery turn'});
  const conversationId=conversation.conversation.id,messageId=randomUUID(),attemptId=randomUUID(),nativeId='synthetic-native-'+randomUUID();
  await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,'Synthetic recovery question')",[messageId,conversationId,randomUUID(),'d'.repeat(64)]);
  await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,native_delivery_id,native_turn_id,dispatch_started_at,deadline_at,dispatch_start_index) VALUES($1,$2,$3,repeat('d',64),'admitted',$4,$5,$5,clock_timestamp(),clock_timestamp()+interval '5 minutes',0)",[attemptId,conversationId,messageId,completed?'completed':'running',nativeId]);
  await owner.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) SELECT id,deadline_at,$2,clock_timestamp() FROM response_attempts WHERE id=$1",[attemptId,completed?'settled':'pending']);
  return attemptId;
 }
 const interrupted=await attempt(false),completed=await attempt(true),before=(await owner.query('SELECT * FROM response_attempts WHERE id=$1',[completed])).rows[0];
 const scope=await lock(owner,environmentId);
 expect((await quarantineRestoredAuthority(owner,scope)).newlyInterruptedNativeAttempts).toBe(1);
 const held=(await owner.query('SELECT * FROM response_attempts WHERE id=$1',[interrupted])).rows[0];
 expect(held).toMatchObject({dispatch_state:'uncertain',response_state:'failed',last_error_code:'recovery_current_proof_unavailable',native_delivery_id:expect.any(String),native_turn_id:expect.any(String)});
 expect((await owner.query('SELECT state,lease_owner,lease_expires_at FROM watchdog_jobs WHERE attempt_id=$1',[interrupted])).rows[0]).toEqual({state:'needs_attention',lease_owner:null,lease_expires_at:null});
 expect((await owner.query('SELECT * FROM response_attempts WHERE id=$1',[completed])).rows[0]).toEqual(before);
 expect((await quarantineRestoredAuthority(owner,scope)).newlyInterruptedNativeAttempts).toBe(0);
 expect((await owner.query('SELECT * FROM response_attempts WHERE id=$1',[interrupted])).rows[0]).toEqual(held);
}),210000);

it('rejects foreign stale and runtime quarantine without leaving partial scope records',async()=>fixture(async(owner,runtime,environmentId)=>{
 const scope=await lock(owner,environmentId);
 await expect(quarantineRestoredAuthority(owner,{...scope,controlRevision:scope.controlRevision+1})).rejects.toThrow('Exact locked');
 await expect(quarantineRestoredAuthority(owner,{...scope,environmentId:'foreign'})).rejects.toThrow('marker differs');
 await expect(quarantineRestoredAuthority(runtime,scope)).rejects.toThrow('actual owner');
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_quarantines')).rows[0].n).toBe(0);
 await expect(runtime.query("INSERT INTO operations_recovery_quarantines(environment_id,recovery_id,control_revision,scope_kind,reason) VALUES($1,$2,$3,'sources','current_proof_unavailable')",[environmentId,scope.recoveryId,scope.controlRevision])).rejects.toMatchObject({code:'42501'});
 await owner.query('GRANT INSERT ON operations_recovery_quarantines TO turas_runtime');
 try{await expect(runtime.query("INSERT INTO operations_recovery_quarantines(environment_id,recovery_id,control_revision,scope_kind,reason) VALUES($1,$2,$3,'sources','current_proof_unavailable')",[environmentId,scope.recoveryId,scope.controlRevision])).rejects.toThrow('owner authority');}finally{await owner.query('REVOKE INSERT ON operations_recovery_quarantines FROM turas_runtime');}
}),210000);

it('holds interrupted report sends and preserves exact accepted-provider receipts',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {publishedReportFixture}=await import('../../fixtures/reports/published');
 const {reportTransaction}=await import('../../../lib/server/reports/commands');
 const {verifyConfiguredReportSender,registerVerifiedReportSender}=await import('../../../lib/server/reports/senders');
 const {createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy}=await import('../../../lib/server/reports/recipient-policy');
 const {previewReportSend,submitReportSendDecision}=await import('../../../lib/server/reports/service');
 const {claimReportDeliveries,dispatchReportDelivery}=await import('../../../lib/server/reports/outbox');
 Object.assign(process.env,{TURAS_REPORT_SENDER_ADDRESS:'recovery@example.invalid',TURAS_REPORT_SENDER_ID:randomUUID(),TURAS_REPORT_SENDER_DOMAIN_ID:randomUUID(),RESEND_API_KEY:'synthetic-provider-test-only',TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'synthetic',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({synthetic:Buffer.alloc(32,7).toString('base64')})});
 const f=await publishedReportFixture();
 const sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:process.env.TURAS_REPORT_SENDER_DOMAIN_ID,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
 await reportTransaction(db=>registerVerifiedReportSender(db,f.reviewer.workspaceId,sender));
 const policy=await reportTransaction(db=>createReportRecipientPolicy(db,f.reviewer,f.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:sender.id,recipients:['accepted','interrupted','queued'].map(name=>({address:name+'@example.invalid',entitlementRationale:'Explicit synthetic recovery test recipient'}))}));
 const review=await reportTransaction(db=>createReportPolicyPreview(db,f.reviewer,policy.policyId,'approve',1));
 await reportTransaction(db=>decideReportPolicy(db,f.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve synthetic recovery recipients',previewId:review.previewId,previewDigest:review.previewDigest}));
 const input={action:'send' as const,policyId:policy.policyId,expectedVersion:f.published.version,expectedPolicyVersion:2};
 const preview=await previewReportSend(f.reviewer,f.published.publicationId,input);
 await submitReportSendDecision(f.reviewer,f.published.publicationId,{...input,requestKey:randomUUID(),rationale:'Authorize only synthetic provider fixture',previewId:preview.previewId,previewDigest:preview.previewDigest});
 const {createReportSchedule}=await import('../../../lib/server/reports/schedules');
 const schedule=await reportTransaction(db=>createReportSchedule(db,f.reviewer,f.customerId,{policyId:policy.policyId,localTime:'09:00'}));
 const queued=(await owner.query("SELECT * FROM report_deliveries WHERE state IN('authorized','queued') ORDER BY created_at,id")).rows;expect(queued).toHaveLength(3);
 const claims=await reportTransaction(db=>claimReportDeliveries(db,2));expect(claims).toHaveLength(2);
 let posts=0;
 await dispatchReportDelivery(claims[0],async()=>{posts++;return new Response(JSON.stringify({id:randomUUID()}));});
 const accepted=(await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[0].id])).rows[0];
 const result=(await owner.query('SELECT * FROM report_attempt_results WHERE attempt_id=$1',[claims[0].attemptId])).rows[0];
 const interrupted=(await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[1].id])).rows[0];
 const scope=await lock(owner,environmentId);
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyHeldReportDeliveries:2,newlyPausedReportSchedules:1});
 const unclaimed=queued.find(row=>!claims.some(claim=>claim.id===row.id))!;
 expect((await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[unclaimed.id])).rows[0]).toMatchObject({state:'uncertain',attempt_count:0,first_dispatch_at:null,provider_key:unclaimed.provider_key});
 expect((await owner.query('SELECT state FROM report_schedules WHERE id=$1',[schedule.scheduleId])).rows[0].state).toBe('paused');
 const held=(await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[1].id])).rows[0];
 expect(held).toMatchObject({state:'uncertain',provider_key:interrupted.provider_key,first_dispatch_at:interrupted.first_dispatch_at,attempt_count:1,lease_token:null,lease_until:null,next_attempt_at:null,failure_code:'recovery_current_proof_unavailable'});
 expect((await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[0].id])).rows[0]).toEqual(accepted);
 expect((await owner.query('SELECT * FROM report_attempt_results WHERE attempt_id=$1',[claims[0].attemptId])).rows[0]).toEqual(result);
 expect((await owner.query('SELECT count(*)::int AS n FROM report_delivery_attempts')).rows[0].n).toBe(2);
 await expect(dispatchReportDelivery(claims[1],async()=>{posts++;throw Error('No retry is admissible');})).rejects.toThrow('lease changed');
 expect(posts).toBe(1);
 expect((await quarantineRestoredAuthority(owner,scope)).newlyHeldReportDeliveries).toBe(0);
 expect((await owner.query('SELECT * FROM report_deliveries WHERE id=$1',[claims[1].id])).rows[0]).toEqual(held);
}),210000);

it('retains restored learning reservation ceilings when a later dispatch may be missing',async()=>fixture(async(owner,runtime,environmentId)=>{
 const {learningNativeFixture}=await import('../../fixtures/learning/native');
 const {admitGovernedStaffingModelStep}=await import('../../../lib/server/staffing/native-admission');
 const {runLearningMaintenanceTick}=await import('../../../lib/server/learning/maintenance');
 const f=await learningNativeFixture(owner as unknown as PoolClient);await admitGovernedStaffingModelStep(f.principal,f.identity);
 const reservation=(await owner.query('SELECT id,ceiling_micro_usd FROM learning_budget_reservations WHERE attempt_id=$1',[f.meta.id])).rows[0];expect(reservation).toBeDefined();
 const scope=await lock(owner,environmentId);expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyHeldLearningReservations:1});
 const original=(await owner.query('SELECT * FROM operations_recovery_paid_holds WHERE reservation_id=$1',[reservation.id])).rows[0];
 expect((await owner.query('SELECT state FROM learning_budget_accounts WHERE id=$1',[f.meta.budgetId])).rows[0].state).toBe('blocked');
 await runLearningMaintenanceTick({nativeRetirement:false});
 expect((await owner.query('SELECT count(*)::int AS n FROM learning_reservation_releases WHERE reservation_id=$1',[reservation.id])).rows[0].n).toBe(0);
 expect((await owner.query('SELECT count(*)::int AS n FROM learning_model_dispatches WHERE reservation_id=$1',[reservation.id])).rows[0].n).toBe(0);
 expect((await owner.query('SELECT ceiling_micro_usd FROM learning_budget_reservations WHERE id=$1',[reservation.id])).rows[0].ceiling_micro_usd).toBe(reservation.ceiling_micro_usd);
 await expect(runtime.query("INSERT INTO learning_reservation_releases(reservation_id,reason) VALUES($1,'terminal_without_dispatch')",[reservation.id])).rejects.toThrow('Restored paid reservation');
 await expect(runtime.query('DELETE FROM operations_recovery_paid_holds')).rejects.toMatchObject({code:'42501'});
 await expect(owner.query('DELETE FROM operations_recovery_paid_holds')).rejects.toThrow('immutable');
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyHeldLearningReservations:0});
 expect((await owner.query('SELECT * FROM operations_recovery_paid_holds WHERE reservation_id=$1',[reservation.id])).rows[0]).toEqual(original);
}),210000);

it('interrupts restored queued research without inventing dispatch or allowing the old request to remain admitted',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),conversation=randomUUID(),request=randomUUID(),run=randomUUID();
 await owner.query("INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title) VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic queued research recovery')",[conversation,environmentId,f.actor.workspaceId,f.customerId,f.actor.principalId,randomUUID()]);
 await owner.query("INSERT INTO research_requests(id,environment_id,workspace_id,customer_id,actor_membership_id,actor_principal_id,login_session_id,conversation_id,mode,state,public_fields,idempotency_key,request_digest,admitted_digest,admission_deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'fit','admitted','{}',$9,$10,$10,clock_timestamp()+interval '60 seconds')",[request,environmentId,f.actor.workspaceId,f.customerId,f.actor.membershipId,f.actor.principalId,f.actor.sessionId,conversation,randomUUID(),'a'.repeat(64)]);
 await owner.query("INSERT INTO research_runs(id,request_id,environment_id,workspace_id,customer_id,actor_membership_id,mode) VALUES($1,$2,$3,$4,$5,$6,'fit')",[run,request,environmentId,f.actor.workspaceId,f.customerId,f.actor.membershipId]);
 const scope=await lock(owner,environmentId);
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyCancelledResearchRequests:1,newlyInterruptedResearchRuns:1});
 expect((await owner.query('SELECT state,admitted_digest FROM research_requests WHERE id=$1',[request])).rows[0]).toMatchObject({state:'cancelled',admitted_digest:'a'.repeat(64)});
 const observed=(await owner.query('SELECT * FROM research_runs WHERE id=$1',[run])).rows[0];
 expect(observed).toMatchObject({state:'unconfirmed',started_at:null,finished_at:null,searches_used:0,fetches_used:0,safe_reason_code:'recovery_current_proof_unavailable'});
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyCancelledResearchRequests:0,newlyInterruptedResearchRuns:0});
 expect((await owner.query('SELECT * FROM research_runs WHERE id=$1',[run])).rows[0]).toEqual(observed);
}),210000);

it('holds prepared support and expansion advice without inventing a model dispatch or settling usage',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary');
 const {prepareSupportAdvice}=await import('../../../lib/server/support/advisory');
 const {prepareExpansionAdvice}=await import('../../../lib/server/expansion/advisory');
 const conversation=await createOwnedConversation(f.actor,{customerId:f.customerId,requestKey:randomUUID(),title:'Synthetic prepared support recovery'});
 const support=await prepareSupportAdvice(f.actor,f.customerId,{requestKey:randomUUID(),conversationId:conversation.conversation.id,workloadId:null,audience:'delivery',selectedEngagementIds:[],sourceRefs:[]});
 const expansion=await prepareExpansionAdvice(f.actor,f.customerId,{contractVersion:'expansion-v1',expectedVersion:0,requestKey:randomUUID(),workloadId:null,question:'Which unknown should the owner validate?',selectedEngagementIds:[],selectedHypothesisIds:[],sourceRefs:[]});
 const before=[];
 for(const [table,id] of [['support_advice_attempts',support.attemptId],['expansion_advice_attempts',expansion.attemptId]])before.push((await owner.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0]);
 const scope=await lock(owner,environmentId);
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyInterruptedAdvisoryAttempts:2});
 const observed=[];
 for(const [i,table] of ['support_advice_attempts','expansion_advice_attempts'].entries()){
  const row=(await owner.query(`SELECT * FROM ${table} WHERE id=$1`,[before[i].id])).rows[0];observed.push(row);
  expect(row).toMatchObject({state:'unconfirmed',failure_code:'recovery_current_proof_unavailable',dispatch_at:null,settled_at:null,model_steps:0,read_calls:0,request_digest:before[i].request_digest,native_request_id:before[i].native_request_id});
 }
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyInterruptedAdvisoryAttempts:0});
 for(const [i,table] of ['support_advice_attempts','expansion_advice_attempts'].entries())expect((await owner.query(`SELECT * FROM ${table} WHERE id=$1`,[before[i].id])).rows[0]).toEqual(observed[i]);
}),210000);


it('revokes apparently unused restored service budgets and refuses automatic reservation release',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const ids=[randomUUID(),randomUUID()],reservationId=randomUUID(),digest='e'.repeat(64);
 for(const id of ids)await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,1000000,clock_timestamp()+interval '1 hour')",[id,environmentId,digest]);
 await owner.query('INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,$3,100000)',[reservationId,ids[0],digest]);
 const before=(await owner.query("SELECT id,to_jsonb(b)-'state' AS immutable FROM operations_cost_budgets b ORDER BY id")).rows;
 const scope=await lock(owner,environmentId);expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyRevokedServiceBudgets:2});
 expect((await owner.query("SELECT count(*)::int AS n FROM operations_cost_budgets WHERE state='active'")).rows[0].n).toBe(0);
 expect((await owner.query("SELECT id,to_jsonb(b)-'state' AS immutable FROM operations_cost_budgets b ORDER BY id")).rows).toEqual(before);
 const authority=serviceBudgetAuthority({budgetId:ids[0],environmentId,category:'sandbox',scopeDigest:digest,pricingDigest:digest,operationDigest:digest});
 expect(await authority.verifyReserved(owner as unknown as PoolClient,reservationId,randomUUID())).toBe(false);
 await expect(authority.releaseUndispatched(owner as unknown as PoolClient,reservationId)).rejects.toThrow('operator reconciliation');
 expect((await owner.query('SELECT state,job_id FROM operations_cost_reservations WHERE id=$1',[reservationId])).rows[0]).toMatchObject({state:'reserved',job_id:null});
 expect(await quarantineRestoredAuthority(owner,scope)).toMatchObject({newlyRevokedServiceBudgets:0});
 await expect(owner.query("UPDATE operations_cost_budgets SET state='active' WHERE id=$1",[ids[0]])).rejects.toThrow('immutable');
}),210000);

it('allows explicit charge accounting after recovery without reopening the revoked authority',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const budgetId=randomUUID(),reservationId=randomUUID(),digest='f'.repeat(64);
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,1000000,clock_timestamp()+interval '1 hour')",[budgetId,environmentId,digest]);
 await owner.query('INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,$3,100000)',[reservationId,budgetId,digest]);
 await owner.query("UPDATE operations_cost_reservations SET job_id=$2,state='dispatched',dispatched_at=clock_timestamp() WHERE id=$1",[reservationId,randomUUID()]);
 const scope=await lock(owner,environmentId);await quarantineRestoredAuthority(owner,scope);
 // Controlled operator evidence tests accounting mechanics, not actual charges.
 const result=await recordPilotCost(owner,environmentId,{contract:'pilot-cost-operation-v1',action:'reconcile',budgetId,reservationId,operationDigest:digest,expectedState:'unknown',chargedMicroUsd:100000,chargeKind:'estimate',chargeEvidenceDigest:digest,operatorReviewDigest:digest});
 expect(result).toMatchObject({budgetState:'revoked',admissionHeld:true,providerCalls:0});
 expect((await owner.query('SELECT state,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[reservationId])).rows[0]).toMatchObject({state:'settled',charged_micro_usd:'100000'});
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_cost_reconciliations WHERE reservation_id=$1',[reservationId])).rows[0].n).toBe(1);
}),210000);
