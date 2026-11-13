import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ownedEveSandboxes} from '../../scripts/owned-eve-sandboxes';
import {finishPilotEnvironment} from '../../scripts/pilot-environment-cleanup';

vi.mock('node:child_process',()=>({spawnSync:vi.fn()}));
const docker=vi.mocked(spawnSync),roots:string[]=[];
let containers:Map<string,{runId:string;sandbox:boolean}>,ignoreRemoval=false,failedOperation='';
beforeEach(()=>{
 containers=new Map();ignoreRemoval=false;failedOperation='';docker.mockReset();
 docker.mockImplementation((_command,args)=>{
  const values=args as string[];
  let stdout='';
  if(values[0]===failedOperation)return {status:1,stdout:'',stderr:'private diagnostic'} as ReturnType<typeof spawnSync>;
  if(values[0]==='ps'){
   const run=values.find(value=>value.startsWith('label=eve.sandbox.tag.devRunId='))?.split('=').slice(2).join('=');
   if(!run||!values.includes('label=eve.sandbox=1'))throw Error('Unscoped Docker query');
   stdout=[...containers].filter(([,value])=>value.runId===run&&value.sandbox).map(([id])=>id).join('\n');
  }else if(values[0]==='rm'){
   if(values[1]!=='--force'||values.some(value=>value==='--volumes'))throw Error('Unexpected destructive command');
   if(!ignoreRemoval)for(const id of values.slice(2))containers.delete(id);
  }else throw Error('Unexpected Docker operation');
  return {status:0,stdout,stderr:''} as ReturnType<typeof spawnSync>;
 });
});
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'turas-sandbox-test-'));roots.push(root);
 const app=join(root,'app'),eve=join(app,'.eve');mkdirSync(eve,{recursive:true});
 const cleanup=ownedEveSandboxes(app,{NODE_ENV:'test'});
 const intent=(runId=randomUUID())=>{const path=join(eve,`dev-cleanup-intent.${runId}.json`);writeFileSync(path,JSON.stringify({runId,ownerPid:process.pid}));return {runId,path};};
 const container=(runId:string,sandbox=true)=>{const id=(containers.size+1).toString(16).padStart(64,'0');containers.set(id,{runId,sandbox});return id;};
 return {root,app,eve,cleanup,intent,container};
}
it('deletes only the owned sessions after Eve removes its shutdown intent',async()=>{
 const f=fixture(),run=f.intent(),owned=f.container(run.runId),sibling=f.container(randomUUID()),database=f.container(run.runId,false);
 await f.cleanup.retire(async()=>{expect(docker).not.toHaveBeenCalled();rmSync(run.path);});
 expect(containers.has(owned)).toBe(true);f.cleanup.remove();
 expect([...containers.keys()]).toEqual([sibling,database]);
 expect(JSON.parse(readFileSync(join(f.root,'eve-sandbox-runs.json'),'utf8')).runIds).toContain(run.runId);
});
it('keeps session files across restart and removes both retired generations at final disposal',async()=>{
 const f=fixture(),first=f.intent(),one=f.container(first.runId);
 const workflow=join(f.eve,'.workflow-data');mkdirSync(workflow);writeFileSync(join(workflow,'retained'),'workflow state');
 await f.cleanup.retire(async()=>rmSync(first.path));
 f.cleanup.environment();expect(()=>f.cleanup.remove()).toThrow('retirement required');
 const second=f.intent(),two=f.container(second.runId);f.cleanup.capture();rmSync(second.path);
 expect(containers.has(one)&&containers.has(two)).toBe(true);
 await f.cleanup.retire(async()=>{});f.cleanup.remove();f.cleanup.remove();
 expect(containers.size).toBe(0);expect(readFileSync(join(workflow,'retained'),'utf8')).toBe('workflow state');
});
it('tags direct local production servers and cleans up a failed setup with no dev intent',async()=>{
 const f=fixture(),env=f.cleanup.environment();f.container(env.EVE_DEVELOPMENT_SANDBOX_RUN_ID);
 await f.cleanup.retire(async()=>{});f.cleanup.remove();expect(containers.size).toBe(0);
});
it('still retires processes when an intent is malformed and retains the root and custody',async()=>{
 const f=fixture(),run=f.intent();writeFileSync(run.path,'{"runId":"wrong"}');const retire=vi.fn(async()=>{});
 await expect(f.cleanup.retire(retire)).rejects.toThrow('custody unverified');
 expect(retire).toHaveBeenCalledOnce();expect(()=>f.cleanup.remove()).toThrow('retirement required');
 expect(docker).not.toHaveBeenCalled();expect(existsSync(join(f.root,'eve-sandbox-runs.json'))).toBe(true);
});
it('refuses deletion when process retirement fails',async()=>{
 const f=fixture();f.container(f.intent().runId);
 await expect(f.cleanup.retire(async()=>{throw Error('Still running');})).rejects.toThrow('retirement');
 expect(()=>f.cleanup.remove()).toThrow('retirement required');expect(docker).not.toHaveBeenCalled();
});
it('refuses the selected development app before writing custody or calling Docker',()=>{
 expect(()=>ownedEveSandboxes(process.cwd(),{NODE_ENV:'test'})).toThrow('Disposable Eve app required');
 expect(docker).not.toHaveBeenCalled();
});
it('refuses malformed Docker IDs before issuing a removal',async()=>{
 const f=fixture();await f.cleanup.retire(async()=>{});
 docker.mockReturnValue({status:0,stdout:'--all',stderr:''} as ReturnType<typeof spawnSync>);
 expect(()=>f.cleanup.remove()).toThrow('cleanup failed');
 expect(docker.mock.calls.every(([,args])=>(args as string[])[0]==='ps')).toBe(true);
});
it('rejects linked retained state instead of using it as disposable ownership',async()=>{
 const f=fixture(),other=fixture();rmSync(f.eve,{recursive:true});symlinkSync(other.eve,f.eve);
 await expect(f.cleanup.retire(async()=>{})).rejects.toThrow('custody');expect(docker).not.toHaveBeenCalled();
});
it('reports a deletion that returns success but leaves a container behind',async()=>{
 const f=fixture();f.container(f.intent().runId);await f.cleanup.retire(async()=>{});ignoreRemoval=true;
 expect(()=>f.cleanup.remove()).toThrow('cleanup failed');expect(containers.size).toBe(1);
 expect(existsSync(join(f.root,'eve-sandbox-runs.json'))).toBe(true);
});
it.each(['ps','rm'])('fails closed on Docker %s errors without exposing diagnostic contents',async operation=>{
 const f=fixture();f.container(f.intent().runId);await f.cleanup.retire(async()=>{});failedOperation=operation;
 let failure:unknown;try{f.cleanup.remove();}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(AggregateError);
 expect((failure as AggregateError).errors.map(error=>String(error)).join(' ')).not.toContain('private diagnostic');
 expect(containers.size).toBe(1);
});
it('cleans failed checks through the environment finalizer before removing the fixture root',async()=>{
 const f=fixture(),run=f.intent();f.container(run.runId);const failure=Error('Check failed');
 await finishPilotEnvironment({runFailure:{error:failure},retire:[()=>f.cleanup.retire(async()=>rmSync(run.path))],
  closePools:async()=>{},proveUnused:async()=>{},saveLogs:[],restoreParent:async()=>{},verifyProtected:async()=>{},
  removeOwned:async()=>{f.cleanup.remove();expect(containers.size).toBe(0);rmSync(f.root,{recursive:true});}});
 expect(existsSync(f.root)).toBe(false);
});
it('propagates cleanup failure with the original check failure and retains the fixture',async()=>{
 const f=fixture(),run=f.intent();f.container(run.runId);ignoreRemoval=true;const failure=Error('Check failed');
 const error=await finishPilotEnvironment({runFailure:{error:failure},retire:[()=>f.cleanup.retire(async()=>rmSync(run.path))],
  closePools:async()=>{},proveUnused:async()=>{},saveLogs:[],restoreParent:async()=>{},verifyProtected:async()=>{},
  removeOwned:async()=>{f.cleanup.remove();rmSync(f.root,{recursive:true});}}).catch(error=>error);
 expect(error.errors[0]).toBe(failure);expect(existsSync(f.root)).toBe(true);
});
