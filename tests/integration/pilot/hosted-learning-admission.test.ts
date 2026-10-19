import {it,expect,vi} from 'vitest';
import {reconcileHostedLearningDispatch} from '../../../scripts/pilot-hosted-learning-reconcile';
const provider=vi.hoisted(()=>({response:undefined as unknown,calls:0}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),createGateway:()=>({getGenerationInfo:async()=>{provider.calls++;return provider.response;}})}));
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import type {wrapLanguageModel} from 'ai';
import {withHostedLearningFixture as fixture} from '../../fixtures/pilot/hosted-learning';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {wrapStaffingModel} from '../../../lib/server/staffing/model-budget';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {admitHostedLearningDispatch} from '../../../scripts/pilot-hosted-learning-admission';

it('consumes one actual original-journal arm with immutable owner admission and separate early provider identities',async()=>fixture(async f=>{
 expect(await f.admit()).toMatchObject({alreadyAdmitted:false,originalHoldRetained:true,ceilingMicroUsd:f.ceiling});
 expect(await f.admit()).toMatchObject({alreadyAdmitted:true});const a=await f.prepare(),generation='gen_'+randomUUID(),upstream='synthetic-upstream-'+randomUUID();
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async()=>({content:[{type:'text',text:'Synthetic accounting output'}],response:{id:upstream},usage:{inputTokens:{total:10},outputTokens:{total:10}},providerMetadata:{gateway:{generationId:generation,cost:'0.001'}}})} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
 await wrapStaffingModel(model,a.admitted.mode,{deadlineAt:a.admitted.deadlineAt,beforeProvider:a.release}).doGenerate({prompt:[]});
 expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_learning_consumptions')).rows[0].n).toBe(1);
 expect((await f.db.query('SELECT identity_kind,provider_key FROM operations_hosted_learning_provider_identities ORDER BY identity_kind')).rows).toEqual([{identity_kind:'gateway_generation',provider_key:generation},{identity_kind:'provider_response',provider_key:upstream}]);
 expect(await f.ledger.status()).toMatchObject({heldMicroUsd:f.ceiling,chargedMicroUsd:0,dispatches:1});
 process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';provider.calls=0;
 const observed={id:generation,model:'spacexai/grok-4.7',totalCost:0.001,usage:0.001,upstreamInferenceCost:0,isByok:false,createdAt:new Date().toISOString(),streamed:true,finishReason:'stop',promptTokens:10,completionTokens:10,reasoningTokens:0,cachedTokens:0,cacheCreationTokens:0,billableWebSearchCalls:0,latency:1,generationTime:1,providerName:'synthetic-no-provider'};
 const reconcile=()=>reconcileHostedLearningDispatch({db:f.db,ledger:f.ledger,dispatchId:f.dispatch,binding:f.binding,signal:f.environment.signal});
 for(const changed of [{id:'gen_foreign'},{streamed:false},{usage:0},{model:'other/model'},{isByok:true},{totalCost:Infinity},{billableWebSearchCalls:1},{createdAt:new Date(0).toISOString()}]){provider.response={...observed,...changed};await expect(reconcile()).rejects.toThrow();expect(await f.ledger.status()).toMatchObject({heldMicroUsd:f.ceiling,chargedMicroUsd:0});}
 provider.response={...observed,totalCost:0.002,usage:0.002};expect(await reconcile()).toMatchObject({reconciliationSuccessful:false,originalHoldRetained:true});
 provider.response={...observed,totalCost:0.0010000000001,usage:0.0010000000001};expect(await reconcile()).toMatchObject({reconciliationSuccessful:false,originalHoldRetained:true,actualMicroUsd:1001});
 provider.response=observed;
 const expired=vi.spyOn(Date,'now').mockReturnValue(Date.parse(f.binding.expiresAt)+1);
 try{await expect(f.ledger.hostedDispatch(f.dispatch)).rejects.toThrow('Original unresolved');expect(await reconcile()).toMatchObject({reconciliationSuccessful:true,originalHoldRetained:false,actualMicroUsd:1000,approvalExtended:false});}finally{expired.mockRestore();}
 expect(await f.ledger.status()).toMatchObject({heldMicroUsd:0,chargedMicroUsd:1000});const reads=provider.calls;await expect(reconcile()).rejects.toThrow('Original unresolved');expect(provider.calls).toBe(reads);
 await expect(f.db.query('UPDATE operations_hosted_learning_admissions SET cap_micro_usd=1')).rejects.toThrow('immutable');
 const snapshot=await captureRecoveryDenialSnapshot(f.db,f.environment.environmentId,f.environment.signal);expect(snapshot.tables.filter(row=>row.name.startsWith('operations_hosted_learning_'))).toHaveLength(3);
}),210000);

