import {it,expect} from 'vitest';
import {withHostedRootBudgetFixture as fixture} from '../../fixtures/pilot/hosted-root';
import {randomUUID} from 'node:crypto';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {reserveHostedRoot,settleHostedRoot,wrapHostedRootBudget} from '../../../lib/server/conversations/hosted-root-budget';


it('binds actual synthetic attempts and retains unknown concurrent reservations without changing unrelated dispatch',async()=>fixture(async({db,principal,native,binding,attempt})=>{
 for(const changed of [{...binding,target:'production'},{...binding,sourceCommit:'f'.repeat(40)},{...binding,workspaceId:randomUUID()},{...binding,ownerPrincipalId:randomUUID()},{...binding,capMicroUsd:9000},{...binding,recordedAt:new Date(Date.now()+1000).toISOString()}]){
  process.env.TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON=JSON.stringify(changed);
  await expect(reserveHostedRoot(principal,native,'synthetic-turn',100,700)).rejects.toThrow();
 }
 process.env.TURAS_PILOT_HOSTED_ROOT_BUDGET_JSON=JSON.stringify(binding);
 process.env.VERCEL_DEPLOYMENT_ID='dpl_other';await expect(reserveHostedRoot(principal,native,'synthetic-turn',100,700)).rejects.toThrow();process.env.VERCEL_DEPLOYMENT_ID='dpl_synthetic';
 await expect(reserveHostedRoot(principal,native,'synthetic-turn',100,11000)).rejects.toThrow();
 await expect(reserveHostedRoot(principal,'other-native','synthetic-turn',100,700)).rejects.toThrow();
 expect(await reserveHostedRoot({...principal,attributes:{turasAttemptId:randomUUID()}},native,'synthetic-turn',100,700)).toBeNull();
 const results=await Promise.allSettled([reserveHostedRoot(principal,native,'synthetic-turn',100,700),reserveHostedRoot(principal,native,'synthetic-turn',100,700)]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect((await db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[binding.budgetId])).rows[0].reserved_micro_usd).toBe('700');
 const operation=(await db.query('SELECT provider,actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE budget_id=$1',[binding.budgetId])).rows[0];
 expect(JSON.parse(operation.provider)).toMatchObject({attemptId:attempt,nativeSessionId:native,turnId:'synthetic-turn'});
 expect(operation.actual_micro_usd).toBeNull();expect(operation.settled_at).toBeNull();
 await expect(reserveHostedRoot(principal,native,'new-turn',100,700)).rejects.toThrow();
}),210000);

