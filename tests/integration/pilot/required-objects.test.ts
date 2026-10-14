import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {createProfileTestSession} from '../../fixtures/profiles';
import {createArtifactDatabaseFixture} from '../../fixtures/artifact-database';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {requiredRecoveryObjects} from '../../../lib/server/operations/required-objects';
import {captureOwnedRecoveryCandidate} from '../../../lib/server/operations/capture-candidate';
import {pilotStorageMigrate} from '../../../scripts/pilot-storage-migrate';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../../../lib/server/storage/inventory';
import {environmentObjectId} from '../../../lib/server/storage/private-objects';
it('withholds copy and backup for a live database original absent from an otherwise empty store',async()=>{
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  const root=await mkdtemp(resolve('local-artifacts/016/required-objects-')),source=join(root,'source'),destination=join(root,'destination'),workflow=join(root,'workflow'),keys=join(root,'keys');
  const bytes=Buffer.from('Synthetic original for ledger verification'),id=randomUUID(),key=randomBytes(32);
  try{
   await db.query('BEGIN');
   const actor=await createProfileTestSession(db as unknown as PoolClient,'mcteer');
   await createArtifactDatabaseFixture(db as unknown as PoolClient,actor,DEMO_IDS.sharedCustomer,null,bytes,createHash('sha256').update(bytes).digest('hex'));await db.query('COMMIT');
   for(const directory of [source,destination,workflow,keys])await mkdir(directory,{mode:0o700});
   for(const namespace of activeObjectNamespaces)await mkdir(join(source,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});
   await writeFile(join(keys,'key'),key,{mode:0o600});
   const revision=Number((await db.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,id])).rows[0].revision);
   const required=await requiredRecoveryObjects(db,environment.environmentId);expect(required).toHaveLength(1);expect(required[0]).toMatchObject({digest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length});
   const args=(output:string)=>['--copy-owned','--environment',environment.environmentId,'--recovery-id',id,'--control-revision',String(revision),'--source-root',source,'--destination-root',destination,'--output',join(root,output)];
   await expect(pilotStorageMigrate(args('missing-copy'))).rejects.toThrow('Required original missing');
   await expect(captureOwnedRecoveryCandidate({environmentId:environment.environmentId,recoveryId:id,controlRevision:revision,sourceRoot:source,workflowRoot:workflow,keyFile:join(keys,'key'),keyReference:'synthetic-required-key',keyVersion:'1',output:join(root,'missing-capture')},AbortSignal.timeout(120000))).rejects.toThrow('Required original missing');
   expect(await readdir(join(root,'missing-capture'))).not.toContain('candidate.encrypted');
   const store=new LocalPrivateObjects(source,environment.environmentId,10485760);
   await store.put(required[0].key,(async function*(){yield bytes;})(),required[0]);
   expect(await pilotStorageMigrate(args('present-copy'))).toMatchObject({copied:1,objectCount:1,coldParityVerified:true,hostedCopyVerified:false});
   expect((await verifiedObjectInventory(store,environment.environmentId)).objects).toEqual(required);
  }finally{key.fill(0);await db.end();await rm(root,{recursive:true,force:true});}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
