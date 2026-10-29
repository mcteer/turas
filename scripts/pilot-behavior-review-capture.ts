import {mkdir,readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import type {NativeEvent} from '../lib/server/conversations/projection';
export type BehaviorCaptureBinding={contract:'behavior-review-observer-v1';appRoot:string;outputRoot:string;environmentId:string;databaseHost:string;databaseName:string;databaseUser:string;sourceCommit:string};
const events=new Set(['actions.requested','action.result','step.completed','step.failed','turn.completed','turn.failed','turn.cancelled']);
const digest=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function privateBehaviorJson(value:unknown){
 let encoded=JSON.stringify(value),redacted=false;
 for(const [key,secret] of Object.entries(process.env))if(secret&&secret.length>=8&&/KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key)){const needle=JSON.stringify(secret).slice(1,-1);if(encoded.includes(needle)){encoded=encoded.replaceAll(needle,'[redacted-secret]');redacted=true;}}
 return redacted?JSON.stringify({...JSON.parse(encoded),redactedSecrets:true}):encoded;
}
function identity(value:string){if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))throw Error('Exact behavior attempt required');return value;}
async function privateDirectory(path:string){await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==resolve(path)||(info.mode&0o077)!==0)throw Error('Private direct behavior evidence directory required');}
/** Install only in an existing disposable app copy. The root hook/model and HTTP
 * projections are unchanged; private observers do not contribute model context. */