it('refuses missing foreign expired or disabled hosted authority before any domain provider claim',async()=>{
 await fixture(async f=>{
  const a=await f.prepare();await expect(a.release()).rejects.toThrow();
  expect((await f.db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(0);
  expect(await f.ledger.status()).toMatchObject({heldMicroUsd:f.ceiling});
 });
 await fixture(async f=>{
  // An unrelated configured workspace must not govern ordinary real-customer work.
  await f.db.query('UPDATE customer_references SET synthetic=false WHERE id=$1',[f.meta.customer_id]);
  process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON=JSON.stringify({...f.binding,workspaceId:randomUUID()});
  const a=await f.prepare();await a.release();
  expect((await f.db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(1);
  expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_learning_consumptions')).rows[0].n).toBe(0);
 });
 await fixture(async f=>{
  await f.admit();const a=await f.prepare(),original=JSON.stringify(f.binding);
  for(const changed of [null,{...f.binding,workspaceId:randomUUID()},{...f.binding,projectId:'prj_foreign'},{...f.binding,sourceCommit:'e'.repeat(40)},
   {...f.binding,budgetId:randomUUID()},{...f.binding,recordedAt:new Date(Date.now()-7200000).toISOString(),expiresAt:new Date(Date.now()-3600000).toISOString()}]){
   if(changed)process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON=JSON.stringify(changed);else delete process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON;
   await expect(a.release()).rejects.toThrow();
   expect((await f.db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(0);
   expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_learning_consumptions')).rows[0].n).toBe(0);
  }
  process.env.TURAS_PILOT_HOSTED_LEARNING_LEDGER_JSON=original;await a.release();
  expect(await f.ledger.status()).toMatchObject({heldMicroUsd:f.ceiling,dispatches:1});
 });
},300000);

it('serializes concurrent native release and rejects runtime minting and repeated consumption',async()=>fixture(async f=>{
 await f.admit();const a=await f.prepare(),results=await Promise.allSettled([a.release(),a.release()]);expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);
 expect((await f.db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(1);expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_learning_consumptions')).rows[0].n).toBe(1);
 await expect(a.release()).rejects.toThrow();
 const runtime=new Client({connectionString:requireOwnedPilotDatabase()});await runtime.connect();try{await expect(runtime.query('INSERT INTO operations_hosted_learning_admissions SELECT * FROM operations_hosted_learning_admissions')).rejects.toThrow('permission denied');await expect(runtime.query('DELETE FROM operations_hosted_learning_consumptions')).rejects.toThrow('permission denied');}finally{await runtime.end();}
 expect(await f.ledger.status()).toMatchObject({dispatches:1,heldMicroUsd:f.ceiling});
}),210000);

it('rejects claimed journal reservations and replacement original budgets without changing either cap',async()=>fixture(async f=>{
 await expect(admitHostedLearningDispatch({db:f.db,ledger:f.ledger,dispatchId:randomUUID(),binding:f.binding,signal:f.environment.signal})).rejects.toThrow('Original unresolved');
 await expect(admitHostedLearningDispatch({db:f.db,ledger:f.ledger,dispatchId:f.dispatch,binding:{...f.binding,budgetId:randomUUID()},signal:f.environment.signal})).rejects.toThrow('Exact original');
 await f.admit();
 const columns=(await f.db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='operations_hosted_learning_admissions' ORDER BY ordinal_position")).rows.map(row=>String(row.column_name));
 const selected=columns.map(column=>column==='journal_dispatch_id'||column==='journal_budget_id'?"'"+randomUUID()+"'::uuid":column);
 await expect(f.db.query('INSERT INTO operations_hosted_learning_admissions('+columns.join(',')+') SELECT '+selected.join(',')+' FROM operations_hosted_learning_admissions')).rejects.toThrow('cannot be replaced');
 expect(await f.ledger.status()).toMatchObject({capMicroUsd:25000000,heldMicroUsd:f.ceiling,chargedMicroUsd:0});
 const a=await f.prepare();await a.release();const generation='gen_'+randomUUID();
 await f.db.query("INSERT INTO operations_hosted_learning_provider_identities(reservation_id,identity_kind,provider_key) SELECT reservation_id,'gateway_generation',$1 FROM operations_hosted_learning_consumptions",[generation]);
 process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';const cost=(f.ceiling+1)/1000000;
 provider.response={id:generation,model:'spacexai/grok-4.7',totalCost:cost,usage:cost,upstreamInferenceCost:0,isByok:false,createdAt:new Date().toISOString(),streamed:true,finishReason:'stop',promptTokens:10,completionTokens:10,reasoningTokens:0,cachedTokens:0,cacheCreationTokens:0,billableWebSearchCalls:0,latency:1,generationTime:1,providerName:'synthetic-no-provider'};
 await expect(reconcileHostedLearningDispatch({db:f.db,ledger:f.ledger,dispatchId:f.dispatch,binding:f.binding,signal:f.environment.signal})).rejects.toThrow('operator review');
 expect(await f.ledger.status()).toMatchObject({capMicroUsd:25000000,heldMicroUsd:Math.ceil(cost*1000000),chargedMicroUsd:0,unknown:1,admissionHeld:true});
 expect((await f.db.query('SELECT count(*)::int AS n FROM learning_budget_settlements')).rows[0].n).toBe(0);
}),210000);

it('retains both original holds and the genuine Gateway identity after an actual wrapped SDK failure',async()=>fixture(async f=>{
 await f.admit();const a=await f.prepare(),generation='gen_'+randomUUID();let calls=0;
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},doGenerate:async()=>{calls++;throw Object.assign(new Error('Synthetic SDK failure'),{generationId:generation});}} as unknown as Parameters<typeof wrapLanguageModel>[0]['model'];
 const wrapped=wrapStaffingModel(model,a.admitted.mode,{deadlineAt:a.admitted.deadlineAt,beforeProvider:a.release});await expect(wrapped.doGenerate({prompt:[]})).rejects.toThrow('Synthetic SDK failure');await expect(wrapped.doGenerate({prompt:[]})).rejects.toThrow();expect(calls).toBe(1);
 expect((await f.db.query("SELECT provider_key FROM operations_hosted_learning_provider_identities WHERE identity_kind='gateway_generation'")).rows[0].provider_key).toBe(generation);
 expect((await f.db.query('SELECT state FROM learning_attempts WHERE id=$1',[f.meta.id])).rows[0].state).toBe('unconfirmed');
 await f.ledger.hold(f.dispatch,'provider_error');expect(await f.ledger.status()).toMatchObject({unknown:1,heldMicroUsd:f.ceiling,chargedMicroUsd:0});
}),210000);

it('rolls back hosted consumption with a failed domain claim and never releases its original reservation',async()=>fixture(async f=>{
 await f.admit();const a=await f.prepare();
 await f.db.query("CREATE FUNCTION synthetic_learning_dispatch_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic claim failure'; END $$; CREATE TRIGGER synthetic_learning_dispatch_failure BEFORE INSERT ON learning_model_dispatches FOR EACH ROW EXECUTE FUNCTION synthetic_learning_dispatch_failure()");
 await expect(a.release()).rejects.toThrow('Synthetic claim failure');expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_learning_consumptions')).rows[0].n).toBe(0);expect((await f.db.query('SELECT count(*)::int AS n FROM learning_model_dispatches')).rows[0].n).toBe(0);
 expect(await f.ledger.status()).toMatchObject({heldMicroUsd:f.ceiling,dispatches:1,chargedMicroUsd:0});
}),210000);
