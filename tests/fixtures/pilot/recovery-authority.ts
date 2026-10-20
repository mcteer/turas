import {Client} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureRecoveryDenialSnapshot,recoveryDenialSnapshotSchema,verifyRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {encryptRecoveryFile,decryptRecoveryFile} from '../../../lib/server/operations/backup-crypto';
/** A modeled backup and its later source snapshot share the source clock. */
export async function authorityCheckpointTime(owner:Client){return (await owner.query('SELECT clock_timestamp() AS captured_at')).rows[0].captured_at.toISOString() as string;}
/** Synthetic owner tests only. Cold encrypted metadata and its separate key are
 * outside the disposable database, not a hosted backup or a full restore claim. */
export async function withAuthorityEnvironment(run:(owner:Client,runtime:Client,environmentId:string)=>Promise<void>,options:{deadlineMs?:450000}={}){
 const renderer=process.env.TURAS_PILOT_RENDERER_IMAGE;
 if(renderer&&!/^sha256:[a-f0-9]{64}$/.test(renderer))throw Error('Owned immutable renderer required');
 await withPilotEnvironment(async env=>{if(renderer)process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});runtime.on('error',()=>{});await owner.connect();await runtime.connect();try{await run(owner,runtime,env.environmentId);}finally{await runtime.end().catch(()=>{});await owner.end();}},{postgresMajor:18,deadlineMs:options.deadlineMs??180000});
}
export async function coldAuthorityProof(owner:Client,environmentId:string){
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),root=await mkdtemp(resolve('local-artifacts/016/authority-test-')),keyRoot=await mkdtemp(resolve('local-artifacts/016/authority-key-')),key=randomBytes(32);
 try{await writeFile(join(root,'snapshot.json'),JSON.stringify(snapshot),{mode:0o600,flag:'wx'});await writeFile(join(keyRoot,'key'),key,{mode:0o600,flag:'wx'});await encryptRecoveryFile(join(root,'snapshot.json'),join(root,'snapshot.encrypted'),key,snapshot.snapshotDigest,AbortSignal.timeout(30000));key.fill(0);await rm(join(root,'snapshot.json'));
 const coldKey=await readFile(join(keyRoot,'key'));try{await decryptRecoveryFile(join(root,'snapshot.encrypted'),join(root,'cold.json'),coldKey,snapshot.snapshotDigest,AbortSignal.timeout(30000));}finally{coldKey.fill(0);}
 const cold=recoveryDenialSnapshotSchema.parse(JSON.parse(await readFile(join(root,'cold.json'),'utf8')));verifyRecoveryDenialSnapshot(cold,{environmentId,contextDigest:snapshot.snapshotDigest,after:snapshot.capturedAt,now:Date.parse(await authorityCheckpointTime(owner))});return cold;
 }finally{key.fill(0);await rm(root,{recursive:true,force:true});await rm(keyRoot,{recursive:true,force:true});}
}
export async function lockAuthorityTarget(owner:Client,environmentId:string,snapshot?:Awaited<ReturnType<typeof coldAuthorityProof>>,backupCapturedAt=new Date().toISOString()){
 const recoveryId=randomUUID(),revision=(await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0].revision;
 return {environmentId,recoveryId,controlRevision:Number(revision),snapshotDigest:snapshot?.snapshotDigest??'0'.repeat(64),backupCapturedAt};
}
