import {randomUUID,createHash} from 'node:crypto';
import {wrapLanguageModel} from 'ai';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {withTransaction} from '../db/client';
import {operationalCodeVersion} from '../operations/code-version';
import {modelCostCeiling,settleParityProvider} from '../research/specialists/evaluation-budget';

/** Separate from the Preview-wide parity switch. Each environment receives at
 * most half the authorized $5, and only these precreated ordinary conversations
 * can consume it. This proves root transport, never specialist acceptance. */
export const hostedRootBudgetSchema=z.strictObject({
 contract:z.literal('pilot-hosted-root-budget-v1'),budgetId:z.uuid(),
 target:z.enum(['preview','production']),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),
 environmentMarker:z.string().min(1).max(128),workspaceId:z.uuid(),ownerPrincipalId:z.uuid(),
 conversationIds:z.array(z.uuid()).min(1).max(4).refine(ids=>new Set(ids).size===ids.length),
 recordedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),capMicroUsd:z.number().int().min(1).max(2500000),
}).refine(value=>Date.parse(value.expiresAt)>Date.parse(value.recordedAt)&&Date.parse(value.expiresAt)-Date.parse(value.recordedAt)<=86400000);
type Binding=z.infer<typeof hostedRootBudgetSchema>;
type Principal={principalId?:string;attributes?:Record<string,unknown>}|null|undefined;
const pricingSchema=z.record(z.string(),z.strictObject({input:z.number().finite().nonnegative(),output:z.number().finite().nonnegative()}));
const denied=()=>new HttpFailure(429,'hosted_root_budget_unavailable','Hosted root acceptance is unavailable');
function binding():Binding|null{
 const raw=process.env.TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON;
 if(!raw)return null;
 if(Buffer.byteLength(raw)>8192)throw denied();
 try{return hostedRootBudgetSchema.parse(JSON.parse(raw));}catch{throw denied();}
}
/** Safe configured identity for the existing authenticated owner diagnostic.
 * This readback does not assert admission, available funds or provider health. */
export function readHostedRootConfiguration(){
 const configured=binding();
 return configured?{...configured,bindingDigest:createHash('sha256').update(JSON.stringify(configured)).digest('hex')}:null;
}
/** Derive membership in this finite exercise from the immutable actual attempt,
 * never from model text, a caller-supplied conversation, or ambient async state. */
export async function hostedRootAttempt(db:PoolClient,principal:Principal){
 const configured=binding();if(!configured)return null;
 const attemptId=principal?.attributes?.turasAttemptId;
 if(typeof attemptId!=='string'||!principal?.principalId)return null;
 const row=(await db.query(`SELECT c.id,c.owner_principal_id,c.workspace_id,c.environment_id,c.eve_session_id,
  c.created_at,a.created_at AS attempt_created_at,w.classification,w.pilot_environment_id,w.active AS workspace_active,
  p.active AS principal_active,c.archived_at,c.binding_state,a.dispatch_state,a.response_state,
  EXISTS(SELECT 1 FROM response_attempts older WHERE older.conversation_id=c.id AND older.created_at<$2::timestamptz) AS prior_work
  FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id JOIN workspaces w ON w.id=c.workspace_id
  JOIN principals p ON p.id=c.owner_principal_id
  WHERE a.id=$1`,[attemptId,configured.recordedAt])).rows[0];
 if(!row||!configured.conversationIds.includes(row.id))return null;
 if(process.env.VERCEL_ENV!==configured.target||process.env.VERCEL_PROJECT_ID!==configured.projectId
  ||!/^dpl_[A-Za-z0-9]+$/.test(process.env.VERCEL_DEPLOYMENT_ID??'')||operationalCodeVersion()!==configured.sourceCommit
  ||process.env.TURAS_ENVIRONMENT_ID!==configured.environmentMarker||Date.now()<Date.parse(configured.recordedAt)
  ||Date.now()>=Date.parse(configured.expiresAt)||row.owner_principal_id!==principal.principalId
  ||row.owner_principal_id!==configured.ownerPrincipalId||row.workspace_id!==configured.workspaceId
  ||row.environment_id!==configured.environmentMarker||row.pilot_environment_id!==configured.environmentMarker
  ||row.classification!=='synthetic_pilot'||!row.workspace_active||!row.principal_active||row.archived_at
  ||row.binding_state!=='bound'||row.dispatch_state!=='admitted'||!['running','waiting_input'].includes(row.response_state)
  ||row.prior_work||row.created_at.getTime()>Date.parse(configured.recordedAt)
  ||row.attempt_created_at.getTime()<Date.parse(configured.recordedAt))throw denied();
 return {configured,attemptId,conversationId:String(row.id),nativeSessionId:String(row.eve_session_id)};
}
export type HostedRootOperation=NonNullable<Parameters<typeof settleParityProvider>[0]>;
/** Called after all ordinary prompt/file/current-knowledge enrichment. Unknown
 * outcomes retain their full ceiling and prevent subsequent exercise dispatch. */
