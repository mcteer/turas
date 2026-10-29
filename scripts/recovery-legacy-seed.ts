import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from 'pg';
import {z} from 'zod';
const releasedBase='699f6f4a89911b1ba33bc2d90ed51ac1ba2ee530';
const schemas={'012':47,'013':49,'014':51} as const;
const requiredReleasedSeedMembers={
 '008':['tests/fixtures/execution/environment.ts','tests/fixtures/execution/baseline.ts','lib/server/staffing/resources.ts','tests/fixtures/staffing/seed.ts'],
 '012':['tests/fixtures/gaps/seed.ts','tests/fixtures/gaps/evidence.ts'],
 '013':['tests/fixtures/partners/environment.ts','tests/fixtures/partners/seed.ts','tests/fixtures/partners/originals.ts','lib/server/conversations/repository.ts','lib/server/execution/service.ts','tests/fixtures/execution/registers.ts'],
 '014':['tests/fixtures/learning/environment.ts','tests/fixtures/learning/setup.ts'],
} as const;
export function verifyReleasedSeedArchiveMembers(archive:Buffer,feature:keyof typeof requiredReleasedSeedMembers){
 const members=execFileSync('tar',['-tf','-'],{input:archive,timeout:30000,maxBuffer:4*1024*1024,encoding:'utf8'}).split('\n').filter(Boolean);
 if(!members.length||members.length>10000||members.some(path=>path.startsWith('/')||path.includes('\\')||path.split('/').includes('..')||path.length>4096))throw Error('Released fixture archive has no safe members');
 const required=['lib/server/bootstrap-ids.ts','lib/server/db/client.ts',...requiredReleasedSeedMembers[feature]];
 if(required.some(path=>members.filter(member=>member===path).length!==1))throw Error('Released fixture archive lacks required original modules');
 return members;
}
/** Read the same released tree from its actual canonical Git root, never a cwd prefix. */
export async function archiveReleasedRecoveryCode(feature:keyof typeof requiredReleasedSeedMembers,workingDirectory=process.cwd()){
 const uid=process.getuid?.(),cwd=resolve(workingDirectory),selected=await lstat(cwd);
 if(uid===undefined||!selected.isDirectory()||selected.isSymbolicLink()||await realpath(cwd)!==cwd||selected.uid!==uid)throw Error('Canonical direct fixture working directory required');
 const repositoryRoot=execFileSync('git',['rev-parse','--show-toplevel'],{cwd,encoding:'utf8',timeout:5000}).trim(),stat=await lstat(repositoryRoot);
 if(resolve(repositoryRoot)!==repositoryRoot||await realpath(repositoryRoot)!==repositoryRoot||!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid)throw Error('Canonical direct fixture repository root required');
 execFileSync('git',['-C',repositoryRoot,'merge-base','--is-ancestor',releasedBase,'HEAD'],{timeout:5000});
 const archive=execFileSync('git',['-C',repositoryRoot,'archive','--format=tar',releasedBase],{timeout:30000,maxBuffer:64*1024*1024});
 verifyReleasedSeedArchiveMembers(archive,feature);return archive;
}

/** Seed controlled predecessor records using the exact previously released
 * domain code, then terminate its writer before current forward migrations.
 * Current operation guards are never disabled to execute against older schemas. */
