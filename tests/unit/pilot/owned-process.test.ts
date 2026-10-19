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