it('settles successful Production-bound root generate and stream calls with immutable original provider identities',async()=>fixture(async({db,principal,native,binding})=>{
 let calls=0;const generated='synthetic-generated-'+randomUUID(),streamed='synthetic-streamed-'+randomUUID(),generatedGateway='gen_'+randomUUID(),streamedGateway='gen_'+randomUUID();
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},
  async doGenerate(){calls++;return {content:[{type:'text',text:'Synthetic root response'}],response:{id:generated},providerMetadata:{gateway:{cost:'0.0001',generationId:generatedGateway}}};},
  async doStream(){calls++;return {stream:new ReadableStream({start(controller){controller.enqueue({type:'response-metadata',id:streamed});controller.enqueue({type:'text-start',id:'synthetic-text',providerMetadata:{gateway:{generationId:streamedGateway}}});controller.enqueue({type:'finish',providerMetadata:{gateway:{cost:'0.0001'}}});controller.close();}})};}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 expect((await wrapHostedRootBudget(model,principal,native,'original-turn').doGenerate({prompt:[],maxOutputTokens:700})).content).toHaveLength(1);
 const stream=await wrapHostedRootBudget(model,principal,native,'resumed-turn').doStream({prompt:[],maxOutputTokens:700}),reader=stream.stream.getReader();let frames=0;
 for(;;){const next=await reader.read();if(next.done)break;frames++;}expect(frames).toBe(3);expect(calls).toBe(2);
 const identities=(await db.query('SELECT i.operation_id,i.provider_key FROM operations_hosted_root_provider_identities i JOIN parity_evaluation_operations o ON o.id=i.operation_id WHERE o.budget_id=$1 ORDER BY o.created_at',[binding.budgetId])).rows;
 expect(identities.map(row=>row.provider_key).sort()).toEqual([generated,generatedGateway,streamed,streamedGateway].sort());
 expect((await db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[binding.budgetId])).rows[0].reserved_micro_usd).toBe('200');
 const snapshot=await captureRecoveryDenialSnapshot(db,binding.environmentMarker,AbortSignal.timeout(30000));
 expect(snapshot.tables.find(table=>table.name==='operations_hosted_root_admissions')?.rows).toHaveLength(1);
 const captured=snapshot.tables.find(table=>table.name==='operations_hosted_root_provider_identities');
 expect(captured?.rows.map(row=>row.status.provider_key).sort()).toEqual([generated,generatedGateway,streamed,streamedGateway].sort());
 expect(captured?.replayKeyColumns).toContainEqual(['identity_kind','provider_key']);
 await expect(db.query('UPDATE operations_hosted_root_admissions SET deployment_id=$2 WHERE budget_id=$1',[binding.budgetId,'dpl_other'])).rejects.toThrow('immutable');
 await expect(db.query('UPDATE operations_hosted_root_provider_identities SET provider_key=$2 WHERE operation_id=$1',[identities[0].operation_id,'synthetic-other'])).rejects.toThrow('immutable');
 await db.query('SET ROLE turas_runtime');
 await expect(db.query('INSERT INTO operations_hosted_root_admissions(budget_id,deployment_id,binding_digest) VALUES($1,$2,$3)',[randomUUID(),'dpl_other','a'.repeat(64)])).rejects.toMatchObject({code:'42501'});
 await db.query('RESET ROLE');
 const replacement=randomUUID();
 await db.query('INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,10000,$5,$6)',[replacement,binding.environmentMarker,binding.workspaceId,binding.ownerPrincipalId,'{}',binding.expiresAt]);
 await expect(db.query('INSERT INTO operations_hosted_root_admissions(budget_id,deployment_id,binding_digest) VALUES($1,$2,$3)',[replacement,'dpl_replacement','a'.repeat(64)])).rejects.toThrow('Original hosted root budget cannot be replaced');
},'production'),210000);

it('withholds adversarial generated tool calls and preserves their complete paid reservation',async()=>fixture(async({db,principal,native,binding})=>{
 let calls=0;
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},
  async doGenerate(params:{tools:unknown[];toolChoice:unknown}){calls++;expect(params.tools).toEqual([]);expect(params.toolChoice).toEqual({type:'none'});return {content:[{type:'tool-call',toolCallId:'synthetic-tool',toolName:'research',input:'{}',providerExecuted:true}],providerMetadata:{gateway:{cost:'0.0001',generationId:'gen_synthetic_tool_rejection'}}};},
  async doStream(){throw Error('Unused');}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 const wrapped=wrapHostedRootBudget(model,principal,native,'synthetic-turn');
 await expect(wrapped.doGenerate({prompt:[],maxOutputTokens:700})).rejects.toMatchObject({code:'hosted_root_tool_denied'});
 expect(calls).toBe(1);
 await expect(wrapped.doGenerate({prompt:[],maxOutputTokens:700})).rejects.toThrow();expect(calls).toBe(1);
 expect((await db.query('SELECT ceiling_micro_usd,actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE budget_id=$1',[binding.budgetId])).rows[0]).toEqual({ceiling_micro_usd:'700',actual_micro_usd:null,settled_at:null});
 expect((await db.query("SELECT provider_key FROM operations_hosted_root_provider_identities WHERE identity_kind='gateway_generation'")).rows.map(row=>row.provider_key)).toContain('gen_synthetic_tool_rejection');
}),210000);

