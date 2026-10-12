import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,mkdir,cp,writeFile,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withPilotEnvironment} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {qualityChildEnvironment} from './pilot-quality-runtime';
import {parsePilotImagePreparation} from '../lib/contracts/pilot-images';
import {verifyArtifactImage,assertFreshArtifactSignatures} from '../lib/server/artifacts/scan';
import {createOwnedConversation} from '../lib/server/conversations/repository';
import {authenticateDemoPrincipal} from '../lib/server/auth/credentials';
import {issueSession,getCurrentSession,sessionCookieName} from '../lib/server/auth/sessions';
import {qualityCatalog} from './pilot-quality';
import suites from './pilot-suites.json';
import {verifyPilotSuiteResult} from './pilot-suite-results';

const authorization=z.strictObject({contract:z.literal('pilot-quality-operator-v1'),id:z.uuid(),feature:z.literal('016'),category:z.literal('model-evaluation'),modelId:z.literal('spacexai/grok-4.7'),capMicroUsd:z.number().int().positive().max(100000000),contextCreditCap:z.literal(4),automaticBillingAllowed:z.literal(false),independentReviewAuthorized:z.literal(true),userInstructionReference:z.string().trim().min(1).max(512),recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true})});
type Stage={id:string;commands:string[][];native?:boolean;deadlineMs:number};
/** Governing full commands only. No case omission, paid retry, fixture-model
 * replacement, historical review reuse, or self-issued semantic acceptance. */
export const qualityStages:readonly Stage[]=[
 {id:'002',commands:[['scripts/eval-behavior-local.ts','--live']],native:true,deadlineMs:1800000},
 {id:'003',commands:[['scripts/eval-behavior-local.ts','--feature','003','--live']],native:true,deadlineMs:1800000},
 {id:'004',commands:[['scripts/eval-behavior-local.ts','--feature','004','--live']],deadlineMs:1800000},
 {id:'005-retrieval',commands:[['scripts/eval-retrieval.ts','--live','--max-embedding-calls','64','--max-input-characters','1000000']],deadlineMs:1800000},
 {id:'005-research',commands:Array.from({length:12},(_,i)=>['scripts/eval-research.ts','--case','R'+String(i+1).padStart(2,'0'),'--live']),deadlineMs:3600000},
 {id:'006',commands:[['scripts/eval-plans.ts','--live','--disposable']],deadlineMs:3600000},
 {id:'007',commands:[['scripts/eval-staffing.ts','--live']],deadlineMs:14400000},
 {id:'008',commands:[['scripts/check-execution-release.ts'],['scripts/eval-execution.ts','--live']],deadlineMs:14400000},
 {id:'010',commands:[['scripts/eval-support.ts','--live']],deadlineMs:3600000},
 {id:'011',commands:[['scripts/eval-expansion.ts','--live','--budget-usd','25']],deadlineMs:3600000},
 {id:'014',commands:[['scripts/eval-learning.ts','--live','--budget-usd','25']],deadlineMs:3600000},
];

