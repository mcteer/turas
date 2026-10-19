import {Client} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {encryptRecoveryFile} from '../../../lib/server/operations/backup-crypto';
import {putNeonEncryptedArchive,retainNeonAuthoritySnapshot} from '../../../lib/server/operations/neon-archive';
import {readRetainedWorkDenialSnapshot,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
/** Actual encryption, independently selected owned archive DB, immutable retention,
 * cold download, decryption and reader capability. Only provider/key/DNS transport
 * is controlled by the caller. This is not hosted independent-placement proof. */
export async function withRetainedDenialFixture<T>(owner:Client,environmentId:string,root:string,transport:{mapConnection:(selected:string,actual:string)=>void;selectKey:(key:Uint8Array|null)=>void},run:(retained:RetainedWorkDenials)=>Promise<T>){
 const selected=requireOwnedPilotDatabase(process.env,true),name='turas_archive_'+randomUUID().replaceAll('-',''),key=randomBytes(32),installationId=randomUUID(),actual=new URL(selected);actual.pathname='/'+name;
 const archive=new Client({connectionString:actual.href});let created=false;
 try{
  await owner.query('CREATE DATABASE "'+name+'"');created=true;await archive.connect();
  await archive.query(await readFile(resolve('infra/pilot/neon-archive.sql'),'utf8'));
  await archive.query("INSERT INTO turas_backup.contract(singleton,version,installation_id,maximum_bytes) VALUES(true,'pilot-neon-archive-v1',$1,209715200)",[installationId]);
  await archive.query(await readFile(resolve('infra/pilot/neon-archive-002-capacity.sql'),'utf8'));
  await archive.query(await readFile(resolve('infra/pilot/neon-archive-003-authority-holds.sql'),'utf8'));
  const after=(await owner.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString(),signal=AbortSignal.timeout(60000),snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,signal),plain=Buffer.from(JSON.stringify(snapshot)),plainFile=join(root,'retained-source-private.json'),encryptedFile=join(root,'retained-source-private.encrypted');
  await writeFile(plainFile,plain,{mode:0o600,flag:'wx'});
  const encrypted=await encryptRecoveryFile(plainFile,encryptedFile,key,snapshot.snapshotDigest,signal);await rm(plainFile);
  const scope={contract:'pilot-neon-archive-v1' as const,installationId,id:snapshot.id,environmentId,capturedAt:snapshot.capturedAt,expiresAt:new Date(Date.parse(snapshot.capturedAt)+7*86400000).toISOString(),ciphertextDigest:encrypted.digest,headerDigest:snapshot.snapshotDigest,sizeBytes:encrypted.sizeBytes};
  await putNeonEncryptedArchive(archive,scope,encryptedFile,signal);await retainNeonAuthoritySnapshot(archive,scope,snapshot.snapshotDigest,signal);
  const fake=new URL(actual);fake.hostname='archive.fixture.neon.tech';fake.port='';fake.search='?sslmode=verify-full';transport.mapConnection(fake.href,actual.href);transport.selectKey(key);
  const destination={contract:'pilot-neon-operator-config-v2',teamId:'team_recovery',operatorProject:'synthetic-archive',operatorProjectId:'prj_archive',sourceProjectId:'prj_recovery',resourceId:'synthetic-resource',resourceName:'synthetic-archive',neonProjectId:'synthetic-neon',installationId,maximumBytes:419430400,billingPlanId:'free_v3',databaseUrl:fake.href};
  const receipt={contract:'pilot-work-denial-snapshot-v1',archive:scope,keyReference:{projectId:'prj_archive',variableId:'env_probe',name:'TURAS_RECOVERY_KEY_'+snapshot.id.replaceAll('-','').toUpperCase()},snapshotId:snapshot.id,snapshotDigest:snapshot.snapshotDigest,capturedAt:snapshot.capturedAt,sourceEnvironmentId:environmentId,sourceSchema:79,minimizedBytes:plain.length};
  await writeFile(join(root,'retained-destination-private.json'),JSON.stringify(destination),{mode:0o600,flag:'wx'});await writeFile(join(root,'retained-receipt-private.json'),JSON.stringify(receipt),{mode:0o600,flag:'wx'});const staging=join(root,'retained-cold');await mkdir(staging,{mode:0o700});
  const retained=await readRetainedWorkDenialSnapshot({receipt:join(root,'retained-receipt-private.json'),destination:join(root,'retained-destination-private.json'),staging,environmentId,after},signal);
  return await run(retained);
 }finally{transport.selectKey(null);key.fill(0);await archive.end();if(created)await owner.query('DROP DATABASE "'+name+'" WITH(FORCE)');}
}
