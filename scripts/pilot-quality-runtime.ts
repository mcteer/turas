import {z} from 'zod';
import {qualityStepAuthorization,verifyQualityStepAuthorization} from './pilot-quality-step-authorization';
import {resolve,dirname,basename,join} from 'node:path';
import {realpath} from 'node:fs/promises';
import {Client} from 'pg';
import {readEvidence,writeEvidence} from './pilot-evidence';
import {randomUUID} from 'node:crypto';
import {pilotSource} from './pilot-source';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {budgetedGatewayFetch} from './pilot-quality-fetch';
import {publishedQualityCeiling} from './pilot-quality-pricing';
import {budgetedQualityContextFetch} from './pilot-quality-context';

const incomingFile=process.env.TURAS_016_QUALITY_RUNTIME_FILE;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const runtimeSchema=z.strictObject({contract:z.literal('pilot-quality-runtime-v1'),id:z.uuid(),attemptId:z.uuid().optional(),stepAuthorization:qualityStepAuthorization.optional(),sourceRoot:z.string().min(1),ledgerRoot:z.string().min(1),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,authorizationDigest:digest,capMicroUsd:z.number().int().positive().safe(),contextCreditCap:z.number().int().min(0).max(4).optional(),expiresAt:z.iso.datetime({offset:true})});
async function configuration(){
 const file=process.env.TURAS_016_QUALITY_RUNTIME_FILE??incomingFile;
 if(!file)return null;
 if(file!==resolve(file)||await realpath(file)!==file)throw Error('Exact private evaluation runtime file required');
 const config=runtimeSchema.parse(await readEvidence(dirname(file),basename(file)));
 if(config.sourceRoot!==resolve(config.sourceRoot)||await realpath(config.sourceRoot)!==config.sourceRoot||config.ledgerRoot!==resolve(config.ledgerRoot)||Date.parse(config.expiresAt)<=Date.now())throw Error('Evaluation runtime scope unavailable');
 const authority=await new QualityBudgetLedger(config.ledgerRoot).currentAuthority();
 const scope=await new QualityBudgetLedger(config.ledgerRoot).currentSource();
 if(authority.id!==config.id||scope.sourceDigest!==config.sourceDigest||scope.catalogDigest!==config.catalogDigest||scope.attemptId!==config.attemptId||scope.sourceCommit!==undefined&&scope.sourceCommit!==config.sourceCommit||authority.authorizationDigest!==config.authorizationDigest||authority.capMicroUsd!==config.capMicroUsd||(authority.contextCreditCap??0)!==(config.contextCreditCap??0)||authority.expiresAt!==config.expiresAt||authority.modelId!=='spacexai/grok-4.7')throw Error('Evaluation runtime budget differs');
 if(config.stepAuthorization)verifyQualityStepAuthorization(config.stepAuthorization,{id:config.id,authorizationDigest:config.authorizationDigest,expiresAt:config.expiresAt});
 return {file,config};
}
/** Only the explicit operator runtime can add these options to child processes.
 * Ordinary deterministic and feature-specific runs retain their prior setup. */
export async function qualityChildEnvironment():Promise<{NODE_OPTIONS?:string;TURAS_016_QUALITY_RUNTIME_FILE?:string;TURAS_ALLOW_LIVE_MODEL_TESTS?:string}>{
 const runtime=await configuration();if(!runtime)return {NODE_OPTIONS:""};
 return {TURAS_016_QUALITY_RUNTIME_FILE:runtime.file,TURAS_ALLOW_LIVE_MODEL_TESTS:'1',NODE_OPTIONS:'--import='+JSON.stringify(join(runtime.config.sourceRoot,'scripts/pilot-quality-bootstrap.mjs'))};
}
async function syntheticScope(){
 const marker=process.env.TURAS_ENVIRONMENT_ID;
 if(process.env.TURAS_ALLOW_LIVE_MODEL_TESTS!=='1'||!marker?.startsWith('test-')||marker!==process.env.TURAS_TEST_ENVIRONMENT_ID)throw Error('Actual quality work requires an explicitly owned synthetic runtime');
 const raw=process.env.DATABASE_URL_UNPOOLED,urls=[process.env.DATABASE_URL,raw,process.env.TURAS_TEST_DATABASE_URL];
 let connectionIdentity:string|undefined;
 for(const value of urls){if(!value)throw Error('Synthetic evaluation connection unavailable');const url=new URL(value);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||!/^\/turas_(?:test_|eval_)[a-z0-9_]{10,60}$/.test(url.pathname))throw Error('Hosted or unowned quality source denied');const identity=url.host+url.pathname;if(connectionIdentity&&identity!==connectionIdentity)throw Error('Evaluation connection targets differ');connectionIdentity=identity;}
 const db=new Client({connectionString:raw,connectionTimeoutMillis:3000});try{await db.connect();await db.query("SET statement_timeout='3000ms'");const rows=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;if(rows.length!==1||rows[0].environment_id!==marker||Number(rows[0].schema_version)!==79)throw Error('Current synthetic evaluation schema required');}finally{await db.end();}
}
/** Native Node preloader: no provider is contacted during installation. The
 * immutable fetch guard covers SDK retries, all model steps and embeddings. */
