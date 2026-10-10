import {it,expect} from 'vitest';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {learningNativeRunPayloads} from '../fixtures/learning/native-store';
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