export async function seedReleasedRecoveryFixture<T>(input:{feature:keyof typeof schemas|'008';priorSchema?:34|35;appRoot:string;signal:AbortSignal}):Promise<T>{
 const {feature,signal}=input;signal.throwIfAborted();
 const priorSchema=feature==='008'?input.priorSchema:schemas[feature];
 if(feature==='008'?![34,35].includes(priorSchema??0):input.priorSchema!==undefined)throw Error('Exact released fixture schema required');
 const ownerUrl=process.env.DATABASE_URL_UNPOOLED;
 if(!ownerUrl||ownerUrl!==process.env.TURAS_TEST_DATABASE_URL||process.env.TURAS_ENVIRONMENT_ID!==process.env.TURAS_TEST_ENVIRONMENT_ID)throw Error('Exact owned legacy seed connection required');
 const url=new URL(ownerUrl),token=new RegExp('^/turas_test_'+feature+'_eval_([a-f0-9]{12})$').exec(url.pathname)?.[1];
 if(url.hostname!=='127.0.0.1'||!['postgres:','postgresql:'].includes(url.protocol)||!token||!process.env.TURAS_ENVIRONMENT_ID?.startsWith('test-'))throw Error('Actual owned legacy seed scope required');
 if(feature!=='008'){
  const prefix={'012':'gap','013':'partner','014':'learning'}[feature];
  if(process.env.TURAS_ENVIRONMENT_ID!==`test-${prefix}-${token}`)throw Error('Exact owned legacy environment required');
  const inspected=execFileSync('docker',['inspect','--format',`{{index .Config.Labels "turas.${feature}.owner"}}`,`turas-${feature}-check-${token}`],{encoding:'utf8',timeout:5000});
  if(inspected.trim()!==token)throw Error('Owned legacy seed container marker differs');
 }
 const db=new Client({connectionString:ownerUrl,connectionTimeoutMillis:5000,statement_timeout:10000});
 await db.connect();
 try{
  const rows=(await db.query(`SELECT environment_id,schema_version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner FROM turas_environment`)).rows;
  if(rows.length!==1||rows[0].owner!==true||rows[0].environment_id!==process.env.TURAS_ENVIRONMENT_ID||Number(rows[0].schema_version)!==priorSchema)throw Error('Exact prior schema and actual seed owner required');
  if(feature==='008'){const marker=(await db.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database() AND pg_get_userbyid(datdba)=current_user")).rows[0]?.marker;if(typeof marker!=='string'||!/^turas-owned-008-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(marker))throw Error('Actual owned execution database marker required');}
 }finally{await db.end();}
 const archive=await archiveReleasedRecoveryCode(feature);
 const root=await mkdtemp(join(resolve(input.appRoot),'released-seed-'));
 try{
  const archivePath=join(root,'released.tar');await writeFile(archivePath,archive,{flag:'wx',mode:0o600});
  execFileSync('tar',['-xf',archivePath,'-C',root],{timeout:30000,maxBuffer:65536});await rm(archivePath);
  const script=join(root,'seed-recovery.ts'),output=join(root,'seed-result.json');
  await writeFile(script,seedScript,{flag:'wx',mode:0o600});
  await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const log=resolve('local-artifacts/016','legacy-seed-'+feature+'-'+token+'.log');let bytes=0,parts:Buffer[]=[];
  const child=spawn(process.execPath,['--import','tsx',script,feature,output],{cwd:root,env:{...process.env,AI_GATEWAY_API_KEY:'',CONTEXT_API_KEY:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0',TURAS_TEST_MODEL_MODE:'deterministic'},stdio:['ignore','pipe','pipe'],signal});
  for(const stream of [child.stdout,child.stderr])stream.on('data',(part:Buffer)=>{bytes+=part.length;if(bytes>1048576)child.kill('SIGKILL');else parts.push(part);});
  const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
  let code:number|null;
  try{code=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});}finally{clearTimeout(timer);await writeFile(log,Buffer.concat(parts),{mode:0o600});}
  if(code!==0||bytes>1048576)throw Error('Released predecessor fixture seed failed');
  const bytesOut=await readFile(output);if(bytesOut.length>8388608)throw Error('Legacy seed metadata exceeds bound');
  const result=z.object({contract:z.literal('released-recovery-seed-v1'),feature:z.literal(feature),baseCommit:z.literal(releasedBase),environmentId:z.literal(process.env.TURAS_ENVIRONMENT_ID!),seed:z.unknown()}).parse(JSON.parse(bytesOut.toString()));
  signal.throwIfAborted();
  // Session expiry is a Date in CurrentSession; source observation strings must
  // retain their original JSON representation and are deliberately not revived.
  function sessions(value:any):any{if(Array.isArray(value))return value.map(sessions);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='expiresAt'&&typeof item==='string'?new Date(item):sessions(item)]));return value;}
  return sessions(result.seed) as T;
 }finally{await rm(root,{recursive:true,force:true});}
}

