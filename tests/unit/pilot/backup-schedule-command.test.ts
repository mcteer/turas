import {it,expect} from 'vitest';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pilotBackup} from '../../../scripts/pilot-backup';
import {writeEvidence,readEvidence} from '../../../scripts/pilot-evidence';
it('records a private schedule assessment without authorizing cleanup or cadence acceptance',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/schedule-command-'));
 try{const now=Date.now(),entry={id:randomUUID(),environmentId:'owned-schedule',ownership:'managed-016',capturedAt:new Date(now-3600000).toISOString(),expiresAt:new Date(now-3600000+7*86400000).toISOString(),verifiedAt:new Date(now-1800000).toISOString()};await writeEvidence(root,'inventory.json',[entry]);const output=join(root,'assessment');await pilotBackup(['--schedule-check','--environment','owned-schedule','--inventory',join(root,'inventory.json'),'--output',output]);expect(await readEvidence(output,'schedule.json')).toMatchObject({environmentId:'owned-schedule',fresh:true,scheduleExecutionVerified:false,deletionAuthorized:false,restorationReady:false});await expect(readEvidence(root,'inventory.json')).resolves.toEqual([entry]);}finally{await rm(root,{recursive:true,force:true});}
});
it('preserves a failed foreign-scope attempt and rejects malformed command flags',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/schedule-command-'));
 try{const capturedAt=new Date(Date.now()-3600000).toISOString();await writeEvidence(root,'inventory.json',[{id:randomUUID(),environmentId:'foreign',ownership:'operator',capturedAt,expiresAt:new Date(Date.now()+3600000).toISOString(),verifiedAt:capturedAt}]);const output=join(root,'failure');await expect(pilotBackup(['--schedule-check','--environment','owned-schedule','--inventory',join(root,'inventory.json'),'--output',output])).rejects.toThrow('identity');expect(await readEvidence(output,'failure.json')).toMatchObject({state:'fail',safeFailure:'incomplete_schedule_inventory'});await expect(pilotBackup(['--schedule-check','--environment','owned','--inventory',join(root,'inventory.json'),'--actor','mcteer'])).rejects.toThrow('Invalid schedule');}finally{await rm(root,{recursive:true,force:true});}
});