export async function installBehaviorReviewCapture(appRoot:string,outputRoot:string){
 const app=await realpath(appRoot),local=await realpath(resolve('local-artifacts'));
 if(!app.startsWith(local+'/')||!/(?:\/016\/owned-[^/]+|\/004\/eval-[^/]+|\/014\/owned-[^/]+)\/app$/.test(app)||app===await realpath(process.cwd()))throw Error('Owned behavior app copy required');
 const url=new URL(process.env.DATABASE_URL??''),environmentId=process.env.TURAS_ENVIRONMENT_ID??'';
 if(url.hostname!=='127.0.0.1'||!['postgres:','postgresql:'].includes(url.protocol)||!/^\/turas_(?:test_(?:016|014)_eval_|eval_)[a-f0-9]{12}$/.test(url.pathname)||!/^test-(?:pilot|learning)-[a-f0-9]{12}$/.test(environmentId)||process.env.TURAS_TEST_ENVIRONMENT_ID!==environmentId)throw Error('Owned synthetic behavior database required');
 const output=resolve(outputRoot);if(!output.startsWith(local+'/'))throw Error('Owned private behavior output required');await privateDirectory(output);
 const sourceCommit=process.env.TURAS_CODE_VERSION??'';if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('Exact behavior source required');
 const binding:BehaviorCaptureBinding={contract:'behavior-review-observer-v1',appRoot:app,outputRoot:output,environmentId,databaseHost:url.host,databaseName:url.pathname,databaseUser:url.username,sourceCommit};
 await writeFile(join(output,'binding-'+digest(app)+'.json'),JSON.stringify(binding),{flag:'wx',mode:0o600});
 const hook=`import {defineHook} from "eve/hooks";\nimport {recordBehaviorReviewEvent} from "../../scripts/pilot-behavior-review-capture";\nconst binding=${JSON.stringify(binding)} as const;\nexport default defineHook({events:{async "*"(event,ctx){const attemptId=ctx.session.auth.current?.attributes.turasAttemptId;if(typeof attemptId==="string")await recordBehaviorReviewEvent(binding,event,ctx.session.id,attemptId);}}});\n`;
 await writeFile(join(app,'agent/hooks/behavior-review-evidence.ts'),hook,{flag:'wx',mode:0o600});return binding;
}
export async function recordBehaviorReviewEvent(binding:BehaviorCaptureBinding,event:NativeEvent,nativeSessionId:string,attemptId:string){
 if(!events.has(event.type))return;
 const url=new URL(process.env.DATABASE_URL??'');
 if(binding.contract!=='behavior-review-observer-v1'||!/(?:\/016\/owned-[^/]+|\/004\/eval-[^/]+|\/014\/owned-[^/]+)\/app$/.test(binding.appRoot)||await realpath(process.cwd())!==binding.appRoot||process.env.TURAS_ENVIRONMENT_ID!==binding.environmentId||process.env.TURAS_TEST_ENVIRONMENT_ID!==binding.environmentId||url.host!==binding.databaseHost||url.pathname!==binding.databaseName||url.username!==binding.databaseUser||!/^evt_[A-Za-z0-9_-]{1,150}$/.test(event.meta.id??'')||!/^[A-Za-z0-9_-]{1,150}$/.test(nativeSessionId))throw Error('Behavior observer binding differs');
 const root=join(binding.outputRoot,identity(attemptId));await privateDirectory(root);
 if((await readdir(root)).length>=512)throw Error('Behavior event count exceeds bound');
 const encoded=privateBehaviorJson({contract:'behavior-review-event-v1',sourceCommit:binding.sourceCommit,environmentId:binding.environmentId,nativeSessionId,attemptId,event,redactedSecrets:false});
 if(Buffer.byteLength(encoded)>1048576)throw Error('Behavior event bytes exceed bound');
 const file=join(root,event.meta.id+'.json');
 try{await writeFile(file,encoded,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST'||await readFile(file,'utf8')!==encoded)throw error;}
}
export async function readBehaviorReviewEvents(root:string,attemptId:string,nativeSessionId:string){
 const directory=join(resolve(root),identity(attemptId));const names=await readdir(directory);if(names.length>512)throw Error('Behavior events exceed bound');
 let bytes=0;const records=[];
 for(const name of names.sort()){
  if(!/^evt_[A-Za-z0-9_-]{1,150}\.json$/.test(name))throw Error('Unexpected behavior evidence file');
  const file=join(directory,name),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw Error('Private behavior event required');
  const content=await readFile(file);bytes+=content.length;if(bytes>16777216)throw Error('Behavior evidence exceeds bound');const record=JSON.parse(content.toString());
  if(record.contract!=='behavior-review-event-v1'||record.attemptId!==attemptId||record.nativeSessionId!==nativeSessionId||!events.has(record.event?.type))throw Error('Behavior event identity differs');
  records.push({path:file,digest:digest(content),record});
 }
 return records;
}
export async function verifyBehaviorReviewEvidence(reference:{path:string;digest:string},expected:{caseId:string;run:number;conversationId:string;modelSteps:number;response?:string}){
 const root=await realpath(resolve('local-artifacts')),file=resolve(reference.path),info=await lstat(file);
 if(!file.startsWith(root+'/')||await realpath(file)!==file||!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0||info.size>16777216)throw Error('Private bound behavior review evidence required');
 const content=await readFile(file);if(digest(content)!==reference.digest)throw Error('Behavior review evidence digest differs');const evidence=JSON.parse(content.toString());
 if(evidence.contract!=='behavior-review-evidence-v1'||evidence.caseId!==expected.caseId||evidence.run!==expected.run||evidence.conversationId!==expected.conversationId||!Array.isArray(evidence.events)||evidence.events.length>512)throw Error('Behavior review evidence identity differs');
 if(evidence.rawReply){
  const path=resolve(evidence.rawReply.path),stat=await lstat(path);
  if(!path.startsWith(root+'/')||await realpath(path)!==path||!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>16777216)throw Error('Private bound behavior raw reply required');
  const bytes=await readFile(path);if(digest(bytes)!==evidence.rawReply.digest)throw Error('Behavior raw reply digest differs');const raw=JSON.parse(bytes.toString());
  if(raw.contract!=='behavior-review-raw-reply-v1'||raw.caseId!==expected.caseId||raw.run!==expected.run||raw.conversationId!==expected.conversationId||raw.nativeSessionId!==evidence.nativeSessionId||raw.modelSteps!==expected.modelSteps||raw.redactedSecrets===true||expected.response!==undefined&&raw.response!==expected.response)throw Error('Behavior raw reply identity or response differs');
 }
 for(const event of evidence.events){
  const path=resolve(event.path),stat=await lstat(path);
  if(!path.startsWith(root+'/')||await realpath(path)!==path||!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>1048576)throw Error('Private bound behavior event required');
  const bytes=await readFile(path);if(digest(bytes)!==event.digest||JSON.stringify(JSON.parse(bytes.toString()))!==JSON.stringify(event.record)||event.record?.attemptId!==evidence.attemptId||event.record?.nativeSessionId!==evidence.nativeSessionId)throw Error('Behavior event digest or identity differs');
 }
 if(evidence.events.filter((row:any)=>row.record.event.type==='step.completed').length!==expected.modelSteps)throw Error('Behavior review completed-step evidence differs');
 return evidence;
}
