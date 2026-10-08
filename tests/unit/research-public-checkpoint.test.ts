import {describe,it,expect} from 'vitest';
import {dispatchPublicOperation,type PublicOperationStep} from '../../lib/server/research/public-checkpoint';
describe('public provider checkpoint',()=>{
 it('durably reserves once and reuses only the completed matching response',async()=>{
  const steps:Record<string,PublicOperationStep>={};const states:string[]=[];let calls=0;
  const run=(inputDigest='a')=>dispatchPublicOperation({steps,key:'model',inputDigest,save:async()=>{states.push(steps.model.state);},guard:()=>{},safeCode:()=> 'unavailable',work:async()=>{calls++;expect(states).toEqual(['dispatched']);return {known:true};}});
  expect(await run()).toEqual({known:true});expect(await run()).toEqual({known:true});expect(calls).toBe(1);
  await expect(run('b')).rejects.toThrow('input changed');expect(calls).toBe(1);expect(states).toEqual(['dispatched','complete']);
 });
 it('does not repeat failed, ambiguous or unreserved budget-denied calls',async()=>{
  let calls=0;for(const state of ['failed','dispatched'] as const){const steps={model:{state}};await expect(dispatchPublicOperation({steps,key:'model',save:async()=>{},guard:()=>{},safeCode:()=> 'unavailable',work:async()=>{calls++;}})).rejects.toThrow('no automatic paid replay');}
  const steps:Record<string,PublicOperationStep>={};await expect(dispatchPublicOperation({steps,key:'model',save:async()=>{},guard:()=>{throw Error('budget');},safeCode:()=> 'unavailable',work:async()=>{calls++;}})).rejects.toThrow('budget');expect(calls).toBe(0);expect(steps).toEqual({});
 });
 it('retains a failure after its reserved operation fails',async()=>{
  const steps:Record<string,PublicOperationStep>={};await expect(dispatchPublicOperation({steps,key:'model',inputDigest:'a',save:async()=>{},guard:()=>{},safeCode:()=> 'unavailable',work:async()=>{throw Error('provider');}})).rejects.toThrow('provider');expect(steps.model).toEqual({state:'failed',inputDigest:'a',code:'unavailable'});
 });
});
