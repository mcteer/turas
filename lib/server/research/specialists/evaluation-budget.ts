import { randomUUID } from "node:crypto";
import { gateway,wrapLanguageModel } from "ai";
import { z } from "zod";
import { withTransaction } from "../../db/client";
import { getServerConfig } from "../../config";
import { HttpFailure } from "../../../contracts/http";

const prices=z.record(z.string(),z.object({input:z.number().nonnegative(),output:z.number().nonnegative()}).strict());
type Model=Parameters<typeof wrapLanguageModel>[0]['model'];
export function parityEvaluationBudgetId() {
  const id=process.env.TURAS_PARITY_EVALUATION_BUDGET_ID;
  if(!id)return null;
  if(process.env.VERCEL_ENV!=='preview' || !z.uuid().safeParse(id).success)
    throw new Error('Parity evaluations require an explicit Preview budget');
  return id;
}
export function modelCostCeiling(inputBytes:number,outputTokens:number,inputPrice:number,outputPrice:number) {
  if(![inputBytes,outputTokens].every(value=>Number.isSafeInteger(value)&&value>=0) ||
    ![inputPrice,outputPrice].every(value=>Number.isFinite(value)&&value>=0))throw Error('Invalid evaluation charge');
  return Math.ceil((inputBytes*inputPrice+outputTokens*outputPrice)*1_000_000);
}
async function reserve(provider:string,ceiling:(pricing:z.infer<typeof prices>)=>number) {
  const budgetId=parityEvaluationBudgetId(); if(!budgetId)return null;
  return withTransaction(async db=>{
    const budget=(await db.query(`SELECT * FROM parity_evaluation_budgets
      WHERE id=$1 AND environment_id=$2 AND state='open' AND expires_at>now() FOR UPDATE`,
      [budgetId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if(!budget)throw new HttpFailure(429,'parity_budget_unavailable','Evaluation budget is unavailable');
    const amount=ceiling(prices.parse(budget.pricing));
    if(!Number.isSafeInteger(amount)||amount<0||BigInt(budget.reserved_micro_usd)+BigInt(amount)>BigInt(budget.cap_micro_usd))
      throw new HttpFailure(429,'parity_budget_exhausted','Evaluation budget prevents this provider call');
    const id=randomUUID();
    await db.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=reserved_micro_usd+$2 WHERE id=$1',[budgetId,amount]);
    await db.query(`INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd)
      VALUES($1,$2,$3,$4)`,[id,budgetId,provider,amount]);
    return {id,budgetId,amount};
  });
}
async function settle(operation:Awaited<ReturnType<typeof reserve>>,metadata:unknown) {
  if(!operation)return;
  const reported=z.object({gateway:z.object({cost:z.union([z.string(),z.number()])})}).safeParse(metadata);
  const usd=reported.success?Number(reported.data.gateway.cost):NaN;
  // An absent or interrupted provider receipt retains its entire reservation.
  // No estimated zero, released hold or automatic paid retry is introduced.
  if(!Number.isFinite(usd)||usd<0)return;
  const actual=Math.ceil(usd*1_000_000);
  await withTransaction(async db=>{
    const row=(await db.query(`SELECT * FROM parity_evaluation_operations
      WHERE id=$1 AND settled_at IS NULL FOR UPDATE`,[operation.id])).rows[0];
    if(!row)return;
    await db.query('UPDATE parity_evaluation_operations SET actual_micro_usd=$2,settled_at=now() WHERE id=$1',[operation.id,actual]);
    if(actual>operation.amount)await db.query("UPDATE parity_evaluation_budgets SET state='overrun' WHERE id=$1",[operation.budgetId]);
    else await db.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=reserved_micro_usd-$2 WHERE id=$1',[operation.budgetId,operation.amount-actual]);
  });
}
/** Evaluation-only ceiling inside both provider paths. The root and specialists
 * keep their selected models; every process shares the same durable dollar cap. */
export function parityBudgetModel(model:Model,modelId:string):Model {
  if(!parityEvaluationBudgetId())return model;
  let called=false;
  let operation:Awaited<ReturnType<typeof reserve>>=null;
  return wrapLanguageModel({model,middleware:{
    async transformParams({params}) {
      if(called)throw new Error('A paid evaluation call cannot be retried');called=true;
      const bytes=Buffer.byteLength(JSON.stringify({prompt:params.prompt,tools:params.tools}))
        +8192+128*params.prompt.length;
      if(bytes>120_000)throw new Error('Evaluation input exceeds its priced token ceiling');
      const maxOutputTokens=Math.min(params.maxOutputTokens??32_000,32_000);
      operation=await reserve(modelId,pricing=>{
        const price=pricing[modelId];if(!price)throw new Error('Model pricing was not authorized');
        return modelCostCeiling(bytes,maxOutputTokens,price.input,price.output)
          +(JSON.stringify(params.tools??[]).includes('exa')?7000:0);
      });
      return {...params,maxOutputTokens};
    },
    async wrapGenerate({doGenerate}) {
      const result=await doGenerate();await settle(operation,result.providerMetadata);return result;
    },
    async wrapStream({doStream}) {
      const result=await doStream();
      return {...result,stream:result.stream.pipeThrough(new TransformStream({
        async transform(part,controller) {
          if(part.type==='finish')await settle(operation,part.providerMetadata);
          controller.enqueue(part);
        },
      }))};
    },
  }});
}
export function budgetedResearchModel(modelId:string) { return parityBudgetModel(gateway(modelId),modelId); }
export function reserveParityEmbedding(inputCharacters:number) {
  return reserve('openai/text-embedding-3-small',pricing=>{
    const price=pricing['openai/text-embedding-3-small'];
    if(!price)throw new Error('Embedding pricing was not authorized');
    return modelCostCeiling(inputCharacters*4+8192,0,price.input,0);
  });
}
export const settleParityProvider=settle;
