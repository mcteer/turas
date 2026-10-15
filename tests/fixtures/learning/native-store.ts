import {readdir,readFile,lstat,realpath} from 'node:fs/promises';
import {zstdDecompressSync} from 'node:zlib';
import {join,resolve,basename} from 'node:path';
/** Inspect only fresh owned synthetic run storage; encrypted payloads count too.
 * Retention zero deliberately preserves content-free workflow metadata.
 */
export async function learningNativeRunPayloads(workflowRoot:string,sessionIds:readonly string[]){
 const root=await realpath(workflowRoot),owned=await realpath(resolve('local-artifacts/014'));
 if(!root.startsWith(`${owned}/owned-`)||!root.endsWith('/app/.eve/.workflow-data')||sessionIds.length<1||sessionIds.length>32||sessionIds.some(id=>!/^wrun_[A-Za-z0-9_-]+$/.test(id)))throw Error('Owned native run inventory required');
 let examined=0,totalBytes=0;const records:Array<{name:string;path:string;size:number;category:string;value:Record<string,unknown>|null}>=[];
 // Workflow releases locks and retirement removes files during this read-only
 // inventory. Only an actually vanished entry is absent; permission and other
 // IO failures must still fail the probe, and every surviving payload counts.
 const missing=(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT';
 async function inspect(path:string){const entries=await readdir(path,{withFileTypes:true}).catch(error=>{if(missing(error))return [];throw error;});for(const entry of entries){const child=join(path,entry.name);if(entry.isSymbolicLink())throw Error('Owned native store symlink refused');if(entry.isDirectory())await inspect(child);else if(entry.isFile()){
  if(++examined>20000)throw Error('Owned native inventory exceeds bound');const info=await lstat(child).catch(error=>{if(missing(error))return null;throw error;});if(!info)continue;totalBytes+=info.size;if(info.size>4000000||totalBytes>100000000)throw Error('Owned native payload bound exceeded');
  const bytes=await readFile(child).catch(error=>{if(missing(error))return null;throw error;});if(!bytes)continue;
  let value:Record<string,unknown>|null=null;try{const parsed=JSON.parse(bytes.toString());if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value=parsed;}catch{}
  records.push({name:basename(child),path:child.slice(root.length+1),size:info.size,category:child.slice(root.length+1).split('/')[0],value});
 }}}
 await inspect(root);const runIds=new Set(sessionIds);
 for(let pass=0;pass<10;pass++){let added=false;for(const record of records){const value=record.value,attributes=value?.attributes as Record<string,unknown>|undefined;if(record.category==='runs'&&typeof value?.runId==='string'&&(runIds.has(String(attributes?.$rootRunId))||runIds.has(String(attributes?.$parentRunId)))&&!runIds.has(value.runId)){runIds.add(value.runId);added=true;}}if(!added)break;if(runIds.size>200)throw Error('Owned native descendants exceed bound');}
 const streamNames=new Set<string>();for(const record of records)if(record.path.startsWith('streams/runs/')&&[...runIds].some(id=>record.name.startsWith(id))&&Array.isArray(record.value?.streams))for(const name of record.value.streams)if(typeof name==='string')streamNames.add(name);
 const timerIds=new Set<string>();
 for(const record of records){const value=record.value;if(record.category!=='runs'||typeof value?.runId!=='string'||!runIds.has(value.runId)||value.workflowName!=='workflow//eve//sessionTimeoutWorkflow')continue;
  // Installed eve SessionTimeoutWorkflowInput: deadline, ownerRunId, token.
  // This framework timer never receives customer/model context; its token is
  // deliberately neither returned nor logged by this synthetic probe.
  const input=value.input as {__type?:unknown;data?:unknown}|undefined;if(input?.__type!=='Uint8Array'||typeof input.data!=='string')throw Error('Unexpected owned timer encoding');let bytes=Buffer.from(input.data,'base64');if(bytes.subarray(0,4).toString()==='zstd')bytes=zstdDecompressSync(bytes.subarray(4),{maxOutputLength:65536});if(bytes.subarray(0,4).toString()!=='devl')throw Error('Unexpected owned timer serialization');const flat=JSON.parse(bytes.subarray(4).toString());const args=flat[0],timer=Array.isArray(args)&&args.length===1?flat[args[0]]:null;
  if(!timer||JSON.stringify(Object.keys(timer).sort())!==JSON.stringify(['deadline','ownerRunId','token'])||!runIds.has(flat[timer.ownerRunId])||typeof flat[timer.token]!=='string'||flat[timer.token].length>200||!Array.isArray(flat[timer.deadline])||flat[timer.deadline][0]!=='Date'||!Number.isFinite(new Date(flat[timer.deadline][1]).getTime())||value.output!==undefined||value.error!==undefined)throw Error('Framework timer retained unexpected private data');timerIds.add(value.runId);
 }
 let payloadRecords=0,metadataRecords=0;const payloadKinds:Record<string,number>={};const retainedWorkflowKinds:Record<string,number>={};
 for(const record of records){const value=record.value;if(record.path.startsWith('streams/chunks/')&&streamNames.has(record.path.split('/')[2])){metadataRecords++;if(record.size>1){payloadRecords++;payloadKinds.streams=(payloadKinds.streams??0)+1;}continue;}if(!(typeof value?.runId==='string'&&runIds.has(value.runId))&&![...runIds].some(id=>record.name.startsWith(id)))continue;metadataRecords++;if(typeof value?.runId==='string'&&timerIds.has(value.runId))continue;
  if(record.category==='streams')continue;
  const payload=value?.eventData&&typeof value.eventData==='object'?value.eventData as Record<string,unknown>:value;
  if(payload&&['input','output','error','payload',...(record.category==='hooks'?['metadata']:[])].some(key=>payload[key]!==undefined&&payload[key]!==null)){payloadRecords++;const kind=`${record.category}:${String(value?.eventType??value?.status??'unknown')}`;if(record.category==='runs'&&typeof value?.workflowName==='string')retainedWorkflowKinds[value.workflowName]=(retainedWorkflowKinds[value.workflowName]??0)+1;payloadKinds[kind]=(payloadKinds[kind]??0)+1;}
 }
 return {payloadRecords,metadataRecords,examined,associatedRuns:runIds.size,timerRuns:timerIds.size,payloadKinds,retainedWorkflowKinds};
}
