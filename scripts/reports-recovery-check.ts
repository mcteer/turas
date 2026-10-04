import {randomUUID,createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from 'pg';
import {withReportsLocalEnvironment} from './reports-local-environment';
import {withReportsTestEnvironment} from './reports-test-environment';
import {reportsSourceDigest} from './reports-source';
import {requireOwnedReportsDatabase} from '../tests/fixtures/reports/environment';
import {publishedReportFixture} from '../tests/fixtures/reports/published';
import {closeRuntimePool} from '../lib/server/db/client';
import {reportTransaction} from '../lib/server/reports/commands';
import {readReport} from '../lib/server/reports/read';
import {readReportObject} from '../lib/server/reports/store';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const REPORT_RECOVERY_SUITES=[
 'tests/integration/report-schema.test.ts','tests/integration/report-jobs.test.ts',
 'tests/integration/report-store.test.ts','tests/integration/report-cleanup.test.ts',
 'tests/integration/report-missing-artifacts.test.ts','tests/integration/report-dispatch-recovery.test.ts',
 'tests/integration/report-send-outbox.test.ts',
] as const;

async function treeDigest(root:string){
 const hash=createHash('sha256');
 async function visit(relative:string){
  const path=join(root,relative),stat=await lstat(path);if(stat.isSymbolicLink())throw new Error('Recovery snapshot refuses symlinks');
  hash.update(relative+'\0'+String(stat.mode&0o777)+'\0');
  if(stat.isDirectory())for(const name of(await readdir(path)).sort())await visit(join(relative,name));
  else if(stat.isFile())hash.update(await readFile(path));else throw new Error('Unsupported snapshot entry');
 }
 await visit('');return hash.digest('hex');
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--disposable')throw new Error('Recovery requires --disposable with no overrides');
 const sourceDigest=await reportsSourceDigest();await mkdir('local-artifacts/009',{recursive:true,mode:0o700});
 const evidenceRoot=await mkdtemp(resolve('local-artifacts/009/recovery-'));
 await withReportsLocalEnvironment(()=>withReportsTestEnvironment(async environment=>{
  await requireOwnedReportsDatabase();const fixture=await publishedReportFixture();
  const original=process.env.DATABASE_URL!,url=new URL(original);
  const reportRoot=process.env.TURAS_REPORT_STORE_ROOT!,workflowRoot=join(environment.appRoot,'.eve','.workflow-data');
  await mkdir(workflowRoot,{recursive:true,mode:0o700});
   await writeFile(join(workflowRoot,'report-recovery-probe'), 'Synthetic pre-snapshot workflow state',{mode:0o600,flag:'wx'});
   await environment.stop();await closeRuntimePool();
  const roots=[reportRoot,environment.storeRoot,workflowRoot],names=['reports','uploads','workflow'];
  const snapshotDigests=await Promise.all(roots.map(treeDigest));
  for(const [index,root]of roots.entries())await cp(root,join(evidenceRoot,names[index]),{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
  const backup=`turas_test_009_eval_${randomUUID().replaceAll('-','').slice(0,12)}`,owner=`turas-owned-009-${randomUUID()}`;
  const adminUrl=new URL(original);adminUrl.pathname='/postgres';const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
  let created=false;
  const marker=async(name:string)=>(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0]?.marker;
  try{
   if(!/^turas_test_009_eval_[a-f0-9]{12}$/.test(environment.databaseName)||!(await marker(environment.databaseName))?.startsWith('turas-owned-009-'))throw new Error('Recovery source ownership unavailable');
   const deadline=Date.now()+10000;
   while(Number((await admin.query('SELECT count(*) AS n FROM pg_stat_activity WHERE datname=$1',[environment.databaseName])).rows[0].n)>0){if(Date.now()>deadline)throw new Error('Snapshot source not quiescent');await new Promise(done=>setTimeout(done,100));}
   await admin.query(`CREATE DATABASE ${backup} TEMPLATE ${environment.databaseName}`);created=true;
   await admin.query(`COMMENT ON DATABASE ${backup} IS '${owner}'`);
   await reportTransaction(db=>db.query("UPDATE report_revision_states SET visibility='withheld',generation=generation+1 WHERE revision_id=$1",[fixture.published.revisionId]));
   await writeFile(join(workflowRoot,'report-recovery-probe'),'Synthetic newer workflow state',{mode:0o600});
   if((await readReport(fixture.reviewer,fixture.published.reportId)).document!==null)throw new Error('Source mutation probe did not withhold content');
   await closeRuntimePool();url.pathname='/'+backup;
   const keys=['DATABASE_URL','DATABASE_URL_UNPOOLED','TURAS_TEST_DATABASE_URL','TURAS_REPORT_STORE_ROOT'];
   const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
   try{
    process.env.DATABASE_URL=url.toString();process.env.DATABASE_URL_UNPOOLED=url.toString();process.env.TURAS_TEST_DATABASE_URL=url.toString();process.env.TURAS_REPORT_STORE_ROOT=join(evidenceRoot,'reports');
    await requireOwnedReportsDatabase();
    const view=await readReport(fixture.reviewer,fixture.published.reportId);if(view.visibility!=='current'||!view.document)throw new Error('Restored publication differs');
    const artifacts=await reportTransaction(async db=>(await db.query('SELECT object_key,content_digest,size_bytes FROM report_artifacts')).rows);
    for(const artifact of artifacts)await readReportObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes));
    const restoredDigests=await Promise.all(names.map(name=>treeDigest(join(evidenceRoot,name))));
    if(JSON.stringify(snapshotDigests)!==JSON.stringify(restoredDigests))throw new Error('Paired snapshot bytes differ');
    await writeFile(join(evidenceRoot,'matched-snapshot.json'),JSON.stringify({sourceDigest,snapshotDigests,restoredDigests,artifacts:artifacts.length,status:'passed',hostedProof:false}),{mode:0o600,flag:'wx'});
   }finally{await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
  }finally{
   await closeRuntimePool();
   try{if(created){if(await marker(backup)!==owner)throw new Error('Recovery cleanup ownership changed');await admin.query(`DROP DATABASE ${backup}`);}}finally{await admin.end();}
  }
  }));
 const suites=[];
 for(const [index,suite]of REPORT_RECOVERY_SUITES.entries()){
  const result=spawnSync(process.execPath,['--import','tsx','scripts/test-reports.ts','--suite',suite],{env:process.env,encoding:'utf8',timeout:360000});
  await writeFile(join(evidenceRoot,`suite-${index}.log`),result.stdout+result.stderr,{mode:0o600,flag:'wx'});
  if(result.error||result.status!==0)throw new Error('Recovery behavioral suite failed');
  const evidence=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(value=>value?.gate==='reports-focused');
  if(!evidence||evidence.sourceDigest!==sourceDigest||evidence.suites!==1||evidence.status!=='passed'||evidence.failed!==0||evidence.skipped!==0||!(evidence.passed>0))throw new Error('Recovery suite evidence incomplete');
  suites.push({suite,passed:evidence.passed});
 }
  if(sourceDigest!==await reportsSourceDigest())throw new Error('Recovery source changed');
 const evidence={gate:'reports-recovery',sourceDigest,matchedSnapshot:true,suites,status:'passed',pending:[],hostedProof:false};
 await writeFile(join(evidenceRoot,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Report recovery check failed; inspect private recovery evidence');process.exitCode=1;});
