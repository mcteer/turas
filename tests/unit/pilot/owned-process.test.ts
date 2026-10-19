import {it,expect} from 'vitest';
import type {ChildProcess} from 'node:child_process';
import {withOwnedProcess,retireOwnedProcess,type OwnedProcessRetirement} from '../../../scripts/pilot-owned-process';

const script=(exit:boolean)=>`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});console.log(c.pid);${exit?'setTimeout(()=>process.exit(0),20)':'setInterval(()=>{},1000)'}`;
function ready(child:ChildProcess){return new Promise<void>((done,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Owned descendant did not start')),3000);child.stdout!.on('data',bytes=>{text+=bytes;if(/^\d+\n/.test(text)){clearTimeout(timer);done();}});});}
function gone(pid:number){try{process.kill(-pid,0);return false;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error;}}
function input(exit=false){return {command:process.execPath,args:['-e',script(exit)],cwd:process.cwd(),environment:{NODE_ENV:'test' as const},signal:AbortSignal.timeout(10000),deadline:Date.now()+10000};}
it('retires the actual owned process group and its live descendant after success',async()=>{
 let pid=0;await withOwnedProcess(input(),async child=>{pid=child.pid!;await ready(child);expect(gone(pid)).toBe(false);});expect(gone(pid)).toBe(true);
});
it('retires descendants after their direct parent has already exited',async()=>{
 let pid=0;await withOwnedProcess(input(true),async child=>{pid=child.pid!;await ready(child);if(child.exitCode===null)await new Promise(done=>child.once('exit',done));expect(gone(pid)).toBe(false);});expect(gone(pid)).toBe(true);
});
it('cancels a pending callback and verifies complete group retirement',async()=>{
 let pid=0,retirement:OwnedProcessRetirement|undefined;const controller=new AbortController();await expect(withOwnedProcess({...input(),signal:controller.signal,onProcess:resource=>{retirement=resource;expect(()=>retireOwnedProcess(JSON.parse(JSON.stringify(resource)))).toThrow('Actual owned');}},async child=>{pid=child.pid!;await ready(child);controller.abort(Error('Controlled owned cancellation'));await new Promise(()=>{});})).rejects.toThrow('Controlled owned cancellation');expect(gone(pid)).toBe(true);await retireOwnedProcess(retirement!);
});
it('waits through transient denied probes before verifying real group closure',async()=>{
 const originalKill=process.kill;let pid=0,remaining=3;
 try{
  await withOwnedProcess(input(),async child=>{
   pid=child.pid!;await ready(child);
   process.kill=((group,signal)=>{if(group===-pid&&signal===0&&remaining>0){remaining--;throw Object.assign(Error('Controlled transient group probe denial'),{code:'EPERM'});}return originalKill(group,signal);}) as typeof process.kill;
  });
  expect(remaining).toBe(0);
 }finally{process.kill=originalKill;}
 expect(gone(pid)).toBe(true);
});
it('refuses retirement when owned group probes remain denied',async()=>{
 const originalKill=process.kill;let pid=0,probes=0;
 try{
  await expect(withOwnedProcess({...input(),signal:AbortSignal.timeout(15000),deadline:Date.now()+15000},async child=>{
   pid=child.pid!;await ready(child);
   process.kill=((group,signal)=>{if(group===-pid&&signal===0){probes++;throw Object.assign(Error('Controlled persistent group probe denial'),{code:'EPERM'});}return originalKill(group,signal);}) as typeof process.kill;
  })).rejects.toThrow('Owned process group retirement unverified');
  expect(probes).toBeGreaterThan(1);
 }finally{process.kill=originalKill;}
 expect(gone(pid)).toBe(true);
},15000);
