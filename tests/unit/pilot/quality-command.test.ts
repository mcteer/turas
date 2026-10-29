import {it,expect,vi} from 'vitest';
import * as ownedProcesses from '../../../scripts/pilot-owned-process';
import {runPilotQualityCommand} from '../../../scripts/pilot-quality-command';

const environment={NODE_ENV:'test' as const};
function absent(group:number){try{process.kill(-group,0);return false;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error;}}
const descendants=`const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.on('SIGTERM',()=>{child.once('exit',()=>process.exit(0));child.kill('SIGTERM');});console.log('READY '+process.pid);setInterval(()=>{},1000);`;
it('retires the detached stage and its descendant when the environment aborts',async()=>{
 const controller=new AbortController();let group=0,output='';const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];
 await expect(runPilotQualityCommand({command:process.execPath,args:['-e',descendants],cwd:process.cwd(),environment,deadline:Date.now()+10000,signal:controller.signal,onOutput:bytes=>{output+=bytes.toString();const ready=/READY (\d+)/.exec(output);if(ready){group=Number(ready[1]);controller.abort(Error('Synthetic fixture interruption'));}}})).rejects.toThrow('Owned quality command interrupted');
 expect(group).toBeGreaterThan(0);expect(absent(group)).toBe(true);expect([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')]).toEqual(before);
},15000);
it('handles interruption during spawn registration and removes its listeners',async()=>{
 const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];let accessed=false;
 const input={command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:process.cwd(),deadline:Date.now()+10000,get environment(){accessed=true;process.emit('SIGTERM');return environment;}};
 await expect(runPilotQualityCommand(input)).rejects.toThrow('Owned quality command interrupted');expect(accessed).toBe(true);expect([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')]).toEqual(before);
},15000);
it('keeps the original absolute command deadline and refuses pre-aborted dispatch',async()=>{
 const controller=new AbortController();controller.abort();await expect(runPilotQualityCommand({command:'/unavailable-synthetic-command',args:[],cwd:process.cwd(),environment,deadline:Date.now()+1000,signal:controller.signal})).rejects.toThrow('Owned quality command interrupted');
 const start=Date.now();let detachedGroup=0,output='';const script="const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log('DETACHED '+c.pid);setInterval(()=>{},1000);";
 const result=await runPilotQualityCommand({command:process.execPath,args:['-e',script],cwd:process.cwd(),environment,deadline:start+300,onOutput:bytes=>{output+=bytes.toString();const ready=/DETACHED (\d+)/.exec(output);if(ready)detachedGroup=Number(ready[1]);}});expect(result.deadlineExpired).toBe(true);expect(result.signal).toBe('SIGKILL');expect(detachedGroup).toBeGreaterThan(0);expect(absent(detachedGroup)).toBe(true);expect(Date.now()-start).toBeLessThan(12000);
},15000);
it('cleans up successful and failed spawns without retaining signal listeners',async()=>{
 const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];const input={command:process.execPath,args:['-e','process.stdout.write("synthetic output")'],cwd:process.cwd(),environment,deadline:Date.now()+5000};let output='';expect(await runPilotQualityCommand({...input,onOutput:bytes=>{output+=bytes.toString();}})).toMatchObject({code:0,signal:null,deadlineExpired:false});expect(output).toBe('synthetic output');await expect(runPilotQualityCommand({...input,command:'/unavailable-synthetic-command'})).rejects.toThrow();
 const originalRetire=ownedProcesses.retireOwnedProcess;let interrupted=false;const spy=vi.spyOn(ownedProcesses,'retireOwnedProcess').mockImplementation(async resource=>{await originalRetire(resource);if(!interrupted){interrupted=true;process.emit('SIGTERM');}});
 try{await expect(runPilotQualityCommand({...input,deadline:Date.now()+5000})).rejects.toThrow('Owned quality command interrupted');expect(interrupted).toBe(true);}finally{spy.mockRestore();}
 expect([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')]).toEqual(before);
},15000);

it('captures a normally exiting stage before retiring its detached descendant',async()=>{
 let group=0,output='';const script="const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});c.unref();console.log('ORPHAN '+c.pid);process.exit(0);";
 const result=await runPilotQualityCommand({command:process.execPath,args:['-e',script],cwd:process.cwd(),environment,deadline:Date.now()+10000,onOutput:bytes=>{output+=bytes.toString();const ready=/ORPHAN (\d+)/.exec(output);if(ready)group=Number(ready[1]);}});
 expect(result).toMatchObject({code:0,deadlineExpired:false});expect(group).toBeGreaterThan(0);expect(absent(group)).toBe(true);
},15000);
