import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import type {Client} from 'pg';
import {z} from 'zod';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {lookupPilotGatewayGeneration} from './pilot-hosted-root-reconcile';
import {hostedLearningBindingSchema,type HostedLearningBinding} from '../lib/contracts/pilot-hosted-learning';
/** Read-only fixed Gateway lookup plus settlement of the original local journal.
 * It never repairs output, changes domain accounting or dispatches a model. */
export async function reconcileHostedLearningDispatch(input:{db:Client;ledger:QualityBudgetLedger;dispatchId:string;binding:HostedLearningBinding;signal:AbortSignal}){
 const binding=hostedLearningBindingSchema.parse(input.binding),id=z.uuid().parse(input.dispatchId);
 input.signal.throwIfAborted();const held=await input.ledger.hostedAccountingDispatch(id),dispatch=held.dispatch,arm=dispatch.hostedLearning!;
 if(held.originalBudgetId!==binding.budgetId||held.originalAuthorizationDigest!==binding.originalAuthorizationDigest||held.capMicroUsd!==binding.capMicroUsd
  ||arm.scope.environmentMarker!==binding.environmentMarker||arm.scope.workspaceId!==binding.workspaceId||arm.scope.projectId!==binding.projectId
  ||arm.scope.target!==binding.target||arm.scope.sourceCommit!==binding.sourceCommit||arm.scope.sourceDigest!==binding.sourceDigest
  ||arm.scope.catalogDigest!==binding.catalogDigest)throw Error('Original hosted learning accounting scope differs');
 const row=(await input.db.query(`SELECT h.*,c.reservation_id,c.response_attempt_id,c.native_turn_id,i.provider_key,r.created_at AS reservation_created_at,
  s.kind AS settlement_kind,s.amount_micro_usd,s.input_tokens,s.output_tokens,s.provider_generation_id,t.schema_version,
  current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_hosted_learning_admissions'::regclass)) AS owner
  FROM operations_hosted_learning_admissions h JOIN operations_hosted_learning_consumptions c USING(journal_dispatch_id)
  JOIN operations_hosted_learning_provider_identities i ON i.reservation_id=c.reservation_id AND i.identity_kind='gateway_generation'
  JOIN learning_budget_reservations r ON r.id=c.reservation_id JOIN turas_environment t ON t.environment_id=h.environment_id
  LEFT JOIN learning_budget_settlements s ON s.reservation_id=c.reservation_id WHERE h.journal_dispatch_id=$1`,[id])).rows[0];
 if(!row||!row.owner||row.schema_version!==CURRENT_SCHEMA_VERSION||row.journal_budget_id!==held.originalBudgetId||row.journal_dispatch_digest!==held.dispatchDigest
  ||row.original_authorization_digest!==held.originalAuthorizationDigest||Number(row.cap_micro_usd)!==held.capMicroUsd
  ||row.learning_attempt_id!==arm.learningAttemptId||row.evaluation_id!==arm.evaluationId||row.case_id!==arm.caseId||row.purpose!==arm.purpose
  ||row.environment_id!==binding.environmentMarker||row.workspace_id!==binding.workspaceId||row.owner_principal_id!==binding.ownerPrincipalId
  ||row.actor_membership_id!==arm.actorMembershipId||row.native_session_id!==arm.nativeSessionId||row.native_request_id!==arm.nativeRequestId
  ||row.source_commit!==arm.scope.sourceCommit||row.source_digest!==arm.scope.sourceDigest||row.catalog_digest!==arm.scope.catalogDigest
  ||row.deployment_id!==arm.scope.deploymentId||row.project_id!==arm.scope.projectId||row.target!==arm.scope.target
  ||row.price_digest!==dispatch.pricingDigest||Number(row.ceiling_micro_usd)!==dispatch.ceilingMicroUsd)throw Error('Actual original owner consumption and identity required');
 const generation=await lookupPilotGatewayGeneration(row.provider_key,input.signal);
 const actual=Math.ceil(generation.totalCost*1000000);
 if(generation.id!==row.provider_key||!generation.streamed||generation.usage!==generation.totalCost
  ||Date.parse(generation.createdAt)<row.reservation_created_at.getTime()-30000
  ||Date.parse(generation.createdAt)>row.reservation_created_at.getTime()+300000||Date.parse(generation.createdAt)>Date.now()+30000
  ||!Number.isSafeInteger(actual)||actual<0)throw Error('Exact terminal Gateway learning accounting unavailable');
 const domainMatches=row.settlement_kind==='actual'&&row.provider_generation_id===generation.id
  &&BigInt(row.amount_micro_usd)===BigInt(actual)&&Number(row.input_tokens)===generation.promptTokens&&Number(row.output_tokens)===generation.completionTokens;
 const receipt={contract:'pilot-hosted-learning-reconciliation-v1' as const,journalDispatchId:id,journalBudgetId:held.originalBudgetId,
  reservationId:String(row.reservation_id),learningAttemptId:arm.learningAttemptId,actualMicroUsd:Number(actual),generation,
  domainAccountingMatches:domainMatches,modelCalls:0,providerReads:1,approvalExtended:false,budgetReopened:false};
 // Recording a known overrun must not depend on the runtime's settlement.
 // The original ledger appends its immutable observed exposure and retains the
 // reservation before refusing settlement; it never increases the cap.
 if(actual>dispatch.ceilingMicroUsd)await input.ledger.settle(id,{chargedMicroUsd:actual,inputTokens:generation.promptTokens,outputTokens:generation.completionTokens,generationId:generation.id});
 if(!domainMatches)return {...receipt,reconciliationSuccessful:false,originalHoldRetained:true};
 input.signal.throwIfAborted();
 await input.ledger.settle(id,{chargedMicroUsd:Number(actual),inputTokens:generation.promptTokens,outputTokens:generation.completionTokens,generationId:generation.id});
 return {...receipt,reconciliationSuccessful:true,originalHoldRetained:false};
}