it('charges resumed root dispatches and rejects every tool stream before forwarding an auxiliary effect',async()=>fixture(async({db,principal,native,binding})=>{
 const first=await reserveHostedRoot(principal,native,'original-turn',100,700);expect(first).not.toBeNull();
 await settleHostedRoot(first,{gateway:{cost:'0.0001'}});
 let calls=0,forwarded=0;
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},async doGenerate(){throw Error('Unused');},
  async doStream(params:{tools:unknown[];toolChoice:unknown}){calls++;expect(params.tools).toEqual([]);expect(params.toolChoice).toEqual({type:'none'});return {stream:new ReadableStream({start(controller){controller.enqueue({type:'tool-input-start',id:'synthetic-tool',toolName:'research',providerExecuted:true,providerMetadata:{gateway:{generationId:'gen_synthetic_stream_tool_rejection'}}});controller.close();}})};}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 const result=await wrapHostedRootBudget(model,principal,native,'resumed-turn').doStream({prompt:[],maxOutputTokens:700});
 const reader=result.stream.getReader();await expect(reader.read().then(value=>{if(!value.done)forwarded++;})).rejects.toMatchObject({code:'hosted_root_tool_denied'});
 expect(calls).toBe(1);expect(forwarded).toBe(0);
 expect((await db.query("SELECT provider_key FROM operations_hosted_root_provider_identities WHERE identity_kind='gateway_generation'")).rows.map(row=>row.provider_key)).toContain('gen_synthetic_stream_tool_rejection');
 const operations=(await db.query('SELECT provider,ceiling_micro_usd,actual_micro_usd FROM parity_evaluation_operations WHERE budget_id=$1 ORDER BY created_at',[binding.budgetId])).rows;
 expect(operations).toHaveLength(2);expect(JSON.parse(operations[0].provider).turnId).toBe('original-turn');expect(JSON.parse(operations[1].provider).turnId).toBe('resumed-turn');
 expect(operations.map(row=>row.actual_micro_usd)).toEqual(['100',null]);
 expect((await db.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[binding.budgetId])).rows[0].reserved_micro_usd).toBe('800');
 await expect(reserveHostedRoot(principal,native,'stopped-turn',100,700)).rejects.toThrow();
}),210000);

it('retains a full unknown reservation when only an upstream response identity is available',async()=>fixture(async({db,principal,native,binding})=>{
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},
  async doGenerate(){return {content:[{type:'text',text:'Synthetic response without Gateway identity'}],response:{id:'synthetic-upstream-only'},providerMetadata:{gateway:{cost:'0.0001'}}};},async doStream(){throw Error('Unused');}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 await wrapHostedRootBudget(model,principal,native,'synthetic-turn').doGenerate({prompt:[],maxOutputTokens:700});
 expect((await db.query('SELECT identity_kind,provider_key FROM operations_hosted_root_provider_identities')).rows).toContainEqual({identity_kind:'provider_response',provider_key:'synthetic-upstream-only'});
 expect((await db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE budget_id=$1',[binding.budgetId])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
 await expect(reserveHostedRoot(principal,native,'next-turn',100,700)).rejects.toThrow();
}),210000);

it('captures the Gateway generation from an actual SDK failure before retaining its interrupted hold',async()=>fixture(async({db,principal,native,binding})=>{
 const model={specificationVersion:'v4',provider:'synthetic-no-provider',modelId:'spacexai/grok-4.7',supportedUrls:{},async doGenerate(){throw Error('Unused');},
  async doStream(){throw Object.assign(Error('Synthetic interrupted SDK response'),{generationId:'gen_synthetic_interrupted_sdk'});}} as unknown as Parameters<typeof wrapHostedRootBudget>[0];
 await expect(wrapHostedRootBudget(model,principal,native,'synthetic-turn').doStream({prompt:[],maxOutputTokens:700})).rejects.toThrow('Synthetic interrupted SDK response');
 expect((await db.query("SELECT provider_key FROM operations_hosted_root_provider_identities WHERE identity_kind='gateway_generation'")).rows.map(row=>row.provider_key)).toContain('gen_synthetic_interrupted_sdk');
 expect((await db.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE budget_id=$1',[binding.budgetId])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
}),210000);
