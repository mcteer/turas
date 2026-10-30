import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withHostedRootBudgetFixture as fixture} from '../../fixtures/pilot/hosted-root';
import {wrapHostedRootBudget,reserveHostedRoot,settleHostedRoot} from '../../../lib/server/conversations/hosted-root-budget';
import {reconcileHostedRootGeneration,lookupPilotGatewayGeneration,fetchPilotGatewayGeneration} from '../../../scripts/pilot-hosted-root-reconcile';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
const provider=vi.hoisted(()=>({response:undefined as unknown,calls:0}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),createGateway:()=>({getGenerationInfo:async()=>{provider.calls++;return provider.response;}})}));

it('bounds accounting-only rereads of one immutable generation and stops on invalid scope cancellation or client errors',async()=>{
 vi.useFakeTimers();
 const request=new Request('https://ai-gateway.vercel.sh/v1/generation?id=gen_synthetic');
 try{
  const waits:number[]=[],paced=async(ms:number,signal:AbortSignal)=>{signal.throwIfAborted();waits.push(ms);};
  let extra=0;const seen:Request[]=[],transport=vi.fn(async(r:Request)=>{seen.push(r);return new Response('{}',{status:seen.length<10?404:200});});
  const result=fetchPilotGatewayGeneration(request,new AbortController().signal,transport as never,()=>{extra++;},paced);
  await vi.runAllTimersAsync();expect((await result).status).toBe(200);expect(extra).toBe(9);expect(seen).toHaveLength(10);expect(waits).toEqual(Array(9).fill(2000));expect(waits.reduce((a,b)=>a+b,0)).toBe(18000);
  expect(seen.every(r=>r.method==='GET'&&r.url===request.url)).toBe(true);
  for(const status of [400,401,403,422]){
   const once=vi.fn(async()=>new Response('{}',{status}));expect((await fetchPilotGatewayGeneration(request,new AbortController().signal,once as never)).status).toBe(status);expect(once).toHaveBeenCalledTimes(1);
  }
  const unavailable=vi.fn(async()=>new Response('{}',{status:503}));const exhausted=fetchPilotGatewayGeneration(request,new AbortController().signal,unavailable as never,()=>{},paced);await vi.runAllTimersAsync();expect((await exhausted).status).toBe(503);expect(unavailable).toHaveBeenCalledTimes(10);
  const denied=vi.fn();await expect(fetchPilotGatewayGeneration(new Request(request.url,{method:'POST'}),new AbortController().signal,denied as never)).rejects.toThrow('Fixed generation');expect(denied).not.toHaveBeenCalled();
  const abort=new AbortController();abort.abort();await expect(fetchPilotGatewayGeneration(request,abort.signal,denied as never)).rejects.toThrow();expect(denied).not.toHaveBeenCalled();
  for(const name of ['TypeError','TimeoutError']){
   let calls=0;const network=vi.fn(async()=>{if(!calls++){const error=new Error('Synthetic connection failure');error.name=name;throw error;}return new Response('{}');});
   const recovered=fetchPilotGatewayGeneration(request,new AbortController().signal,network as never,()=>{},paced);await vi.runAllTimersAsync();expect((await recovered).status).toBe(200);expect(network).toHaveBeenCalledTimes(2);
  }
  const duringWait=new AbortController(),temporary=vi.fn(async()=>new Response('{}',{status:429}));
  const waiting=fetchPilotGatewayGeneration(request,duringWait.signal,temporary as never);const waitRejected=expect(waiting).rejects.toThrow();await Promise.resolve();duringWait.abort();await waitRejected;expect(temporary).toHaveBeenCalledTimes(1);
  const duringBody=new AbortController();let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}});
  const reading=fetchPilotGatewayGeneration(request,duringBody.signal,(async()=>new Response(body)) as never);const readRejected=expect(reading).rejects.toThrow();await Promise.resolve();duringBody.abort();await readRejected;expect(cancelled).toBe(true);
  const oversized=vi.fn(async()=>new Response(new Uint8Array(1048577)));
  await expect(fetchPilotGatewayGeneration(request,new AbortController().signal,oversized as never)).rejects.toThrow('exceeds bound');expect(oversized).toHaveBeenCalledTimes(1);
  const malformed=vi.fn(async()=>new Response('invalid accounting'));
  expect(await (await fetchPilotGatewayGeneration(request,new AbortController().signal,malformed as never)).text()).toBe('invalid accounting');expect(malformed).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});