export async function installQualityRuntime(){
 const runtime=await configuration();if(!runtime)throw Error('Explicit quality budget runtime required');
 const originalFetch=globalThis.fetch.bind(globalThis),ledger=new QualityBudgetLedger(runtime.config.ledgerRoot);
 const currentSource=async()=>{const attempt=await ledger.currentSource();if(attempt.attemptId!==runtime.config.attemptId||attempt.sourceDigest!==runtime.config.sourceDigest||attempt.catalogDigest!==runtime.config.catalogDigest)throw Error('Prior quality attempt cannot dispatch');const source=await pilotSource(runtime.config.sourceRoot);if(source.sourceCommit!==runtime.config.sourceCommit||source.sourceDigest!==runtime.config.sourceDigest||source.catalogDigest!==runtime.config.catalogDigest)throw Error('Quality source changed before paid admission');};
 const currentScope=async()=>{await syntheticScope();await currentSource();};
 const contextFetch=budgetedQualityContextFetch({ledger,attemptId:runtime.config.attemptId,fetch:originalFetch,scope:currentScope,evidence:receipt=>writeEvidence(dirname(runtime.file),`research-credit-${randomUUID()}.json`,receipt).then(()=>undefined)});
 const guarded=budgetedGatewayFetch({ledger,attemptId:runtime.config.attemptId,fetch:contextFetch,failed:failure=>writeEvidence(dirname(runtime.file),`model-failure-${randomUUID()}.json`,{contract:'pilot-quality-provider-failure-v1',budgetId:runtime.config.id,attemptId:runtime.config.attemptId,processId:process.pid,sourceDigest:runtime.config.sourceDigest,...failure,unknownChargeSettled:false,observedAt:new Date().toISOString()}).then(()=>undefined),observed:async operation=>{await writeEvidence(dirname(runtime.file),`model-request-observed-${randomUUID()}.json`,{contract:'pilot-quality-request-v1',budgetId:runtime.config.id,processId:process.pid,...operation,providerDispatched:false,observedAt:new Date().toISOString()});},denied:async ceiling=>{
  await writeEvidence(dirname(runtime.file),`model-denial-${randomUUID()}.json`,{contract:'pilot-quality-denial-v1',budgetId:runtime.config.id,processId:process.pid,sourceDigest:runtime.config.sourceDigest,...ceiling,reason:'insufficient_budget',providerDispatched:false,observedAt:new Date().toISOString()});
 },ceiling:async model=>{
  let phase:'synthetic_scope'|'current_source'|'published_pricing'='synthetic_scope';
  try{await syntheticScope();phase='current_source';await currentSource();
   phase='published_pricing';return await publishedQualityCeiling(model);
  }catch(error){await writeEvidence(dirname(runtime.file),`model-admission-blocked-${randomUUID()}.json`,{contract:'pilot-quality-admission-blocked-v1',budgetId:runtime.config.id,processId:process.pid,sourceDigest:runtime.config.sourceDigest,modelId:model,phase,providerDispatched:false,observedAt:new Date().toISOString()});throw error;}
 }});
 let currentFetch:typeof fetch=guarded;
 // The pinned Next runtime wraps fetch for request/cache bookkeeping. Its
 // POST path delegates to the original guarded fetch; it cannot replace it.
 Object.defineProperty(globalThis,'fetch',{configurable:false,enumerable:true,get:()=>currentFetch,set:value=>{
  if(value===currentFetch)return;
  if(typeof value==='function'&&value.__nextPatched===true&&typeof value._nextOriginalFetch==='function'){currentFetch=value;return;}
  throw Error('Unbudgeted evaluation fetch replacement denied');
 }});
 await writeEvidence(dirname(runtime.file),`model-guard-installed-${randomUUID()}.json`,{contract:'pilot-quality-guard-v1',budgetId:runtime.config.id,processId:process.pid,sourceDigest:runtime.config.sourceDigest,providerDispatched:false,installedAt:new Date().toISOString()});
 return {installed:true,providerCalls:0};
}

/** Expanded steps require the current 016 runtime and its separate operator approval. */
export async function qualityProfileModelStepCap(feature:string,caseFilter:string|null){
 if(feature!=='003'||caseFilter)return 14;
 const runtime=await configuration();
 return runtime?.config.stepAuthorization?.modelStepCap??14;
}
