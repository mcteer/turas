import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveExpansionLivePricing,expansionStepReservation} from '../../scripts/expansion-live-budget';
const model='spacexai/grok-4.7';
function catalog(extra:Record<string,unknown>={}){return {data:[{id:model,context_window:500000,max_tokens:500000,supported_parameters:['max_tokens'],pricing:{input:'0.000002',output:'0.000006',service_tiers:{priority:{input:'0.000004',output:'0.000012',long_context:{threshold:200001,input:'0.000008',output:'0.000024'}}}},...extra}]};}
function evidence(entry=catalog()){
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.endsWith('/v1/models')?JSON.stringify(entry):'hard cap on generated tokens. Reasoning tokens count toward this limit. 500,000')));
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('expansion authoritative published pricing',()=>{
 it('retains higher priority and long-context rates instead of SDK base-only pricing',async()=>{evidence();const price=await resolveExpansionLivePricing(model);expect(expansionStepReservation(price)).toBe(16);expect(fetch).toHaveBeenCalledTimes(2);
  const us={"input":"0.0000022","input_tiers":[{"cost":"0.0000022","min":0,"max":200001},{"cost":"0.0000044","min":200001}],"output":"0.0000066","output_tiers":[{"cost":"0.0000066","min":0,"max":200001},{"cost":"0.0000132","min":200001}],"input_cache_read":"0.00000055","input_cache_read_tiers":[{"cost":"0.00000055","min":0,"max":200001},{"cost":"0.0000011","min":200001}]};
  evidence(catalog({pricing:{input:'0.000002',output:'0.000006',regional:{us}}}));
  expect(await resolveExpansionLivePricing(model)).toEqual({inputUsdPerToken:0.0000044,outputUsdPerToken:0.0000132});
  evidence(catalog({pricing:{input:'0.000002',output:'0.000006',regional:{us:{input:'0.0000044'}}}}));
  expect(await resolveExpansionLivePricing(model)).toEqual({inputUsdPerToken:0.0000044,outputUsdPerToken:0.000006});
  evidence(catalog({pricing:{input:'0.000002',output:'0.000006',regional:{us,eu:{input:'0.000003',output:'0.000009',service_tiers:{priority:{input:'0.000005',long_context:{threshold:200001,input:'0.000010',output:'0.000030'}}}}}}}));
  expect(expansionStepReservation(await resolveExpansionLivePricing(model))).toBe(20);
  for(const regional of [{us:{input_cache_read:'0.000040'}},{us:{input_cache_read_tiers:[{cost:'0.000040',min:0}]}},{us:{service_tiers:{priority:{input_cache_read:'0.000040'}}}},{us:{service_tiers:{priority:{long_context:{threshold:200001,input_cache_read:'0.000040'}}}}}]){
   evidence(catalog({pricing:{input:'0.000002',output:'0.000006',regional}}));expect((await resolveExpansionLivePricing(model)).inputUsdPerToken).toBe(0.000040);
  }
  for(const regional of [{us:{input_cache_read:'invalid'}},{us:{input_cache_read_tiers:[{cost:'invalid',min:0}]}},{us:{input_cache_read_tiers:'invalid'}},{us:{service_tiers:{priority:{input_cache_read:'invalid'}}}},{us:{service_tiers:{priority:{long_context:{threshold:-1,input:'0.000010'}}}}},{us:{service_tiers:{priority:{long_context:{threshold:1.5,input:'0.000010'}}}}},null,[],{us:null},{us:{unaccounted_fee:'1'}},{us:{input:'unknown'}},{unknown:{input:'0.000004'}},{us:{input_tiers:[{cost:'0.000004',min:2,max:1}]}},{us:{service_tiers:{priority:{unaccounted_fee:'1'}}}}]){
   evidence(catalog({pricing:{input:'0.000002',output:'0.000006',regional}}));await expect(resolveExpansionLivePricing(model)).rejects.toThrow();
  }
});
 it('does not use a local learning fixture contract for live expansion admission',async()=>{vi.stubEnv('TURAS_014_PRICE_CONTRACT','{}');evidence();expect(expansionStepReservation(await resolveExpansionLivePricing(model))).toBe(16);});
 it.each([{context_window:500001},{max_tokens:500001},{supported_parameters:[]},{pricing:{input:'0.000002',output:'0.000006',unaccounted_fee:'1'}}])('rejects unbounded or unaccounted provider exposure %j',async change=>{evidence(catalog(change));await expect(resolveExpansionLivePricing(model)).rejects.toThrow();});
 it('rejects a different configured model',async()=>{evidence();await expect(resolveExpansionLivePricing('changed-model')).rejects.toThrow();});
 it('rejects oversized public evidence before admission',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{headers:{'content-length':'9000000'}})));await expect(resolveExpansionLivePricing(model)).rejects.toThrow();});
});