async function accounting(f:Parameters<Parameters<typeof fixture>[0]>[0],identity=true){
 provider.calls=0;process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';
 const generationId='gen_'+randomUUID(),upstreamId='synthetic-upstream-'+randomUUID();
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'anthropic/claude-sonnet-5.5',supportedUrls:{},
  async doGenerate(){return {content:[{type:'text',text:'Synthetic interrupted accounting'}],response:{id:upstreamId},providerMetadata:{gateway:identity?{generationId}:{}}};},async doStream(){throw Error('Unused');}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 await wrapHostedRootBudget(model,f.principal,f.native,'synthetic-turn').doGenerate({prompt:[],maxOutputTokens:700});
 const operation=(await f.db.query('SELECT * FROM parity_evaluation_operations WHERE budget_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[f.binding.budgetId])).rows[0];
 const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:f.binding.projectId,teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:'https://synthetic.example',environmentMarker:f.binding.environmentMarker,workspaceId:f.binding.workspaceId,target:f.binding.target,sourceCommit:f.binding.sourceCommit,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
 const response={id:generationId,model:'anthropic/claude-sonnet-5.5',totalCost:0.0001,usage:0.0001,upstreamInferenceCost:0,isByok:false,createdAt:operation.created_at.toISOString(),streamed:false,finishReason:'stop',promptTokens:10,completionTokens:10,reasoningTokens:0,cachedTokens:0,cacheCreationTokens:0,billableWebSearchCalls:0,latency:1,generationTime:1,providerName:'synthetic-no-provider'};
 provider.response=response;
 return {scope,operation,response,generationId,upstreamId,run:()=>reconcileHostedRootGeneration({db:f.db,scope,operationId:operation.id,signal:AbortSignal.timeout(30000)})};
}

it('reconciles only the original Gateway identity and atomically preserves its actual charge across replay',async()=>fixture(async f=>{
 const a=await accounting(f),first=await a.run();expect(first).toMatchObject({actualMicroUsd:100,releasedExcessMicroUsd:600,alreadyRecorded:false,providerReads:1,modelCalls:0});
 expect(await a.run()).toMatchObject({actualMicroUsd:100,releasedExcessMicroUsd:0,alreadyRecorded:true,providerReads:0});expect(provider.calls).toBe(1);
 expect((await f.db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0].reserved_micro_usd).toBe('100');
 const receipt=(await f.db.query('SELECT operation_id,provider_key,actual_micro_usd,input_tokens,output_tokens FROM operations_hosted_root_generation_receipts')).rows[0];
 expect(receipt).toEqual({operation_id:a.operation.id,provider_key:a.generationId,actual_micro_usd:'100',input_tokens:'10',output_tokens:'10'});expect(receipt.provider_key).not.toBe(a.upstreamId);
 await expect(f.db.query('UPDATE operations_hosted_root_generation_receipts SET actual_micro_usd=0')).rejects.toThrow('immutable');
 await f.db.query('SET ROLE turas_runtime');
 await expect(a.run()).rejects.toThrow('Exact original owner');
 await expect(f.db.query('DELETE FROM operations_hosted_root_generation_receipts')).rejects.toMatchObject({code:'42501'});
 await f.db.query('RESET ROLE');expect(provider.calls).toBe(1);
}),210000);

it('retains unknown ceilings for mismatched nonterminal BYOK tool and invalid provider accounting',async()=>{
 // Gateway's accounting identifier differs from the selected dispatch model.
 // Preserve that returned identity, including an error generation's zero receipt.
 process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';
 const returned={id:'gen_synthetic_xai_error',model:'xai/grok-4.7',totalCost:0,usage:0,upstreamInferenceCost:0,isByok:false,
  createdAt:'2026-10-27T20:25:28.000Z',streamed:true,finishReason:'error',promptTokens:0,completionTokens:0,reasoningTokens:0,cachedTokens:0,cacheCreationTokens:0,
  billableWebSearchCalls:0,latency:0,generationTime:152,providerName:'xai'};
 provider.response=returned;
 await expect(lookupPilotGatewayGeneration(returned.id,AbortSignal.timeout(30000))).resolves.toEqual(returned);
 for(const changed of [{model:'xai/grok-4.7-other'},{model:'other/model'},{providerName:'other-provider'},{providerName:'XAI'}]){
  provider.response={...returned,...changed};
  await expect(lookupPilotGatewayGeneration(returned.id,AbortSignal.timeout(30000))).rejects.toThrow();
 }
 await fixture(async f=>{
 const a=await accounting(f);
 for(const changed of [{id:'gen_other'},{model:'spacexai/grok-4.7'},{model:'xai/grok-4.7',providerName:'xai'},{model:'other/model'},{createdAt:new Date(0).toISOString()},{streamed:true},{finishReason:'unknown'},{isByok:true},{billableWebSearchCalls:1},{totalCost:-1},{totalCost:Infinity},{usage:0},{completionTokens:-1}]){
  provider.response={...a.response,...changed};await expect(a.run()).rejects.toThrow();
  expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_root_generation_receipts')).rows[0].n).toBe(0);
  expect((await f.db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
 }
 expect((await f.db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0].reserved_micro_usd).toBe('700');
 // Exercise reconciliation of a retained historical dispatch without sending it.
 await f.db.query("UPDATE parity_evaluation_operations SET provider=jsonb_set(provider::jsonb,'{model}',to_jsonb('spacexai/grok-4.7'::text))::text WHERE id=$1",[a.operation.id]);
 provider.response={...a.response};await expect(a.run()).rejects.toThrow('Exact terminal');
 provider.response={...a.response,model:'xai/grok-4.7',providerName:'xai',finishReason:'error',totalCost:0,usage:0,promptTokens:0,completionTokens:0};
 expect(await a.run()).toMatchObject({actualMicroUsd:0,releasedExcessMicroUsd:700,modelCalls:0});
 });
},210000);

it('rolls back a receipt and refund together when settlement fails before commit',async()=>fixture(async f=>{
 const a=await accounting(f);
 await f.db.query(`CREATE FUNCTION synthetic_settlement_crash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic interruption before commit'; END $$;
  CREATE TRIGGER synthetic_settlement_crash BEFORE UPDATE ON parity_evaluation_operations FOR EACH ROW EXECUTE FUNCTION synthetic_settlement_crash();`);
 await expect(a.run()).rejects.toThrow('Synthetic interruption');
 expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_root_generation_receipts')).rows[0].n).toBe(0);
 expect((await f.db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0].reserved_micro_usd).toBe('700');
 await f.db.query('DROP TRIGGER synthetic_settlement_crash ON parity_evaluation_operations');
 expect(await a.run()).toMatchObject({actualMicroUsd:100,releasedExcessMicroUsd:600});
 expect(await a.run()).toMatchObject({alreadyRecorded:true,releasedExcessMicroUsd:0});expect(provider.calls).toBe(2);
}),210000);

it('refuses lookup without a recorded Gateway identity and never substitutes the upstream response ID',async()=>fixture(async f=>{
 const a=await accounting(f,false);await expect(a.run()).rejects.toThrow('Exact original owner');expect(provider.calls).toBe(0);
 expect((await f.db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
}),210000);

it('records known accounting in a retired budget without refunding or reopening its original scope',async()=>fixture(async f=>{
 const a=await accounting(f);await f.db.query("UPDATE parity_evaluation_budgets SET state='closed' WHERE id=$1",[f.binding.budgetId]);
 expect(await a.run()).toMatchObject({actualMicroUsd:100,releasedExcessMicroUsd:0,budgetReopened:false,approvalExtended:false});
 expect((await f.db.query('SELECT reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0]).toEqual({reserved_micro_usd:'700',state:'closed'});
}),210000);

it('records an actual provider overrun without increasing the original cap or admitting another dispatch',async()=>fixture(async f=>{
 const a=await accounting(f);provider.response={...a.response,totalCost:0.001,usage:0.001};
 expect(await a.run()).toMatchObject({actualMicroUsd:1000,releasedExcessMicroUsd:0,overrun:true});
 expect((await f.db.query('SELECT cap_micro_usd,reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0]).toEqual({cap_micro_usd:'10000',reserved_micro_usd:'700',state:'overrun'});
 await f.db.query("UPDATE parity_evaluation_budgets SET state='open' WHERE id=$1",[f.binding.budgetId]);
 await expect(reserveHostedRoot(f.principal,f.native,'another-turn',100,700)).rejects.toThrow();
}),210000);

it.each(['closed','recovered'] as const)('retains the original ceiling when provider completion follows a %s budget boundary',async boundary=>fixture(async f=>{
 const a=await accounting(f);
 for(const gateway of [{cost:''},{cost:' '},{cost:'0x0'},{cost:' 0.0001'},{cost:'0.0001 '},{cost:'Infinity'},{cost:-1},{cost:'0.0001',totalCost:'0.0002'}]){
  await settleHostedRoot({id:a.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway});
  expect((await f.db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
 }
 if(boundary==='closed')await f.db.query("UPDATE parity_evaluation_budgets SET state='closed' WHERE id=$1",[f.binding.budgetId]);
 else{
  const recovery=randomUUID(),control=(await f.db.query("UPDATE operations_control SET mode='locked',recovery_id=$2,revision=revision+1 WHERE environment_id=$1 RETURNING revision",[f.binding.environmentMarker,recovery])).rows[0];
  await f.db.query(`INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,ceiling_micro_usd,evidence_digest,evidence_digest_kind,source_captured_at,recovery_id,control_revision)
   VALUES($1,'parity_dollars',$2,$3,700,$4,'operation_row',clock_timestamp(),$5,$6)`,[f.binding.environmentMarker,a.operation.id,f.binding.budgetId,'a'.repeat(64),recovery,control.revision]);
 }
 if(boundary==='recovered'){
  await expect(settleHostedRoot({id:a.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway:{cost:'0.0001'}})).rejects.toThrow('Recovered model settlement requires owner accounting');
  expect((await f.db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
  expect(await a.run()).toMatchObject({actualMicroUsd:100,releasedExcessMicroUsd:0,reconciliationSuccessful:true});
 }else await settleHostedRoot({id:a.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway:{cost:'0.0001'}});
 expect((await f.db.query('SELECT actual_micro_usd,settled_at IS NOT NULL AS settled FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0]).toEqual({actual_micro_usd:'100',settled:true});
 expect((await f.db.query('SELECT reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0]).toEqual({reserved_micro_usd:'700',state:boundary==='closed'?'closed':'open'});
}),210000);

it('commits authoritative charge discrepancies before refusing any further dispatch or replay refund',async()=>fixture(async f=>{
 const a=await accounting(f);
 await settleHostedRoot({id:a.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway:{cost:'0.0001'}});
 const b=await accounting(f);
 await settleHostedRoot({id:b.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway:{cost:'0.0001'}});
 for(const [item,actual] of [[a,200],[b,1000]] as const){
  provider.response={...item.response,totalCost:actual/1000000,usage:actual/1000000};
  expect(await item.run()).toMatchObject({actualMicroUsd:actual,releasedExcessMicroUsd:0,overrun:actual>700,discrepancy:true,reconciliationSuccessful:false});
  expect((await f.db.query('SELECT actual_micro_usd FROM operations_hosted_root_generation_receipts WHERE operation_id=$1',[item.operation.id])).rows[0].actual_micro_usd).toBe(String(actual));
  expect((await f.db.query('SELECT actual_micro_usd FROM parity_evaluation_operations WHERE id=$1',[item.operation.id])).rows[0].actual_micro_usd).toBe('100');
  expect((await f.db.query('SELECT cap_micro_usd,reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0]).toEqual({cap_micro_usd:'10000',reserved_micro_usd:'200',state:'overrun'});
  expect(await item.run()).toMatchObject({alreadyRecorded:true,providerReads:0,discrepancy:true,reconciliationSuccessful:false,releasedExcessMicroUsd:0});
  await f.db.query("UPDATE parity_evaluation_budgets SET state='open' WHERE id=$1",[f.binding.budgetId]);
  await expect(reserveHostedRoot(f.principal,f.native,'another-turn',100,700)).rejects.toThrow();
 }
 expect(provider.calls).toBe(2);
}),210000);

it('serializes concurrent provider completion and owner reconciliation without losing or repeating refunds',async()=>fixture(async f=>{
 const a=await accounting(f),owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true),statement_timeout:10000});await owner.connect();
 let finishing:Promise<unknown>|undefined,reconciling:Promise<unknown>|undefined;
 try{
  await f.db.query('BEGIN');await f.db.query('SELECT id FROM parity_evaluation_budgets WHERE id=$1 FOR UPDATE',[f.binding.budgetId]);
  finishing=settleHostedRoot({id:a.operation.id,budgetId:f.binding.budgetId,amount:700},{gateway:{cost:'0.0001'}});
  reconciling=reconcileHostedRootGeneration({db:owner,scope:a.scope,operationId:a.operation.id,signal:AbortSignal.timeout(30000)});
  const until=Date.now()+5000;
  for(;;){
   await f.db.query('SELECT pg_stat_clear_snapshot()');
   const waiting=(await f.db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT state FROM parity_evaluation_budgets%'")).rows[0].n;
   if(waiting===2)break;if(Date.now()>=until)throw Error('Concurrent root accounting did not reach its budget fence');await new Promise(done=>setTimeout(done,20));
  }
  await f.db.query('COMMIT');await Promise.all([finishing,reconciling]);
  expect((await f.db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[f.binding.budgetId])).rows[0].reserved_micro_usd).toBe('100');
  expect((await f.db.query('SELECT actual_micro_usd FROM parity_evaluation_operations WHERE id=$1',[a.operation.id])).rows[0].actual_micro_usd).toBe('100');
  expect((await f.db.query('SELECT count(*)::int AS n FROM operations_hosted_root_generation_receipts WHERE operation_id=$1',[a.operation.id])).rows[0].n).toBe(1);
  expect(await a.run()).toMatchObject({alreadyRecorded:true,releasedExcessMicroUsd:0});
 }finally{await f.db.query('ROLLBACK');await Promise.allSettled([finishing,reconciling]);await owner.end();}
}),210000);