export async function reserveHostedRoot(principal:Principal,nativeSessionId:string,turnId:string,inputBytes:number,outputTokens:number){
 if(!process.env.TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON)return null;
 return withTransaction(async db=>{
  const scope=await hostedRootAttempt(db,principal);if(!scope)return null;
  if(scope.nativeSessionId!==nativeSessionId||!turnId||process.env.TURAS_PARITY_EVALUATION_BUDGET_ID)throw denied();
  const {configured}=scope;
  const admission=(await db.query('SELECT deployment_id,binding_digest,recorded_at FROM operations_hosted_root_admissions WHERE budget_id=$1 AND deployment_id=$2',[configured.budgetId,process.env.VERCEL_DEPLOYMENT_ID])).rows[0];
  if(!admission||admission.deployment_id!==process.env.VERCEL_DEPLOYMENT_ID
   ||admission.binding_digest!==createHash('sha256').update(JSON.stringify(configured)).digest('hex')
   ||admission.recorded_at.getTime()<Date.parse(configured.recordedAt))throw denied();
  const budget=(await db.query(`SELECT * FROM parity_evaluation_budgets WHERE id=$1 AND environment_id=$2
   AND workspace_id=$3 AND owner_principal_id=$4 AND state='open' AND expires_at>clock_timestamp() FOR UPDATE`,
   [configured.budgetId,configured.environmentMarker,configured.workspaceId,configured.ownerPrincipalId])).rows[0];
  if(!budget||Number(budget.cap_micro_usd)!==configured.capMicroUsd||budget.expires_at.getTime()>Date.parse(configured.expiresAt)
   ||(await db.query('SELECT 1 FROM parity_evaluation_operations WHERE budget_id=$1 AND settled_at IS NULL LIMIT 1',[configured.budgetId])).rowCount)throw denied();
  const price=pricingSchema.parse(budget.pricing)['spacexai/grok-4.7'];if(!price)throw denied();
  const amount=modelCostCeiling(inputBytes,outputTokens,price.input,price.output);
  if(!Number.isSafeInteger(amount)||BigInt(budget.reserved_micro_usd)+BigInt(amount)>BigInt(budget.cap_micro_usd))throw denied();
  const id=randomUUID();
  await db.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=reserved_micro_usd+$2 WHERE id=$1',[configured.budgetId,amount]);
  await db.query('INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,$3,$4)',
   [id,configured.budgetId,JSON.stringify({contract:'pilot-root-dispatch-v1',model:'spacexai/grok-4.7',attemptId:scope.attemptId,nativeSessionId,turnId}),amount]);
  return {id,budgetId:configured.budgetId,amount};
 });
}
export const settleHostedRoot=settleParityProvider;
async function rememberIdentity(operation:HostedRootOperation,value:unknown){
 const identity=z.string().min(1).max(256).parse(value);
 await withTransaction(async db=>{
  await db.query('INSERT INTO operations_hosted_root_provider_identities(operation_id,provider_key) VALUES($1,$2) ON CONFLICT(operation_id) DO NOTHING',[operation.id,identity]);
  const row=(await db.query('SELECT provider_key FROM operations_hosted_root_provider_identities WHERE operation_id=$1',[operation.id])).rows[0];
  if(row?.provider_key!==identity)throw denied();
 });
}
/** Refuse even provider-executed or adversarial tool frames before Eve sees
 * them. The provider also receives no tools and an explicit none choice. */
export function assertHostedRootPart(part:{type:string}){
 if(part.type.includes('tool'))throw new HttpFailure(403,'hosted_root_tool_denied','Root-only acceptance cannot dispatch tools');
}
export function wrapHostedRootBudget(model:Parameters<typeof wrapLanguageModel>[0]['model'],principal:Principal,nativeSessionId:string,turnId:string){
 if(!process.env.TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON)return model;
 let called=false,operation:HostedRootOperation|null=null,providerIdentity:string|undefined;
 return wrapLanguageModel({model,middleware:{
  async transformParams({params}){
   if(called)throw denied();called=true;
   operation=await reserveHostedRoot(principal,nativeSessionId,turnId,
    Buffer.byteLength(JSON.stringify({prompt:params.prompt,tools:[]}))+8192+128*params.prompt.length,params.maxOutputTokens??8192);
   return operation?{...params,tools:[],toolChoice:{type:'none' as const}}:params;
  },
  async wrapGenerate({doGenerate}){
   const result=await doGenerate();if(operation){
    const response=z.object({id:z.string()}).safeParse(result.response);
    if(response.success)await rememberIdentity(operation,response.data.id);
    for(const part of result.content)assertHostedRootPart(part);
    if(response.success)await settleHostedRoot(operation,result.providerMetadata);
   }return result;
  },
  async wrapStream({doStream}){
   const result=await doStream();return {...result,stream:result.stream.pipeThrough(new TransformStream({
    async transform(part,controller){if(operation){
     assertHostedRootPart(part);
     if(part.type==='response-metadata'&&part.id){await rememberIdentity(operation,part.id);providerIdentity=part.id;}
     if(part.type==='finish'&&providerIdentity)await settleHostedRoot(operation,part.providerMetadata);
    }controller.enqueue(part);},
   }))};
  },
 }});
}