const seedScript=String.raw`
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DEMO_IDS} from './lib/server/bootstrap-ids';
import {closeRuntimePool} from './lib/server/db/client';
async function main(){
 const [feature,output]=process.argv.slice(2);let seed;
 try{
  if(feature==='008'){
   const {withExecutionDatabase}=await import('./tests/fixtures/execution/environment');
   const {createExecutionBaseline}=await import('./tests/fixtures/execution/baseline');
   const {createResource}=await import('./lib/server/staffing/resources');
   const {syntheticResource}=await import('./tests/fixtures/staffing/seed');
   seed=await withExecutionDatabase(async db=>{await db.query('BEGIN');try{const baseline=await createExecutionBaseline(db),resource=await createResource(baseline.reviewer,{requestKey:randomUUID(),rationale:'Synthetic pre-upgrade reviewed resource identity',resource:syntheticResource()},db);await db.query('COMMIT');return {...baseline,resource};}catch(error){await db.query('ROLLBACK');throw error;}});
  }else if(feature==='012'){
   const {gapActors}=await import('./tests/fixtures/gaps/seed');
   const {acceptedGapEvidence}=await import('./tests/fixtures/gaps/evidence');
   const actors=await gapActors(),evidence=await acceptedGapEvidence(actors.panel,actors.mcteer,DEMO_IDS.sharedCustomer,'corroboration','Synthetic predecessor source survives explicit upgrade.');seed={actors,evidence};
  }else if(feature==='013'){
   const {withPartnerDatabase}=await import('./tests/fixtures/partners/environment');
   const {partnerTestActors,partnerDeliveryBaseline}=await import('./tests/fixtures/partners/seed');
   const {partnerAcceptedEvidence,partnerSharedEvidence}=await import('./tests/fixtures/partners/originals');
   const {createOwnedConversation}=await import('./lib/server/conversations/repository');
   const {submitExecutionCommand}=await import('./lib/server/execution/service');
   const {executionCommand,saveRegister,submitRegister,reviewRegister,registerBase}=await import('./tests/fixtures/execution/registers');
   const actors=await withPartnerDatabase(partnerTestActors),baseline=await withPartnerDatabase(async db=>{await db.query('BEGIN');try{const value=await partnerDeliveryBaseline(db,actors.author,actors.reviewer);await db.query('COMMIT');return value;}catch(error){await db.query('ROLLBACK');throw error;}}),evidence=await partnerAcceptedEvidence(actors.author,actors.reviewer,DEMO_IDS.sharedCustomer,'Synthetic predecessor recovery observation');
   await partnerSharedEvidence(actors.author,actors.reviewer,DEMO_IDS.deniedCustomer);
   await createOwnedConversation(actors.author,{customerId:DEMO_IDS.sharedCustomer,requestKey:randomUUID(),title:'Synthetic predecessor private conversation'});
   await submitExecutionCommand(actors.author,baseline.engagementId,executionCommand('setup',{baseline:1,plan:baseline.decision.aggregateVersion},{baselineId:baseline.baselineId}));
   const f={...actors,engagementId:baseline.engagementId,baselineId:baseline.baselineId},work=await saveRegister(f,{...registerBase(),kind:'activity',subtype:'work',title:'Synthetic predecessor accepted work',narrative:'Synthetic independently recorded predecessor activity',references:[]});await reviewRegister(f,await submitRegister(f,work));seed={actors,baseline,evidence};
  }else if(feature==='014'){
   const {withLearningDatabase}=await import('./tests/fixtures/learning/environment');
   const {seedLearningPublicPractice}=await import('./tests/fixtures/learning/setup');seed=await withLearningDatabase(seedLearningPublicPractice);
  }else throw Error('Unsupported released recovery seed');
  await writeFile(output,JSON.stringify({contract:'released-recovery-seed-v1',feature,baseCommit:'${releasedBase}',environmentId:process.env.TURAS_ENVIRONMENT_ID,seed}),{flag:'wx',mode:0o600});
 }finally{await closeRuntimePool();}
}
main().catch(error=>{console.error(String(error instanceof Error?error.message:'Released controlled predecessor seed failed').replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/g,'[redacted-uri]'));process.exitCode=1;});
`;
