import type {Client} from 'pg';
import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {z} from 'zod';
import {hostedLearningBindingSchema,type HostedLearningBinding} from '../lib/contracts/pilot-hosted-learning';
import {assertLearningPrice,learningStepCeiling} from '../lib/server/learning/pricing';
import {learningHash} from '../lib/server/learning/repository';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';

/** Called by the exact-platform verified hosted operator, after an actual
 * original-journal reservation. No remote request accepts a claimed ledger. */
export async function admitHostedLearningDispatch(input:{db:Client;ledger:QualityBudgetLedger;dispatchId:string;binding:HostedLearningBinding;signal:AbortSignal}){
 const {db,ledger,signal}=input,binding=hostedLearningBindingSchema.parse(input.binding);
 signal.throwIfAborted();const held=await ledger.hostedDispatch(z.uuid().parse(input.dispatchId)),dispatch=held.dispatch,arm=dispatch.hostedLearning!;
 const scope=arm.scope;
 if(dispatch.modelId!=='anthropic/claude-sonnet-5.5'||held.originalBudgetId!==binding.budgetId||held.originalAuthorizationDigest!==binding.originalAuthorizationDigest
  ||held.capMicroUsd!==binding.capMicroUsd||!held.source.attemptId||held.source.sourceCommit!==scope.sourceCommit
  ||held.source.sourceDigest!==scope.sourceDigest||held.source.catalogDigest!==scope.catalogDigest||scope.sourceCommit!==binding.sourceCommit
  ||scope.sourceDigest!==binding.sourceDigest||scope.catalogDigest!==binding.catalogDigest||scope.environmentMarker!==binding.environmentMarker
  ||scope.workspaceId!==binding.workspaceId||scope.projectId!==binding.projectId||scope.target!==binding.target
  ||dispatch.pricingDigest!==arm.priceDigest||Date.parse(held.expiresAt)>Date.parse(binding.expiresAt)
  ||Date.now()<Date.parse(binding.recordedAt)||Date.now()>=Date.parse(binding.expiresAt))throw Error('Exact original reserved hosted arm required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL transaction_timeout='15s'");await db.query("SET LOCAL statement_timeout='5000ms'");
  const row=(await db.query(`SELECT a.*,b.evaluation_id,b.case_id,b.purpose,c.owner_principal_id,c.eve_session_id,c.binding_state,
   w.classification,w.pilot_environment_id,w.active AS workspace_active,p.login_name,p.active AS principal_active,
   m.kind,m.role,m.active AS membership_active,q.price_contract,q.price_digest,e.deadline_at,e.state AS evaluation_state,
   t.schema_version,control.mode,
   current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_hosted_learning_admissions'::regclass)) AS owner
   FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id JOIN learning_evaluations e ON e.id=b.evaluation_id
   JOIN learning_budget_accounts q ON q.id=a.budget_id JOIN conversations c ON c.id=a.conversation_id
   JOIN workspaces w ON w.id=a.workspace_id JOIN principals p ON p.id=c.owner_principal_id
   JOIN memberships m ON m.id=a.actor_membership_id AND m.principal_id=p.id AND m.workspace_id=w.id
   JOIN customer_references customer ON customer.id=a.customer_id AND customer.workspace_id=w.id AND customer.synthetic
   JOIN turas_environment t ON t.environment_id=a.environment_id JOIN operations_control control ON control.environment_id=t.environment_id
   WHERE a.id=$1 FOR UPDATE OF a`,[arm.learningAttemptId])).rows[0];
  if(!row||row.owner!==true||row.schema_version!==CURRENT_SCHEMA_VERSION||row.mode!=='open'||row.environment_id!==binding.environmentMarker
   ||row.workspace_id!==binding.workspaceId||row.pilot_environment_id!==binding.environmentMarker||row.classification!=='synthetic_pilot'
   ||!row.workspace_active||!row.principal_active||!row.membership_active||row.owner_principal_id!==binding.ownerPrincipalId
   ||row.login_name!=='mcteer'||row.kind!=='internal'||row.role!=='admin'||row.actor_membership_id!==arm.actorMembershipId
   ||row.native_request_id!==arm.nativeRequestId||row.eve_session_id!==arm.nativeSessionId||row.binding_state!=='bound'
   ||row.evaluation_id!==arm.evaluationId||row.case_id!==arm.caseId||row.purpose!==arm.purpose||row.state!=='prepared'
   ||row.response_attempt_id||Number(row.model_steps)!==0||row.prepared_until.getTime()<=Date.now()
   ||row.deadline_at.getTime()<=Date.now()||!['prepared','running'].includes(row.evaluation_state))throw Error('Fresh actual synthetic hosted arm required');
  const price=assertLearningPrice(row.price_contract),ceiling=learningStepCeiling(price,4096);
  if(learningHash(price)!==row.price_digest||row.price_digest!==dispatch.pricingDigest||Number(ceiling.ceilingMicroUsd)!==dispatch.ceilingMicroUsd)throw Error('Original full provider ceiling differs');
  const values:Record<string,unknown>={journal_dispatch_id:dispatch.id,journal_budget_id:held.originalBudgetId,journal_attempt_id:held.source.attemptId,
   journal_dispatch_digest:held.dispatchDigest,journal_head_digest:held.journalHeadDigest,original_authorization_digest:held.originalAuthorizationDigest,
   authority_digest:held.authorityDigest,cap_micro_usd:held.capMicroUsd,environment_id:binding.environmentMarker,workspace_id:binding.workspaceId,
   owner_principal_id:binding.ownerPrincipalId,actor_membership_id:arm.actorMembershipId,learning_attempt_id:arm.learningAttemptId,
   evaluation_id:arm.evaluationId,case_id:arm.caseId,purpose:arm.purpose,native_session_id:arm.nativeSessionId,native_request_id:arm.nativeRequestId,
   source_commit:scope.sourceCommit,source_digest:scope.sourceDigest,catalog_digest:scope.catalogDigest,deployment_id:scope.deploymentId,
   project_id:scope.projectId,target:scope.target,price_digest:dispatch.pricingDigest,ceiling_micro_usd:dispatch.ceilingMicroUsd,expires_at:new Date(held.expiresAt).toISOString()};
  const existing=(await db.query('SELECT * FROM operations_hosted_learning_admissions WHERE journal_dispatch_id=$1',[dispatch.id])).rows[0];
  if(existing){for(const [key,value] of Object.entries(values)){
   const actual=key==='expires_at'?existing[key].toISOString():['cap_micro_usd','ceiling_micro_usd'].includes(key)?Number(existing[key]):existing[key];
   if(actual!==value)throw Error('Original hosted admission differs');
  }}else{
   const columns=Object.keys(values);await db.query('INSERT INTO operations_hosted_learning_admissions('+columns.join(',')+') VALUES('+columns.map((_,index)=>'$'+(index+1)).join(',')+')',Object.values(values));
  }
  signal.throwIfAborted();await db.query('COMMIT');
  return {contract:'pilot-hosted-learning-admission-receipt-v1',journalDispatchId:dispatch.id,journalBudgetId:held.originalBudgetId,
   learningAttemptId:arm.learningAttemptId,ceilingMicroUsd:dispatch.ceilingMicroUsd,originalCapMicroUsd:held.capMicroUsd,
   alreadyAdmitted:!!existing,modelCalls:0,originalHoldRetained:true,approvalExtended:false,platformVerificationRequired:true};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
