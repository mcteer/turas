import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveExpansionLivePricing,expansionStepReservation} from '../../scripts/expansion-live-budget';
const model='spacexai/grok-4.7';
function catalog(extra:Record<string,unknown>={}){return {data:[{id:model,context_window:500000,max_tokens:500000,supported_parameters:['max_tokens'],pricing:{input:'0.000002',output:'0.000006',service_tiers:{priority:{input:'0.000004',output:'0.000012',long_context:{threshold:200001,input:'0.000008',output:'0.000024'}}}},...extra}]};}
function evidence(entry=catalog()){
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.endsWith('/v1/models')?JSON.stringify(entry):'hard cap on generated tokens. Reasoning tokens count toward this limit. 500,000')));
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('expansion authoritative published pricing',()=>{
 it('retains higher priority and long-context rates instead of SDK base-only pricing',async()=>{evidence();const price=await resolveExpansionLivePricing(model);expect(expansionStepReservation(price)).toBe(16);expect(fetch).toHaveBeenCalledTimes(2);});
 it('does not use a local learning fixture contract for live expansion admission',async()=>{vi.stubEnv('TURAS_014_PRICE_CONTRACT','{}');evidence();expect(expansionStepReservation(await resolveExpansionLivePricing(model))).toBe(16);});
 it.each([{context_window:500001},{max_tokens:500001},{supported_parameters:[]},{pricing:{input:'0.000002',output:'0.000006',unaccounted_fee:'1'}}])('rejects unbounded or unaccounted provider exposure %j',async change=>{evidence(catalog(change));await expect(resolveExpansionLivePricing(model)).rejects.toThrow();});
 it('rejects a different configured model',async()=>{evidence();await expect(resolveExpansionLivePricing('changed-model')).rejects.toThrow();});
 it('rejects oversized public evidence before admission',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{headers:{'content-length':'9000000'}})));await expect(resolveExpansionLivePricing(model)).rejects.toThrow();});
});
