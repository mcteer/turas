import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({url:'postgres://synthetic/first',pools:[] as {options:{connectionString:string};endCalls:number;reject:boolean}[]}));
vi.mock('../../../lib/server/config',()=>({getServerConfig:()=>({DATABASE_URL:state.url})}));
vi.mock('pg',()=>({Pool:class {
 endCalls=0;reject=false;
 constructor(readonly options:{connectionString:string}){state.pools.push(this);}
 on(){return this;}
 async end(){this.endCalls++;if(this.reject)throw Error('synthetic pool close failure');}
}}));
import {finishPilotEnvironment} from '../../../scripts/pilot-environment-cleanup';
import {closeRuntimePool,getRuntimePool,getOperationalFencePool} from '../../../lib/server/db/client';
beforeEach(async()=>{await closeRuntimePool();state.pools=[];state.url='postgres://synthetic/first';});
function callbacks(){
 const order:string[]=[];
 const step=(name:string)=>async()=>{order.push(name);};
 return {order,input:{retire:[step('retire')],closePools:step('pools'),proveUnused:step('proof'),saveLogs:[step('logs')],restoreParent:step('restore'),removeOwned:step('remove'),verifyProtected:step('protected')}};
}
it('closes pools and restores the parent after missing absence proof without deleting owned resources',async()=>{
 const {order,input}=callbacks(),failure=Error('absence unverified');
 input.proveUnused=async()=>{order.push('proof');throw failure;};
 await expect(finishPilotEnvironment(input)).rejects.toBe(failure);
 expect(order).toEqual(['retire','pools','proof','logs','restore','protected']);
});
it('retains domain retirement pool and log errors while still restoring the parent',async()=>{
 const {order,input}=callbacks(),domain=Error('domain failure'),retirement=Error('retirement failure'),pool=Error('pool failure'),log=Error('log failure');
 input.retire=[async()=>{order.push('retire');throw retirement;},async()=>{order.push('second-retire');}];
 input.closePools=async()=>{order.push('pools');throw pool;};
 input.saveLogs=[async()=>{order.push('logs');throw log;}];
 const error=await finishPilotEnvironment({...input,runFailure:{error:domain}}).catch(error=>error);
 expect(error).toBeInstanceOf(AggregateError);expect(error.errors).toEqual([domain,retirement,pool,log]);
 expect(order).toEqual(['retire','second-retire','pools','logs','restore','protected']);
});
it('removes verified owned resources only after pools close and the parent is restored',async()=>{
 const {order,input}=callbacks();await finishPilotEnvironment(input);
 expect(order).toEqual(['retire','pools','proof','logs','restore','remove','protected']);
});
it('resets both cached pools and attempts both closes when the first close rejects',async()=>{
 const oldRuntime=getRuntimePool(),oldFence=getOperationalFencePool();
 state.pools[1].reject=true;await expect(closeRuntimePool()).rejects.toThrow('synthetic pool close failure');
 expect(state.pools.map(pool=>pool.endCalls)).toEqual([1,1]);
 state.url='postgres://synthetic/next';
 expect(getRuntimePool()).not.toBe(oldRuntime);expect(getOperationalFencePool()).not.toBe(oldFence);
 expect(state.pools.slice(2).map(pool=>pool.options.connectionString)).toEqual([state.url,state.url]);
 await closeRuntimePool();
});
