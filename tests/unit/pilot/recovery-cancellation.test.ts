import {it,expect,vi} from 'vitest';
import {withRecoveryCancellation,withHostedCatalogCancellation} from '../../../lib/server/operations/recovery-cancellation';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {LockedWorkRecoveryInput} from '../../../lib/server/operations/locked-work-recovery-target';
async function measurementGroupCancellation(){
 const {withWorkRecoveryMeasurementGroup:group,withRecoveryMeasurementTransport:transport,retireRecoveryMeasurementLane:retire,publishRecoveryMeasurement:publish}=await import('../../../lib/server/operations/recovery-measurement-group');
 const fresh=(signal=new AbortController().signal):LockedWorkRecoveryInput=>({sourceFile:'/synthetic/source.json',scope:{environmentId:'synthetic',recoveryId:randomUUID(),controlRevision:1},runtimeConnection:'postgres://synthetic.invalid/test',deadline:Date.now()+5000,signal,hostedScope:{contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:'https://synthetic.invalid',environmentMarker:'synthetic',workspaceId:randomUUID(),target:'preview',sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)}});
 for(const phase of ['before-barrier','after-barrier'] as const){
  let cleanups=0,publications=0;
  await expect(group(fresh(),[0,1].map(index=>async input=>{
   await transport(input,false,async lane=>{try{
    if(index===1&&phase==='before-barrier'){await new Promise<void>(done=>setImmediate(done));throw Error('Controlled lane failure');}
    await retire(lane);if(index===1)throw Error('Controlled final check failure');
   }finally{cleanups++;}});publish(()=>{publications++;});return index;
  }))).rejects.toThrow();expect(cleanups).toBe(2);expect(publications).toBe(0);
 }
 const parent=new AbortController();let started!:()=>void;const ready=new Promise<void>(done=>{started=done;});let cleaned=0;
 const cancelled=group(fresh(parent.signal),[0,1].map(index=>async input=>transport(input,false,async lane=>{try{
  if(index===0)await retire(lane);else{started();await new Promise<void>((_,reject)=>{input.signal.addEventListener('abort',()=>reject(input.signal.reason),{once:true});});}
  return index;
 }finally{cleaned++;}})));
 await ready;parent.abort(Error('Controlled group cancellation'));await expect(cancelled).rejects.toThrow('Controlled group cancellation');expect(cleaned).toBe(2);
 let open!:()=>void,entered!:()=>void;const gate=new Promise<void>(done=>{open=done;}),inGroup=new Promise<void>(done=>{entered=done;}),input=fresh();
 const active=group(input,[0,1].map(index=>async selected=>transport(selected,false,async lane=>{
  if(index===0){entered();await expect(group(input,[async()=>0,async()=>1])).rejects.toThrow('independent recovery measurement group');await gate;}
  await retire(lane);return index;
 })));
 await inGroup;await expect(group(input,[async()=>0,async()=>1])).rejects.toThrow('independent recovery measurement group');await expect(transport(input,false,async()=>0)).rejects.toThrow('Ungrouped recovery writer');open();expect(await active).toEqual([0,1]);
 await expect(group(fresh(),[async input=>transport({...input,deadline:input.deadline-1},false,async()=>0),async input=>transport(input,false,async lane=>{await retire(lane);return 1;})])).rejects.toThrow();
 await expect(group(fresh(),[async input=>{await transport(input,false,async lane=>{await retire(lane);});return transport(input,false,async()=>0);},async input=>transport(input,false,async lane=>{await retire(lane);return 1;})])).rejects.toThrow('unused recovery measurement lane');
 await transport(fresh(),false,async()=>{await expect(group(fresh(),[async()=>0,async()=>1])).rejects.toThrow('independent recovery measurement group');});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 try{
  const stopped=new AbortController(),hung=group(fresh(stopped.signal),[async()=>new Promise<number>(()=>{}),async input=>transport(input,false,async lane=>{await retire(lane);return 1;})]);
  const rejected=expect(hung).rejects.toThrow('did not drain; writer quarantined');stopped.abort(Error('Controlled non-cooperative lane cancellation'));
  await vi.advanceTimersByTimeAsync(40001);await rejected;
  await expect(transport(fresh(),false,async()=>0)).rejects.toThrow('writer quarantined');
  await expect(group(fresh(),[async()=>0,async()=>1])).rejects.toThrow('independent recovery measurement group');
 }finally{vi.useRealTimers();}
}
async function interrupted(signal:'SIGINT'|'SIGTERM'|null,repeated=false){
 const source=`import {withRecoveryCancellation} from './lib/server/operations/recovery-cancellation.ts';
 let cleaned=false;const before=[process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')];
 try{await withRecoveryCancellation(${signal?5000:50},async signal=>{try{console.log('ready');await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}finally{await new Promise(r=>setTimeout(r,100));cleaned=true;}});}catch{console.log(JSON.stringify({cleaned,aborted:true,listenersRestored:JSON.stringify(before)===JSON.stringify([process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')])}));}`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source],{cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});let stdout='',sent=false;
 child.stdout.on('data',bytes=>{stdout+=bytes.toString();if(signal&&!sent&&stdout.includes('ready')){sent=true;child.kill(signal);if(repeated)setTimeout(()=>child.kill(signal),20);}});child.stderr.resume();
 const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);try{const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});expect(code).toBe(0);expect(JSON.parse(stdout.trim().split('\n').at(-1)!)).toEqual({cleaned:true,aborted:true,listenersRestored:true});}finally{clearTimeout(timeout);if(child.exitCode===null)child.kill('SIGKILL');}
}
it('settles recovery cleanup on an actual SIGINT',()=>interrupted('SIGINT'));
it('settles recovery cleanup on an actual SIGTERM',()=>interrupted('SIGTERM'));
it('settles recovery cleanup at the bounded deadline',async()=>{await interrupted(null);const parent=new AbortController(),before=[process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')];let cleaned=false;const pending=withRecoveryCancellation(5000,async signal=>{try{await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}finally{cleaned=true;}},parent.signal);parent.abort(Error('Parent deadline'));await expect(pending).rejects.toThrow('Parent deadline');expect(cleaned).toBe(true);let called=false;await expect(withRecoveryCancellation(5000,async()=>{called=true;},parent.signal)).rejects.toThrow('Parent deadline');expect(called).toBe(false);expect([process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')]).toEqual(before);await expect(withRecoveryCancellation(900001,async()=>true)).rejects.toThrow('Bounded operation');expect(await withHostedCatalogCancellation(7200000,async signal=>!signal.aborted)).toBe(true);await expect(withHostedCatalogCancellation(7200001,async()=>true)).rejects.toThrow('Bounded operation');await measurementGroupCancellation();});

it('keeps cleanup protected across repeated termination signals',()=>interrupted('SIGTERM',true));
