import {it,expect,vi} from 'vitest';
import {mkdir,mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {learningNativeRunPayloads} from '../fixtures/learning/native-store';
vi.mock('node:fs/promises',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:fs/promises')>();
 return {...actual,readdir:vi.fn(actual.readdir)};
});
async function fixture(run:(root:string)=>Promise<void>){await mkdir(resolve('local-artifacts/014'),{recursive:true,mode:0o700});const owned=await mkdtemp(resolve('local-artifacts/014/owned-probe-')),root=join(owned,'app/.eve/.workflow-data');try{for(const path of ['runs','steps','events','streams/runs','streams/chunks/synthetic-stream'])await mkdir(join(root,path),{recursive:true,mode:0o700});await run(root);}finally{await rm(owned,{recursive:true,force:true});}}
it('detects opaque private payloads and nonempty streams while permitting purged metadata and EOF markers',()=>fixture(async root=>{
 const id='wrun_synthetic_probe',run=join(root,'runs',`${id}.json`),step=join(root,'steps',`${id}-step.json`),stream=join(root,'streams/chunks/synthetic-stream/chnk_synthetic.bin');
 await writeFile(run,JSON.stringify({runId:id,status:'running',input:{__type:'Uint8Array',data:'opaque encrypted fixture'}}),{mode:0o600});await writeFile(step,JSON.stringify({runId:id,input:{__type:'Uint8Array',data:'another opaque fixture'}}),{mode:0o600});await writeFile(join(root,'streams/runs',`${id}.json`),JSON.stringify({streams:['synthetic-stream']}),{mode:0o600});await writeFile(stream,Buffer.from([0,9,8,7]),{mode:0o600});
 expect((await learningNativeRunPayloads(root,[id])).payloadRecords).toBe(3);
 await writeFile(run,JSON.stringify({runId:id,status:'completed',expiredAt:'2026-10-09T00:00:00Z'}));await writeFile(step,JSON.stringify({runId:id,status:'completed'}));await writeFile(stream,Buffer.from([1]));const retired=await learningNativeRunPayloads(root,[id]);expect(retired.payloadRecords).toBe(0);expect(retired.metadataRecords).toBeGreaterThan(0);
}));
it('refuses extra prose in the documented timer exception',()=>fixture(async root=>{
 const id='wrun_synthetic_probe',timerId='wrun_synthetic_timer',flat=[[1],{deadline:2,ownerRunId:3,token:4,prose:5},['Date','2026-10-09T00:00:00.000Z'],id,'synthetic timer capability','Forbidden private context'];
 await writeFile(join(root,'runs',`${timerId}.json`),JSON.stringify({runId:timerId,workflowName:'workflow//eve//sessionTimeoutWorkflow',attributes:{$parentRunId:id},input:{__type:'Uint8Array',data:Buffer.from('devl'+JSON.stringify(flat)).toString('base64')}}),{mode:0o600});await expect(learningNativeRunPayloads(root,[id])).rejects.toThrow('unexpected private data');
}));
it('handles a directory removed after enumeration while still detecting retained payloads',()=>fixture(async root=>{
 const id='wrun_synthetic_probe';
 await mkdir(join(root,'.locks/runs/transient.pending'),{recursive:true});
 await writeFile(join(root,'runs',`${id}.json`),JSON.stringify({runId:id,input:'Retained private fixture'}));
 const actual=await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
 vi.mocked(readdir).mockImplementationOnce(async(path,options)=>{
  const entries=await actual.readdir(path,options);
  await rm(join(root,'.locks'),{recursive:true,force:true});
  return entries;
 });
 expect((await learningNativeRunPayloads(root,[id])).payloadRecords).toBe(1);
}));
it('does not treat an unreadable inventory as successful payload removal',()=>fixture(async root=>{
 vi.mocked(readdir).mockRejectedValueOnce(Object.assign(new Error('Synthetic permission denial'),{code:'EACCES'}));
 await expect(learningNativeRunPayloads(root,['wrun_synthetic_probe'])).rejects.toMatchObject({code:'EACCES'});
}));
