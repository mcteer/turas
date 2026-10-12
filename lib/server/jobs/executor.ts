import {createHash} from 'node:crypto';
import {z} from 'zod';
export const executionKinds=['artifact-scan','artifact-parse','workforce-parse','report-render','report-office-check'] as const;
export type ExecutionKind=typeof executionKinds[number];
export const executionFileNames=['original','report.json','report.pptx'] as const;
export type ExecutionFile={name:typeof executionFileNames[number];bytes:Uint8Array;digest:string;sizeBytes:number};
export type ExecutionRequest={id:string;kind:ExecutionKind;image:string;imageDigest:string;deadlineAt:string;inputs:ExecutionFile[];
 parser?:{filename:string;mime:string;scanReceiptDigest:string};signal?:AbortSignal};
export const executionFailureCodes=['unsupported_format','encrypted','malformed','unsafe_content','limit_exceeded','scan_unavailable','scan_stale','parser_timeout','parser_failed'] as const;
export type ExecutionFailureCode=typeof executionFailureCodes[number];
/** Only a complete known parser code may leave isolated diagnostics. */
export function executionFailure(bytes:Uint8Array):ExecutionFailureCode|undefined{const value=Buffer.from(bytes).toString('utf8').trim();return executionFailureCodes.find(code=>code===value);}
export type ExecutionOutput={scannerSignatureVersion?:string;safeFailure?:ExecutionFailureCode;exitCode:number;stdout:Buffer;files:Partial<Record<'report.pdf'|'report.pptx'|'renderer.json'|'checks.json',Buffer>>;durationMs:number};
export function scannerSignatureHeader(bytes:Uint8Array){
 const header=Buffer.from(bytes).subarray(0,512).toString('ascii').trim(),match=/^ClamAV-VDB:[^:]*:(\d+):/.exec(header),epoch=header.split(':')[8];
 if(!match||!epoch||!/^\d{10}$/.test(epoch))throw Error('scan_unavailable');
 const builtAt=Number(epoch)*1000;if(Date.now()-builtAt>7*86400000||builtAt>Date.now()+60000)throw Error('scan_stale');return match[1];
}
export interface JobExecutor{execute(request:ExecutionRequest):Promise<ExecutionOutput>;}
const metadata=z.object({id:z.uuid(),kind:z.enum(executionKinds),image:z.string().min(1).max(512),imageDigest:z.string().regex(/^[a-f0-9]{64}$/),deadlineAt:z.iso.datetime({offset:true}),
 parser:z.object({filename:z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f\x7f]+$/),mime:z.enum(['text/plain','text/csv','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']),scanReceiptDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional()}).strict();
export const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function validateExecution(request:ExecutionRequest){const {inputs,signal,...fields}=request;metadata.parse(fields);signal?.throwIfAborted();const remaining=Date.parse(request.deadlineAt)-Date.now();if(remaining<=0||remaining>300000)throw Error('Execution requires the original finite deadline');if(!Array.isArray(inputs)||inputs.length!==1)throw Error('Fixed execution input required');const file=inputs[0];const expected=request.kind.startsWith('artifact')||request.kind==='workforce-parse'?'original':request.kind==='report-render'?'report.json':'report.pptx';if(file.name!==expected||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>10485760||file.bytes.length!==file.sizeBytes||sha256(file.bytes)!==file.digest)throw Error('Execution input integrity mismatch');const parse=request.kind==='artifact-parse'||request.kind==='workforce-parse';if(parse!==Boolean(request.parser))throw Error('Fixed parser binding required');return Math.min(remaining,request.kind==='artifact-scan'?30000:parse?90000:120000);}
/** The server selects executables; no request field selects a command or working directory. */
export function fixedProgram(request:ExecutionRequest,input='/input',output='/output'):{cmd:string;args:string[]}{
 switch(request.kind){case 'artifact-scan':return {cmd:'/usr/local/bin/scan-artifact',args:[]};
 case 'artifact-parse':case 'workforce-parse':{const p=request.parser!;return {cmd:'/usr/local/bin/node',args:['/opt/artifact-extractor/dist/main.js',input,p.filename,p.mime,request.imageDigest,p.scanReceiptDigest,'-',...(request.kind==='workforce-parse'?['workforce-table-v1']:[])]};}
 case 'report-render':return {cmd:'/usr/local/bin/turas-render-report',args:[input+'/report.json',output]};
 case 'report-office-check':return {cmd:'/usr/local/bin/turas-check-office',args:[input+'/report.pptx',output]};}
}
export const executionOutputNames=['report.pdf','report.pptx','renderer.json','checks.json'] as const;
