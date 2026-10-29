import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({controller:new AbortController(),cleanup:0,release:()=>{},delayed:false}));
vi.mock('../../../scripts/pilot-environment',()=>({withPilotEnvironment:async(run:(environment:{signal:AbortSignal})=>Promise<void>)=>{
 try{
  if(state.delayed)await new Promise<void>(resolve=>{state.release=resolve;});
  await run({signal:state.controller.signal});
 }finally{state.cleanup++;}
},requireOwnedPilotDatabase:vi.fn()}));
import {openOwnedPilotSuite} from '../../fixtures/pilot/environment';
beforeEach(()=>{state.controller=new AbortController();state.cleanup=0;state.delayed=false;state.release=()=>{};});
it('closes a normally published owned suite exactly once',async()=>{
 const owned=await openOwnedPilotSuite();
 expect(state.cleanup).toBe(0);
 await Promise.all([owned.close(),owned.close()]);
 expect(state.cleanup).toBe(1);
});
it('drains an interrupted published suite before close rejects',async()=>{
 const owned=await openOwnedPilotSuite();
 const reason=Error('owned lifecycle expired');
 state.controller.abort(reason);
 await expect(owned.close()).rejects.toBe(reason);
 expect(state.cleanup).toBe(1);
});
it('cleans an interrupted initialization without publishing an owned handle',async()=>{
 state.delayed=true;
 const opening=openOwnedPilotSuite();
 const reason=Error('initialization expired');
 const rejected=expect(opening).rejects.toBe(reason);
 state.controller.abort(reason);
 state.release();
 await rejected;
 expect(state.cleanup).toBe(1);
});
