import {randomUUID,createHash} from "node:crypto";
import {constants} from "node:fs";
import {cp,lstat,mkdir,readFile,readdir,realpath,rm,writeFile} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {Client} from "pg";
import {closeRuntimePool} from "../../../lib/server/db/client";
import {requireOwnedExecutionClone,type ExecutionEvalEnvironment} from "../../../scripts/execution-eval-environment";
import {readOwnedExecutionPair} from "./pair";
async function treeDigest(root:string){const hash=createHash("sha256");async function visit(relative:string){const path=join(root,relative),s=await lstat(path);if(s.isSymbolicLink())throw new Error("Matched restore refuses symlinks");hash.update(relative+"\0"+String(s.mode&0o777)+"\0");if(s.isDirectory())for(const name of (await readdir(path)).sort())await visit(join(relative,name));else if(s.isFile())hash.update(await readFile(path));else throw new Error("Unsupported private restore entry");}await visit("");return hash.digest("hex");}
/** Exact local owned backup/restore. Both database and private runtime/store
 * state are captured while the supervisor is stopped. No configured DB is reset. */
export async function restoreOwnedExecutionPair(environment:ExecutionEvalEnvironment,afterSnapshot:()=>Promise<void>){
  const selected=requireOwnedExecutionClone(),url=new URL(selected);
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.pathname!==`/${environment.databaseName}`)throw new Error("Matched restore requires a local owned clone");
  await environment.stop();await closeRuntimePool();const pair=await readOwnedExecutionPair(environment);
  const parent=await realpath(dirname(environment.appRoot)),privateRoot=await realpath(resolve("local-artifacts/008")),backupRoot=join(privateRoot,`restore-pair-${randomUUID()}`);
  await mkdir(backupRoot,{mode:0o700});
  const directories=[environment.storeRoot,environment.workforceRoot,environment.workflowRoot];
  const names=["artifacts","workforce","workflow"],digests:string[]=[];
  for(const [i,path] of directories.entries()){digests.push(await treeDigest(path));await cp(path,join(backupRoot,names[i]),{recursive:true,mode:constants.COPYFILE_FICLONE,preserveTimestamps:true,errorOnExist:true,force:false});if(await treeDigest(join(backupRoot,names[i]))!==digests[i])throw new Error("Snapshot file set differs");}
  const original=environment.databaseName,backup=`turas_test_008_restore_${randomUUID().replaceAll("-","").slice(0,12)}`,backupOwner=`turas-recovery-008-${randomUUID()}`;
  const adminUrl=new URL(url);adminUrl.pathname="/postgres";const admin=new Client({connectionString:adminUrl.toString(),connectionTimeoutMillis:5000});await admin.connect();
  const marker=async(name:string)=>(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0]?.marker as string|undefined;
  const owner=await marker(original);if(!owner||!/^turas-owned-008-[a-f0-9-]{36}$/.test(owner)){await admin.end();throw new Error("Restore ownership unavailable");}
  // pg Pool.end can finish while its last socket is still closing. Prove the
  // owned supervisor is quiescent; forcibly killing that socket emits an
  // unhandled connection error and is not a clean paired checkpoint.
  const drained=async()=>{await closeRuntimePool();const deadline=Date.now()+10000;
    while(Date.now()<deadline){if(Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=$1",[original])).rows[0].n)===0)return;
      await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error("Owned snapshot database still has active connections");};
  let restored=false,created=false;
  try{
    await drained();
    await admin.query(`CREATE DATABASE ${backup} TEMPLATE ${original}`);created=true;await admin.query(`COMMENT ON DATABASE ${backup} IS '${backupOwner}'`);
    await writeFile(join(backupRoot,"receipt.json"),JSON.stringify({original,backup,backupOwner,pair,digests}),{flag:"wx",mode:0o600});
    await afterSnapshot();await environment.stop();await closeRuntimePool();
    const current=await readOwnedExecutionPair(environment);
    if(current.database!==pair.database||current.environmentId!==pair.environmentId||current.artifactMarker!==pair.artifactMarker||current.workforceMarker!==pair.workforceMarker||await marker(original)!==owner||await marker(backup)!==backupOwner)throw new Error("Restore pair identity changed");
    await drained();
    await admin.query(`DROP DATABASE ${original}`);await admin.query(`CREATE DATABASE ${original} TEMPLATE ${backup}`);await admin.query(`COMMENT ON DATABASE ${original} IS '${owner}'`);
    for(const [i,path] of directories.entries()){
      if(await realpath(path)!==resolve(path)||!resolve(path).startsWith(parent+"/"))throw new Error("Owned restore path changed");
      await rm(path,{recursive:true});await cp(join(backupRoot,names[i]),path,{recursive:true,mode:constants.COPYFILE_FICLONE,preserveTimestamps:true,errorOnExist:true,force:false});
      if(await treeDigest(path)!==digests[i])throw new Error("Restored file set differs from matched snapshot");
    }
    const after=await readOwnedExecutionPair(environment);if(after.database!==pair.database||after.environmentId!==pair.environmentId||after.schemaVersion!==pair.schemaVersion||after.artifactMarker!==pair.artifactMarker||after.workforceMarker!==pair.workforceMarker)throw new Error("Restored pair marker mismatch");
    restored=true;return {database:original,matchedStores:names,snapshotDigests:digests,restoredDigests:await Promise.all(directories.map(treeDigest)),schemaVersion:pair.schemaVersion,hostedProof:false};
  }finally{
    await closeRuntimePool();
    try{if(created&&restored){if(await marker(backup)!==backupOwner)throw new Error("Backup cleanup ownership changed");await admin.query(`DROP DATABASE ${backup}`);await rm(backupRoot,{recursive:true});}}
    finally{await admin.end();}
  }
}