function parse(args:string[]){
 const mode=args[0];if(!['--prepare','--live'].includes(mode))throw Error('Explicit quality mode required');
 const allowed=new Set(mode==='--prepare'?['images','output']:['images','output','authorization','deterministic-proof','preparation','budget-usd']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid quality inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete explicit quality inputs required');
 return {mode,values};
}
async function privateReceipt(file:string){const absolute=resolve(file);return readEvidence(dirname(absolute),basename(absolute));}
async function command(file:string[],cwd:string,root:string,name:string,deadline:number,live:boolean){
 const env:NodeJS.ProcessEnv={...process.env,...(live?await qualityChildEnvironment():{NODE_OPTIONS:'',TURAS_ALLOW_LIVE_MODEL_TESTS:'0',AI_GATEWAY_API_KEY:'',CONTEXT_API_KEY:''})};
 if(!live)delete env.TURAS_016_QUALITY_RUNTIME_FILE;
 const child=spawn(process.execPath,['--import','tsx',...file],{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});let output='',expired=false;
 for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output=(output+bytes.toString()).slice(-4194304);});
 const stop=()=>{expired=true;try{process.kill(-child.pid!,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}};
 const timer=setTimeout(stop,Math.max(1,deadline-Date.now()));let code:number|null;
 try{code=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('close',done);});}finally{clearTimeout(timer);}
 for(const [key,value] of Object.entries(env))if(value&&/KEY|SECRET|TOKEN|PASSWORD|URL/.test(key))output=output.replaceAll(value,'[redacted]');
 await writeFile(join(root,name+'.log'),output,{flag:'wx',mode:0o600});
 if(expired||code!==0)throw Error('Complete quality command failed');
}
async function setupImages(preparationFile:string){
 const preparation=parsePilotImagePreparation(await readFile(preparationFile)),store=dirname(preparationFile);
 for(const kind of ['scanner','parser','renderer'] as const){const image=preparation.images.find(row=>row.kind===kind);if(!image)throw Error('Complete prepared images required');await verifyArtifactImage(image.localImageId,image.localImageId.slice(7));process.env['TURAS_PILOT_'+kind.toUpperCase()+'_IMAGE']=image.localImageId;}
 for(const signature of preparation.scanner.signatures){const bytes=await readFile(join(store,'store/signatures',signature.name));if(bytes.length!==signature.sizeBytes||evidenceDigest(bytes)!==signature.digest)throw Error('Scanner provenance differs');}
 if(evidenceDigest(await readFile(join(store,'store/assets/eng.traineddata')))!==preparation.ocr.digest)throw Error('OCR provenance differs');
 await assertFreshArtifactSignatures(join(store,'store/signatures'));
 await cp(join(store,'store/signatures'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
 await cp(join(store,'store/assets'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
 await writeFile(join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:process.env.TURAS_PILOT_PARSER_IMAGE,parserDigest:process.env.TURAS_PILOT_PARSER_IMAGE!.slice(7),scannerImage:process.env.TURAS_PILOT_SCANNER_IMAGE,scannerDigest:process.env.TURAS_PILOT_SCANNER_IMAGE!.slice(7)}),{mode:0o600});
 process.env.TURAS_REPORTS_ENABLED='true';
}
async function verifyCompleteDeterministic(file:string,source:Awaited<ReturnType<typeof pilotSource>>){
 const receipt=await privateReceipt(file) as Record<string,unknown>,expected=suites.suites.reduce((sum,suite)=>sum+suite.expectedCases,0);
 if(receipt.state!=='pass'||receipt.version!=='pilot-execution-v1'||receipt.sourceCommit!==source.sourceCommit||receipt.sourceDigest!==source.sourceDigest||receipt.catalogDigest!==source.catalogDigest||receipt.expectedCases!==expected||receipt.passedCases!==expected)throw Error('Complete current pilot catalog required before paid evaluation');
 for(const [index,suite] of suites.suites.entries())verifyPilotSuiteResult(suite.file,await readEvidence(dirname(resolve(file)),`suite-${index}.json`));
}
async function capturedFiles(root:string){
 const files:Array<{path:string;digest:string;bytes:number}>=[];let total=0;
 async function visit(directory:string,relative:string){for(const name of await readdir(directory)){if(['node_modules','.eve'].includes(name)||name.startsWith('.env'))continue;const path=join(directory,name),stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Indirect quality capture denied');if(stat.isDirectory())await visit(path,join(relative,name));else if(stat.isFile()){total+=stat.size;if(files.length>=10000||total>104857600)throw Error('Quality captures exceed bound');files.push({path:join(relative,name),digest:evidenceDigest(await readFile(path)),bytes:stat.size});}}}
 await visit(root,'');return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function pilotQualityLive(args=process.argv.slice(2)){
 process.umask(0o077);if(Number(process.versions.node.split('.')[0])!==24)throw Error('Quality runner requires Node 24');
 const {mode,values}=parse(args),root=resolve(values.output),sourceRoot=process.cwd(),source=await pilotSource(),images=resolve(values.images);
 await createEvidenceDirectory(root);
 const assertSource=async()=>{if(JSON.stringify(await pilotSource(sourceRoot))!==JSON.stringify(source))throw Error('Quality source changed');};
 if(!(await readFile('agent/agent.ts','utf8')).includes('const selectedModel = "spacexai/grok-4.7";'))throw Error('Configured model differs');
 if(mode==='--prepare'){
  const id=randomUUID(),expiresAt=new Date(Date.now()+1800000).toISOString(),authorizationDigest=evidenceDigest('synthetic-pre-provider-denial-only');
  const budget=await QualityBudgetLedger.create(join(root,'budget'),{contract:'pilot-quality-budget-v1',id,capMicroUsd:1,authorizationDigest,sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest,modelId:'spacexai/grok-4.7',expiresAt});
  await writeEvidence(root,'runtime.json',{contract:'pilot-quality-runtime-v1',id,sourceRoot,ledgerRoot:budget.root,...source,authorizationDigest,capMicroUsd:1,expiresAt});
  await withPilotEnvironment(async environment=>{
   process.env.TURAS_016_QUALITY_RUNTIME_FILE=join(root,'runtime.json');process.env.TURAS_ALLOW_LIVE_MODEL_TESTS='1';process.env.AI_GATEWAY_API_KEY='synthetic-no-provider-credential';
   await setupImages(images);const identity=await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!);if(!identity)throw Error('Synthetic owner unavailable');
   const login=await issueSession(identity),cookie=sessionCookieName()+'='+login.token,actor=await getCurrentSession(new Request(environment.origin,{headers:{cookie}}));if(!actor)throw Error('Synthetic owner unavailable');
   const operationId=randomUUID(),created=await createOwnedConversation(actor,{customerId:null,requestKey:operationId,title:'Synthetic unpaid quality admission'});
   await environment.startWorker();await environment.startNative();
   const auth=await (await fetch(environment.origin+'/api/auth/session',{headers:{cookie}})).json(),headers={cookie,origin:environment.origin,'content-type':'application/json','x-csrf-token':auth.data.csrfToken,'x-turas-conversation-id':created.conversation.id};
   const bound=await fetch(environment.origin+'/eve/v1/session',{method:'POST',headers,body:JSON.stringify({operationId}),signal:AbortSignal.timeout(10000)}),binding=await bound.json();if(!bound.ok||!binding.sessionId)throw Error('Synthetic native binding failed');
   const response=await fetch(environment.origin+'/eve/v1/session/'+binding.sessionId,{method:'POST',headers:{...headers,'x-turas-request-key':randomUUID()},body:JSON.stringify({message:'Acknowledge this synthetic admission check.'}),signal:AbortSignal.timeout(30000)});await response.body?.cancel();if(!response.ok)throw Error('Synthetic native request rejected before model admission');
   const until=Date.now()+60000;for(;;){const denials=(await readdir(root)).filter(name=>name.startsWith('model-denial-'));if(denials.length){const proof=await readEvidence(root,denials[0]) as Record<string,unknown>;if(proof.reason!=='insufficient_budget'||proof.providerDispatched!==false)throw Error('Wrong native admission receipt');break;}if(Date.now()>until)throw Error('Native admission check incomplete');await new Promise(done=>setTimeout(done,250));}
  },{postgresMajor:18,deadlineMs:180000});
  await assertSource();const accounting=await budget.status();if(accounting.dispatches||accounting.contextDispatches||accounting.unknown)throw Error('Synthetic preparation dispatched a provider');
  const receipt={contract:'pilot-quality-preparation-v1',...source,preparedAt:new Date().toISOString(),nativeAdmissionVerified:true,realProviderCredential:false,paidDispatches:0,imagesDigest:evidenceDigest(await readFile(images)),catalogs:qualityCatalog,stages:qualityStages,actualModelQualityVerified:false,independentReviewComplete:false};
  await writeEvidence(root,'preparation.json',receipt);console.info(JSON.stringify({gate:'pilot-quality-preparation',state:'pass',paidDispatches:0,catalogs:qualityCatalog.length,actualModelQualityVerified:false}));return receipt;
 }
 const approval=authorization.parse(await privateReceipt(values.authorization)),approvedAt=Date.parse(approval.recordedAt),expiresAt=Date.parse(approval.expiresAt);
 if(approvedAt>Date.now()||expiresAt<=Date.now()||expiresAt-approvedAt>86400000||String(approval.capMicroUsd/1000000)!==values['budget-usd'])throw Error('Fresh applicable operator budget required');
 await verifyCompleteDeterministic(values['deterministic-proof'],source);
 const prepared=await privateReceipt(values.preparation) as Record<string,unknown>;
 if(prepared.contract!=='pilot-quality-preparation-v1'||prepared.sourceDigest!==source.sourceDigest||prepared.catalogDigest!==source.catalogDigest||prepared.sourceCommit!==source.sourceCommit||prepared.nativeAdmissionVerified!==true||prepared.paidDispatches!==0||prepared.imagesDigest!==evidenceDigest(await readFile(images)))throw Error('Current native admission preparation required');
 const key=process.env.AI_GATEWAY_API_KEY,contextKey=process.env.CONTEXT_API_KEY;if(!key||!contextKey)throw Error('Configured providers required');
 const authorizationDigest=evidenceDigest(JSON.stringify(approval)),registry=join(sourceRoot,'local-artifacts/016/quality-budgets');
 await mkdir(registry,{recursive:true,mode:0o700});
 const ledgerRoot=join(registry,approval.id);
 let budget:QualityBudgetLedger;
 try{
  const saved=await readEvidence(ledgerRoot,'authorization.json') as Record<string,unknown>;
  for(const [field,value] of Object.entries({id:approval.id,capMicroUsd:approval.capMicroUsd,contextCreditCap:approval.contextCreditCap,authorizationDigest,modelId:approval.modelId,expiresAt:approval.expiresAt}))if(saved[field]!==value)throw Error('Existing approval cannot reset or expand its allowance');
  budget=new QualityBudgetLedger(ledgerRoot);
 }catch(error){
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  // Exclusive creation makes concurrent controllers fail closed. Every attempt
  // using this approval retains the same original dollar and credit journal.
  budget=await QualityBudgetLedger.create(ledgerRoot,{contract:'pilot-quality-budget-v1',id:approval.id,capMicroUsd:approval.capMicroUsd,contextCreditCap:approval.contextCreditCap,authorizationDigest,sourceDigest:source.sourceDigest,catalogDigest:source.catalogDigest,modelId:approval.modelId,expiresAt:approval.expiresAt});
 }
 const attemptId=await budget.beginAttempt(source);
 await writeEvidence(root,'runtime.json',{contract:'pilot-quality-runtime-v1',id:approval.id,attemptId,sourceRoot,ledgerRoot:budget.root,...source,authorizationDigest,capMicroUsd:approval.capMicroUsd,contextCreditCap:approval.contextCreditCap,expiresAt:approval.expiresAt});
 await writeEvidence(root,'operator-authorization.json',approval);
 const completed:string[]=[];
 try{
  for(const stage of qualityStages){await assertSource();if((await budget.status()).admissionHeld)throw Error('Provider accounting requires review');const stageRoot=join(root,stage.id);await createEvidenceDirectory(stageRoot);
   await withPilotEnvironment(async environment=>{
    process.env.TURAS_TEST_POSTGRES_CONTAINER=environment.databaseContainer;await setupImages(images);
    const deadline=Date.now()+stage.deadlineMs;
    await command(['scripts/seed-profile-demo.ts','--walkthrough'],environment.appRoot,stageRoot,'seed',deadline,false);
    await command(['tests/fixtures/artifacts/generate.ts'],environment.appRoot,stageRoot,'artifact-fixtures',deadline,false);
    process.env.AI_GATEWAY_API_KEY=key;process.env.CONTEXT_API_KEY=contextKey;process.env.TURAS_ALLOW_LIVE_MODEL_TESTS='1';process.env.TURAS_016_QUALITY_RUNTIME_FILE=join(root,'runtime.json');process.env.EVE_SKIP_SANDBOX_PREWARM='1';
    if(stage.native){await environment.startWorker();await environment.startNative();}
    try{for(const [index,args] of stage.commands.entries()){await assertSource();await command(args,environment.appRoot,stageRoot,'command-'+index,deadline,true);if((await budget.status()).admissionHeld)throw Error('Provider accounting requires review');}}
    finally{const local=join(environment.appRoot,'local-artifacts');await mkdir(local,{recursive:true,mode:0o700});const inventory=await capturedFiles(local);await cp(local,join(stageRoot,'captures'),{recursive:true,filter:path=>!path.split(/[\\/]/).some(part=>['node_modules','.eve'].includes(part)||part.startsWith('.env'))});await writeEvidence(stageRoot,'captures.json',{...source,stage:stage.id,files:inventory,actualModelQualityVerified:false});}
   },{postgresMajor:18,deadlineMs:stage.deadlineMs+300000});completed.push(stage.id);await writeEvidence(root,'stage-'+stage.id+'.json',{...source,stage:stage.id,state:'captured',accounting:await budget.status(),independentReviewComplete:false});
  }
  await assertSource();const receipt={contract:'pilot-quality-batch-v1',...source,completed,accounting:await budget.status(),state:'awaiting-independent-review',actualModelQualityVerified:false,independentReviewComplete:false};await writeEvidence(root,'batch.json',receipt);console.info(JSON.stringify({gate:'pilot-quality-capture',state:'awaiting-independent-review',stages:completed.length,actualModelQualityVerified:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{contract:'pilot-quality-batch-v1',...source,completed,accounting:await budget.status(),state:'fail',actualModelQualityVerified:false,safeFailure:'incomplete_quality_batch'});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotQualityLive().catch(()=>{console.error('Quality batch incomplete; no semantic acceptance or release approved.');process.exitCode=1;});
