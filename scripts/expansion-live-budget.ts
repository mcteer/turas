import {resolvePublishedLearningPrice} from '../lib/server/learning/pricing';
import {z} from 'zod';
export const expansionLiveBudgetSchema=z.number().finite().positive().max(1000);
const decimal=z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).refine(value=>Number.isFinite(value)&&value>0);
/** Catalog rates are refreshed per run. Use the most expensive published rate
 * across input/output tiers; discount/cache savings are never assumed. */
export function expansionLivePricing(raw:unknown){const object=z.record(z.string(),z.unknown()).parse(raw);const collect=(value:unknown,field:'input'|'output'):number[]=>{if(!value||typeof value!=='object'||Array.isArray(value))return [];const item=value as Record<string,unknown>,values:number[]=[];if(item[field]!==undefined)values.push(decimal.parse(item[field]));if(item[`${field}_tiers`]!==undefined)for(const tier of z.array(z.object({cost:decimal}).passthrough()).parse(item[`${field}_tiers`]))values.push(tier.cost);for(const [key,nested] of Object.entries(item))if(key!==field&&key!==`${field}_tiers`)values.push(...collect(nested,field));if(field==='input'&&item.cacheCreationInputTokens!==undefined)values.push(decimal.parse(item.cacheCreationInputTokens));return values;};const input=collect(object,'input'),output=collect(object,'output');if(!input.length||!output.length)throw Error('Current configured-model pricing unavailable');return {inputUsdPerToken:Math.max(...input),outputUsdPerToken:Math.max(...output)};}
/** Reserve Sonnet 5.5's full published 1M input and 128k output ceiling;
 * post-generation rejection cannot undo provider charges. */
export function expansionStepReservation(price:ReturnType<typeof expansionLivePricing>){const amount=1000000*price.inputUsdPerToken+128000*price.outputUsdPerToken;if(!Number.isFinite(amount)||amount<=0)throw Error('Live reservation unavailable');return Math.ceil(amount*1000000)/1000000;}
export function admitExpansionLiveCase(budgetUsd:number,costs:readonly (number|null)[],reservationUsd:number){expansionLiveBudgetSchema.parse(budgetUsd);if(costs.some(cost=>cost===null||!Number.isFinite(cost)||cost!<0)||!Number.isFinite(reservationUsd)||reservationUsd<=0)throw Error('Unknown cost blocks further live admission');const spent=costs.reduce<number>((sum,cost)=>sum+cost!,0);if(spent+reservationUsd>budgetUsd)throw Error('Operator budget prevents further live admission');return {spentUsd:spent,remainingUsd:budgetUsd-spent};}

/** Case admission only permits its first step. The observer reserves anew before
 * every individual provider call, after settling prior actual charges. */
export const expansionCaseReservation = expansionStepReservation;

/** Preserve raw catalog tiers and verify reasoning-inclusive provider limits. */
export async function resolveExpansionLivePricing(model:string){
 const price=await resolvePublishedLearningPrice();
 if(price.modelId!==model||price.providerInputLimit>1000000||price.providerOutputLimit>128000)throw Error("Configured provider exceeds expansion reservation limits");
 return {inputUsdPerToken:Number(price.inputMicroUsdPerMillion)/1e12,outputUsdPerToken:Number(price.outputMicroUsdPerMillion)/1e12};
}
