import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll,expect,it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { parityBudgetModel } from "../../lib/server/research/specialists/evaluation-budget";
const isolatedTestUrl=requireTestDatabaseUrl();
beforeAll(()=>{process.env.DATABASE_URL=isolatedTestUrl;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
type Model=Parameters<typeof parityBudgetModel>[0];

it("reserves a shared ceiling atomically before either fixture provider can run",async()=>{
  const owner=new Client({connectionString:isolatedTestUrl});await owner.connect();
  const previousEnvironment=process.env.VERCEL_ENV;
  try {
    const actor=(await owner.query("SELECT workspace_id,principal_id FROM memberships WHERE kind='internal' LIMIT 1")).rows[0];
    const id=randomUUID();
    await owner.query(`INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,
      cap_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,1000,$5,now()+interval '1 hour')`,
      [id,process.env.TURAS_ENVIRONMENT_ID,actor.workspace_id,actor.principal_id,
        JSON.stringify({'spacexai/grok-4.7':{input:0,output:0.000001}})]);
    process.env.VERCEL_ENV='preview';process.env.TURAS_PARITY_EVALUATION_BUDGET_ID=id;
    let calls=0;
    let entered!:()=>void,finish!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const release=new Promise<void>(resolve=>{finish=resolve;});
    const model={specificationVersion:'v4',provider:'synthetic-budget-fixture',modelId:'spacexai/grok-4.7',supportedUrls:{},
      async doGenerate(){calls++;entered();await release;return {providerMetadata:{gateway:{cost:'0.0007'}}};},
      async doStream(){throw Error('Unused fixture stream');}} as unknown as Model;
    const first=parityBudgetModel(model,'spacexai/grok-4.7').doGenerate({prompt:[],maxOutputTokens:700});
    await started;
    await expect(parityBudgetModel(model,'spacexai/grok-4.7').doGenerate({prompt:[],maxOutputTokens:700}))
      .rejects.toMatchObject({code:'parity_budget_exhausted'});
    expect(calls).toBe(1);
    finish();await first;
    const budget=(await owner.query('SELECT reserved_micro_usd FROM parity_evaluation_budgets WHERE id=$1',[id])).rows[0];
    expect(Number(budget.reserved_micro_usd)).toBe(700);
    expect((await owner.query('SELECT actual_micro_usd FROM parity_evaluation_operations WHERE budget_id=$1',[id])).rows[0].actual_micro_usd).toBe('700');
  }finally {
    delete process.env.TURAS_PARITY_EVALUATION_BUDGET_ID;
    if(previousEnvironment===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnvironment;
    await owner.end();
  }
});

it('prices a large legacy research context and denies an unaffordable prompt before provider I/O',async()=>{
 const owner=new Client({connectionString:isolatedTestUrl});await owner.connect();const previous=process.env.VERCEL_ENV;
 try{
  const actor=(await owner.query("SELECT workspace_id,principal_id FROM memberships WHERE kind='internal' LIMIT 1")).rows[0],id=randomUUID();
  await owner.query(`INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,pricing,expires_at)
   VALUES($1,$2,$3,$4,1000000,$5,now()+interval '1 hour')`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspace_id,actor.principal_id,JSON.stringify({'openai/gpt-5.6-terra':{input:0.000001,output:0.000001}})]);
  process.env.VERCEL_ENV='preview';process.env.TURAS_PARITY_EVALUATION_BUDGET_ID=id;let calls=0;
  const model={specificationVersion:'v4',provider:'synthetic-budget-fixture',modelId:'openai/gpt-5.6-terra',supportedUrls:{},async doGenerate(){calls++;return {providerMetadata:{gateway:{cost:'0.05'}}}},async doStream(){throw Error('Unused')}} as unknown as Model;
  const prompt=(length:number)=>[{role:'user' as const,content:[{type:'text' as const,text:'Public fixture evidence. '.repeat(length)}]}];
  await parityBudgetModel(model,'openai/gpt-5.6-terra').doGenerate({prompt:prompt(10000),maxOutputTokens:1});
  await expect(parityBudgetModel(model,'openai/gpt-5.6-terra').doGenerate({prompt:prompt(100000),maxOutputTokens:1})).rejects.toMatchObject({code:'parity_budget_exhausted'});
  expect(calls).toBe(1);
 }finally{delete process.env.TURAS_PARITY_EVALUATION_BUDGET_ID;if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;await owner.end();}
});

it('keeps operator budget authority and operation ceilings protected after runtime grant setup',async()=>{
 const owner=new Client({connectionString:isolatedTestUrl}),runtime=new Client({connectionString:isolatedTestUrl});await owner.connect();await runtime.connect();
 try{
  const actor=(await owner.query("SELECT workspace_id,principal_id FROM memberships WHERE kind='internal' LIMIT 1")).rows[0],id=randomUUID();
  await owner.query(`INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,pricing,expires_at)
   VALUES($1,$2,$3,$4,1000,'{}',now()+interval '1 hour')`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspace_id,actor.principal_id]);
  await runtime.query('SET ROLE turas_runtime');
  expect((await runtime.query('SELECT id FROM parity_evaluation_budgets WHERE id=$1',[id])).rowCount).toBe(1);
  for(const sql of ['UPDATE parity_evaluation_budgets SET cap_micro_usd=15000000 WHERE id=$1',"UPDATE parity_evaluation_budgets SET pricing='{}' WHERE id=$1","UPDATE parity_evaluation_budgets SET expires_at=now()+interval '1 day' WHERE id=$1",'DELETE FROM parity_evaluation_budgets WHERE id=$1'])await expect(runtime.query(sql,[id])).rejects.toMatchObject({code:'42501'});
  const operation=randomUUID();await runtime.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,'synthetic-fixture',100)",[operation,id]);
  for(const sql of ['UPDATE parity_evaluation_operations SET ceiling_micro_usd=0 WHERE id=$1','DELETE FROM parity_evaluation_operations WHERE id=$1'])await expect(runtime.query(sql,[operation])).rejects.toMatchObject({code:'42501'});
 }finally{await runtime.end();await owner.end();}
});
