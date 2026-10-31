import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {pilotBackup} from '../../../scripts/pilot-backup';
import {verifyRecoveryCandidate} from '../../../lib/server/operations/candidate-verification';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureOwnedRecoveryCandidate} from '../../../lib/server/operations/capture-candidate';
import {decryptRecoveryFile} from '../../../lib/server/operations/backup-crypto';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {environmentObjectId,objectKey} from '../../../lib/server/storage/private-objects';
async function fixture(run:(input:any,root:string,key:Buffer)=>Promise<void>){
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/capture-fixture-')),key=randomBytes(32);
 try{await withPilotEnvironment(async environment=>{
 const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
 try{const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,recoveryId])).rows[0].revision);
 const sourceRoot=join(root,'objects'),workflowRoot=join(root,'workflow'),keys=join(root,'keys');await mkdir(sourceRoot,{mode:0o700});await mkdir(workflowRoot,{mode:0o700});await mkdir(keys,{mode:0o700});
 for(const namespace of activeObjectNamespaces){await mkdir(join(sourceRoot,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Synthetic recovery object '+namespace),digest=createHash('sha256').update(bytes).digest('hex');await new LocalPrivateObjects(sourceRoot,environment.environmentId,10485760).put(objectKey(environment.environmentId,namespace,namespace.startsWith('artifact')?digest:randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});}
 await writeFile(join(workflowRoot,'synthetic.json'),'{}',{mode:0o600});await writeFile(join(keys,'key'),key,{mode:0o600});
 await run({environmentId:environment.environmentId,recoveryId,controlRevision:revision,sourceRoot,workflowRoot,keyFile:join(keys,'key'),keyReference:'synthetic-key',keyVersion:'1',output:join(root,'capture')},root,key);
 }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});}finally{key.fill(0);await rm(root,{recursive:true,force:true});}
}
it('captures a real pinned database and stable workflow as an encrypted candidate without asserting readiness',async()=>fixture(async(input,root,key)=>{
 const result=await captureOwnedRecoveryCandidate(input,AbortSignal.timeout(120000));expect(result).toMatchObject({contract:'pilot-capture-candidate-v1',objects:{objectCount:6},schemaVersion:CURRENT_SCHEMA_VERSION,mode:'locked',currentAuthorityVerified:false,outsideCopyVerified:false,restorationReady:false,providerCalls:0,workflow:{fileCount:1,runtimeStoppedVerified:false,resumptionVerified:false}});
 expect((await readFile(join(input.output,'candidate.encrypted'))).subarray(0,8).toString()).toBe('TURAS016');expect(await readdir(input.output)).toEqual(expect.arrayContaining(['candidate.encrypted','candidate.json']));expect(await readdir(input.output)).not.toContain('capture-work');
 await mkdir(join(root,'verify'),{mode:0o700});await decryptRecoveryFile(join(input.output,'candidate.encrypted'),join(root,'verify','archive'),key,result.encryptedBundle.headerDigest,AbortSignal.timeout(30000));expect((await readFile(join(root,'verify','archive'))).length).toBeGreaterThan(1000);
 expect(await readFile(join(input.workflowRoot,'synthetic.json'),'utf8')).toBe('{}');
 const verified=await pilotBackup(['--verify-candidate','--environment',input.environmentId,'--candidate',join(input.output,'candidate.json'),'--bundle',join(input.output,'candidate.encrypted'),'--key-file',input.keyFile,'--output',join(root,'verified-receipt')]);expect(verified).toMatchObject({archiveIntegrityVerified:true,captureProvenanceVerified:true,objectCount:6,databaseRestoreVerified:false,currentAuthorityVerified:false,outsideCopyVerified:false,restorationReady:false,capturedSourceMatchesVerifier:true});
 const base={candidate:result,environmentId:input.environmentId,bundle:join(input.output,'candidate.encrypted'),keyFile:input.keyFile,signal:AbortSignal.timeout(30000)};
 const wrongKey=join(root,'keys','wrong-key');await writeFile(wrongKey,randomBytes(32),{mode:0o600});
 await expect(verifyRecoveryCandidate({...base,keyFile:wrongKey})).rejects.toThrow();
 await expect(verifyRecoveryCandidate({...base,excludedKeyRoots:[join(root,'keys')]})).rejects.toThrow('outside');
 await expect(verifyRecoveryCandidate({...base,candidate:{...result,acceptedContentDigest:'0'.repeat(64)}})).rejects.toThrow('provenance');
 await expect(verifyRecoveryCandidate({...base,candidate:{...result,workflow:{...result.workflow,inventoryDigest:'0'.repeat(64)}}})).rejects.toThrow('inventory digest');
 await expect(verifyRecoveryCandidate({...base,candidate:{...result,currentAuthorityVerified:true}})).rejects.toThrow();
 expect((await readdir(input.output)).some((name:string)=>name.startsWith('candidate-verify-'))).toBe(false);
}),210000);
it('refuses an incorrect lock revision and removes partial plaintext and encrypted outputs',async()=>fixture(async input=>{
 await expect(captureOwnedRecoveryCandidate({...input,controlRevision:input.controlRevision+1},AbortSignal.timeout(30000))).rejects.toThrow('boundary');expect(await readdir(input.output)).toEqual([]);
}),210000);
it('refuses captured key placement and pre-interrupted capture without touching originals',async()=>fixture(async input=>{
 const keyFile=join(input.workflowRoot,'bad-key');await writeFile(keyFile,randomBytes(32),{mode:0o600});await expect(captureOwnedRecoveryCandidate({...input,keyFile},AbortSignal.timeout(30000))).rejects.toThrow('outside');expect(await readdir(input.output)).toEqual([]);
 const interrupted=AbortSignal.abort();await expect(captureOwnedRecoveryCandidate({...input,output:input.output+'-aborted'},interrupted)).rejects.toThrow();expect(await readFile(join(input.workflowRoot,'synthetic.json'),'utf8')).toBe('{}');
}),210000);
it('settles interruption after an actual exported checkpoint and retains the lock',async()=>fixture(async input=>{
 const observer=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await observer.connect();const cancellation=new AbortController();let observed=false;
 const capture=captureOwnedRecoveryCandidate(input,cancellation.signal);const settled=capture.then(()=>({failed:false}),()=>({failed:true}));
 try{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const rows=await observer.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND query LIKE 'SELECT pg_export_snapshot()%'");if(rows.rowCount){observed=true;cancellation.abort(Error('Controlled post-checkpoint interruption'));break;}await new Promise(r=>setTimeout(r,20));}
  if(!observed)cancellation.abort(Error('Checkpoint observation unavailable'));expect(await settled).toEqual({failed:true});expect(observed).toBe(true);
  expect((await observer.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');expect(await readdir(input.output)).toEqual([]);
  expect((await observer.query('SELECT pg_try_advisory_lock(hashtextextended($1,16017)) AS available',[input.environmentId])).rows[0].available).toBe(true);await observer.query('SELECT pg_advisory_unlock(hashtextextended($1,16017))',[input.environmentId]);
 }finally{cancellation.abort();await settled;await observer.end();}
}),210000);
