export const knownBrowserPhases=new Set(['Reload retained failed history','Verify retained file after reload','Open learning draft','Prepare learning draft','Verify learning draft','Audit learning draft','Cancel learning draft','Verify learning partner denial','Prepare absent request assignment','Prepare absent request draft','Dispatch absent request draft','Verify unresolved absent request','Reload absent request assignment','Verify absent request after reload','Resolve absent request fence','Audit absent request outcome']);
export function fixedBrowserPhases(raw:unknown){return Array.isArray(raw)?[...new Set(raw.filter((value):value is string=>typeof value==='string'&&knownBrowserPhases.has(value)))].slice(0,8):[];}
import axe from 'axe-core';
import {z} from 'zod';
const expansionElapsed=z.number().int().min(0).max(300000);
export const expansionEntryObservationSchema=z.strictObject({
 contract:z.literal('expansion-entry-observation-v1'),elapsedMs:expansionElapsed,
 collectionError:z.enum(['none','page_closed','collection_timeout','collection_failed']),
 snapshot:z.strictObject({pathCategory:z.enum(['expansion','login','other']),visibility:z.enum(['visible','hidden','unknown']),focused:z.boolean(),newCount:z.number().int().min(0).max(8),newEnabled:z.boolean(),newVisible:z.boolean(),newWithinViewport:z.boolean(),newHitTarget:z.boolean(),loadingVisible:z.boolean(),unavailableVisible:z.boolean(),unconfirmedVisible:z.boolean()}).nullable(),
 events:z.array(z.strictObject({category:z.enum(['session','overview','module_asset','document']),phase:z.enum(['request','headers','finished','failed']),elapsedMs:expansionElapsed,status:z.number().int().min(100).max(599).nullable()})).max(16),
 pending:z.array(z.strictObject({category:z.enum(['session','overview','module_asset','document']),elapsedMs:expansionElapsed})).max(8),
 actions:z.array(z.strictObject({kind:z.enum(['new_pointer','new_click']),elapsedMs:expansionElapsed})).max(8),
 pageErrors:z.array(z.enum(['type','reference','syntax','chunk_load','hydration','other'])).max(4),
});
export type ExpansionEntryObservation=z.infer<typeof expansionEntryObservationSchema>;
export function fixedExpansionEntryObservation(raw:unknown):ExpansionEntryObservation|undefined{const parsed=expansionEntryObservationSchema.safeParse(raw);return parsed.success?parsed.data:undefined;}
function expansionEntryAttachment(raw:unknown):ExpansionEntryObservation|undefined{
 if(!Array.isArray(raw))return;
 for(const value of raw.slice(-16)){
  if(!value||typeof value!=='object'||value.name!=='expansion-entry-observation'||value.contentType!=='application/json'||typeof value.body!=='string'||value.body.length>10924)continue;
  try{const bytes=Buffer.from(value.body,'base64');if(bytes.length>8192||bytes.toString('base64')!==value.body)continue;const result=fixedExpansionEntryObservation(JSON.parse(bytes.toString('utf8')));if(result)return result;}catch{/* Never publish arbitrary attachment data. */}
 }
}
const executionElapsed=z.number().int().min(0).max(180000);
const executionVisibility=z.enum(['visible','hidden','unknown']);
const executionPath=z.enum(['execution','login','other']);
const executionControl=z.strictObject({count:z.number().int().min(0).max(8),enabled:z.boolean()});
const executionDocument=z.strictObject({category:z.enum(['document','focus','blur','visibility']),elapsedMs:executionElapsed,visibility:executionVisibility,focused:z.boolean(),pathCategory:executionPath});
const executionOverview=z.strictObject({category:z.literal('overview'),elapsedMs:executionElapsed,status:z.number().int().min(100).max(599).nullable(),error:z.enum(['none','transport','http_denied','http_error','body_unavailable','body_invalid','oversized']),initialized:z.boolean().nullable(),reviewRequired:z.boolean().nullable(),reconciliation:z.boolean().nullable(),newEligible:z.boolean().nullable(),baselineMismatch:z.boolean().nullable()});
export const executionChangesObservationSchema=z.strictObject({
 contract:z.literal('execution-changes-observation-v1'),elapsedMs:executionElapsed,
 collectionError:z.enum(['none','page_closed','collection_timeout','collection_failed']),
 snapshot:z.strictObject({visibility:executionVisibility,focused:z.boolean(),pathCategory:executionPath,reconciliationCount:z.number().int().min(0).max(8),reconciliationVisible:z.boolean(),mappingSelectCount:z.number().int().min(0).max(64),controls:z.strictObject({workPackageProof:executionControl,workPackageReadiness:executionControl,milestoneProofDone:executionControl,milestoneReady:executionControl})}).nullable(),
 events:z.array(z.union([executionDocument,executionOverview,z.strictObject({category:z.literal('page_error'),elapsedMs:executionElapsed,error:z.enum(['type','reference','syntax','chunk_load','hydration','other'])})])).max(16),
});
export type ExecutionChangesObservation=z.infer<typeof executionChangesObservationSchema>;
export function fixedExecutionChangesObservation(raw:unknown):ExecutionChangesObservation|undefined{
 const parsed=executionChangesObservationSchema.safeParse(raw);return parsed.success?parsed.data:undefined;
}
function executionChangesAttachment(raw:unknown):ExecutionChangesObservation|undefined{
 if(!Array.isArray(raw))return;
 for(const value of raw.slice(0,16)){
  if(!value||typeof value!=='object'||value.name!=='execution-changes-observation'||value.contentType!=='application/json'||typeof value.body!=='string'||value.body.length>10924)continue;
  try{const bytes=Buffer.from(value.body,'base64');if(bytes.length>8192||bytes.toString('base64')!==value.body)continue;const result=fixedExecutionChangesObservation(JSON.parse(bytes.toString('utf8')));if(result)return result;}catch{/* Never relay malformed/private attachment content. */}
 }
}
export const executionWriteObservationSchema=z.strictObject({
 contract:z.literal('execution-write-observation-v1'),elapsedMs:z.number().int().min(0).max(300000),
 collectionError:z.enum(['none','page_closed','collection_timeout','collection_failed']),
 snapshot:z.strictObject({visibility:executionVisibility,focused:z.boolean(),pathCategory:executionPath,panelPresent:z.boolean(),panelHidden:z.boolean(),
  save:executionControl,submit:executionControl,submitVisible:z.boolean(),uncertainVisible:z.boolean(),savedVisible:z.boolean(),refreshVisible:z.boolean(),writesDisabledVisible:z.boolean(),
  invalidControlCount:z.number().int().min(0).max(64).optional(),invalidFields:z.array(z.enum(['title','context','event_date','timezone','owner_reason','work_package','minutes','as_of','other'])).max(8).optional(),commandDeniedVisible:z.boolean().optional(),recordStates:z.strictObject({draft:z.number().int().min(0).max(64),submitted:z.number().int().min(0).max(64),accepted:z.number().int().min(0).max(64),other:z.number().int().min(0).max(64)})}).nullable(),
 events:z.array(z.strictObject({category:z.enum(['create','submit','command_other','session','overview','owners','activity','delivery','accepted','read_other']),phase:z.enum(['request','response','finished','failed']),elapsedMs:z.number().int().min(0).max(300000),status:z.number().int().min(100).max(599).nullable()})).max(16),
 commands:z.array(z.strictObject({category:z.enum(['create','submit','command_other']),phase:z.enum(['request','response','finished','failed']),elapsedMs:z.number().int().min(0).max(300000),status:z.number().int().min(100).max(599).nullable()})).max(8).optional(),
 actions:z.array(z.strictObject({kind:z.enum(['save_pointer','save_click','submit_pointer','submit_click','form_submit','invalid']),field:z.enum(['none','title','context','event_date','timezone','owner_reason','work_package','minutes','as_of','other']),elapsedMs:z.number().int().min(0).max(300000)})).max(8).optional(),
 pageErrors:z.array(z.enum(['type','reference','syntax','chunk_load','hydration','other'])).max(4).optional(),
 pending:z.array(z.strictObject({category:z.enum(['create','submit','command_other','session','overview','owners','activity','delivery','accepted','read_other']),elapsedMs:z.number().int().min(0).max(300000)})).max(8),
});
export type ExecutionWriteObservation=z.infer<typeof executionWriteObservationSchema>;
export function fixedExecutionWriteObservation(raw:unknown):ExecutionWriteObservation|undefined{const result=executionWriteObservationSchema.safeParse(raw);return result.success?result.data:undefined;}
function executionWriteAttachment(raw:unknown):ExecutionWriteObservation|undefined{
 if(!Array.isArray(raw))return;
 for(const value of raw.slice(-16)){
  if(!value||typeof value!=='object'||value.name!=='execution-write-observation'||value.contentType!=='application/json'||typeof value.body!=='string'||value.body.length>10924)continue;
  try{const bytes=Buffer.from(value.body,'base64');if(bytes.length>8192||bytes.toString('base64')!==value.body)continue;const result=fixedExecutionWriteObservation(JSON.parse(bytes.toString('utf8')));if(result)return result;}catch{/* No raw attachment data escapes. */}
 }
}
type UtilizationMetadata={status:number;fromMatches:boolean;toMatches:boolean;resourceMatches:boolean;percentageIsExpected:boolean;state:string|null;errorCode:string|null};
const utilizationStates=new Set(['complete','incomplete','not_applicable','other']);
const utilizationCodes=new Set(['invalid_input','unauthenticated','unauthorized','forbidden','not_found','scope_too_large','unavailable','rate_limited','other']);
export function fixedUtilizationMetadata(raw:unknown):UtilizationMetadata|undefined{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
 const row=raw as Record<string,unknown>,keys=['status','fromMatches','toMatches','resourceMatches','percentageIsExpected','state','errorCode'];
 if(Object.keys(row).length!==keys.length||Object.keys(row).some(key=>!keys.includes(key))||!Number.isInteger(row.status)||Number(row.status)<100||Number(row.status)>599||['fromMatches','toMatches','resourceMatches','percentageIsExpected'].some(key=>typeof row[key]!=='boolean')||(row.state!==null&&(typeof row.state!=='string'||!utilizationStates.has(row.state)))||(row.errorCode!==null&&(typeof row.errorCode!=='string'||!utilizationCodes.has(row.errorCode))))return;
 return {status:row.status as number,fromMatches:row.fromMatches as boolean,toMatches:row.toMatches as boolean,resourceMatches:row.resourceMatches as boolean,percentageIsExpected:row.percentageIsExpected as boolean,state:row.state as string|null,errorCode:row.errorCode as string|null};
}
function utilizationAttachment(raw:unknown):UtilizationMetadata|undefined{
 if(!Array.isArray(raw))return;
 for(const value of raw.slice(0,16)){
  if(!value||typeof value!=='object'||value.name!=='utilization-scope'||value.contentType!=='application/json'||typeof value.body!=='string'||value.body.length>2732)continue;
  try{
   const bytes=Buffer.from(value.body,'base64');if(bytes.length>2048)continue;
   const row=JSON.parse(bytes.toString('utf8')),keys=['status','fromMatches','toMatches','resourceMatches','percentage','state','errorCode'];
   if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==keys.length||Object.keys(row).some(key=>!keys.includes(key))||(row.percentage!==null&&(typeof row.percentage!=='string'||!/^\d{1,12}\.\d{2}$/.test(row.percentage))))continue;
   const result=fixedUtilizationMetadata({status:row.status,fromMatches:row.fromMatches,toMatches:row.toMatches,resourceMatches:row.resourceMatches,percentageIsExpected:row.percentage==='12.50',state:row.state===null?null:utilizationStates.has(row.state)?row.state:'other',errorCode:row.errorCode===null?null:utilizationCodes.has(row.errorCode)?row.errorCode:'other'});
   if(result)return result;
  }catch{/* Malformed or private attachment content is never a diagnostic. */}
 }
}
type BrowserFailure={file:string;line:number;column:number;project:string;status:string;durationMs:number|null;category:string;signatures:string[];mentionedAccessibilityRules:string[];phases?:string[];utilization?:UtilizationMetadata;executionChanges?:ExecutionChangesObservation;executionWrite?:ExecutionWriteObservation;expansionEntry?:ExpansionEntryObservation};
const accessibilityRules=new Set(axe.getRules().map(rule=>rule.ruleId));
const projects=new Set(['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark']);
const signatures=['Test timeout','Timeout','toBeVisible','toBeFocused','toHaveCount','toEqual','strict mode violation','navigation interrupted','ERR_ABORTED','ECONNREFUSED','Execution context was destroyed','page.reload','page.goto','Target page, context or browser has been closed','WebKit encountered an internal error','Frame load interrupted','Load failed','Fast Refresh','503','429'] as const;
/** Fixed metadata only: never publish titles, error prose, DOM, raw attachments or stdout. */
export function browserFailureMetadata(raw:unknown,allowedFiles:ReadonlySet<string>):BrowserFailure[]{
 const failures:BrowserFailure[]=[];let visited=0;
 const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1000000?value:0;
 const filename=(value:unknown)=>{if(typeof value!=='string')return null;const name=value.split(/[\\/]/).at(-1)!;return allowedFiles.has(name)?name:null;};
 function walk(value:unknown,depth:number){
  if(++visited>10000||depth>16||failures.length>=30||!value||typeof value!=='object')return;
  const row=value as Record<string,unknown>,file=filename(row.file);
  if(file&&Array.isArray(row.tests))for(const test of row.tests){
   if(!test||typeof test!=='object'||!Array.isArray(test.results))continue;
   for(const result of test.results){
    if(failures.length>=30)break;
    if(!result||!['failed','timedOut','interrupted'].includes(result.status))continue;
    const errors=Array.isArray(result.errors)?result.errors:[result.error];
    const prose=errors.filter((error:any)=>error&&typeof error==='object').map((error:any)=>typeof error.message==='string'?error.message:'').join('\n');
    let location={file,line:integer(row.line),column:integer(row.column)};
    for(const error of errors){
     if(!error||typeof error!=='object'||typeof error.stack!=='string')continue;
     const matches=[...error.stack.matchAll(/tests[\\/]ui[\\/]([a-z-]+\.spec\.ts):(\d+):(\d+)/g)];
     const match=matches.find(item=>allowedFiles.has(item[1]));
     if(match){location={file:match[1],line:integer(Number(match[2])),column:integer(Number(match[3]))};break;}
    }
    const phases=new Set<string>();
    const steps=Array.isArray(result.steps)?result.steps.slice(0,1000):[];
    for(let inspected=0;steps.length&&inspected<1000;inspected++){const step=steps.shift();if(!step||typeof step!=='object')continue;if(step.error&&typeof step.title==='string'&&knownBrowserPhases.has(step.title))phases.add(step.title);if(Array.isArray(step.steps))steps.push(...step.steps.slice(0,1000-steps.length));}
    const matched=signatures.filter(signature=>prose.toLowerCase().includes(signature.toLowerCase()));
    const mentionedAccessibilityRules=[...new Set([...prose.matchAll(/"([a-z][a-z0-9-]{1,79})"/g)].map(match=>match[1]).filter(id=>accessibilityRules.has(id)))].slice(0,8);
    const utilization=file==='execution-handoff.spec.ts'?utilizationAttachment(result.attachments):undefined;
    const executionChanges=file==='execution-changes.spec.ts'?executionChangesAttachment(result.attachments):undefined;
    const executionWrite=file==='execution-handoff.spec.ts'?executionWriteAttachment(result.attachments):undefined;
    const expansionEntry=/^expansion-(authoring|decisions|review-queue|advice)\.spec\.ts$/.test(file)?expansionEntryAttachment(result.attachments):undefined;
    failures.push({...location,...(phases.size?{phases:[...phases].sort()}:{}),...(utilization?{utilization}:{}),...(executionChanges?{executionChanges}:{}),...(executionWrite?{executionWrite}:{}),...(expansionEntry?{expansionEntry}:{}),project:projects.has(test.projectName)?test.projectName:'unknown',status:result.status,durationMs:typeof result.duration==='number'&&Number.isFinite(result.duration)&&result.duration>=0&&result.duration<=3600000?result.duration:null,category:/test timeout/i.test(prose)?'test_timeout':/timeout|timed out/i.test(prose)?'operation_timeout':/strict mode violation/i.test(prose)?'ambiguous_locator':/navigation|ERR_ABORTED/i.test(prose)?'navigation':/expect|AssertionError/i.test(prose)?'assertion':'case_failure',signatures:matched,mentionedAccessibilityRules});
   }
  }
  for(const key of ['suites','specs'])if(Array.isArray(row[key]))for(const child of row[key])walk(child,depth+1);
 }
 walk(raw,0);return failures;
}

/** Revalidate a captured child diagnostic instead of relaying its JSON or prose. */
export function pilotUiChildFailures(raw:unknown){
 if(typeof raw!=='string')return [];
 const failures:BrowserFailure[]=[];
 for(const line of raw.slice(-131072).split('\n').filter(line=>line.startsWith('{"kind":"pilot_ui_failure"')).slice(-4))try{
  const row=JSON.parse(line);if(!Array.isArray(row.failedLocations))continue;
  const report={specs:row.failedLocations.slice(0,10).map((value:any)=>({file:value?.file,line:value?.line,column:value?.column,tests:[{projectName:row.project,results:[{status:value?.status,duration:value?.durationMs,error:{message:Array.isArray(value?.signatures)?value.signatures.filter((s:unknown)=>typeof s==='string').slice(0,24).map((s:string)=>s.slice(0,128)).join(' '):''}}]}]}))};
  failures.push(...browserFailureMetadata(report,new Set(['pilot-workspace.spec.ts','pilot-uploads.spec.ts'])));
 }catch{/* An unavailable diagnostic cannot expose the child's private output. */}
 return failures.slice(0,10);
}

/** Same fixed formatter used by the actual partner CI runner. */
export function partnerBrowserFailureMetadata(raw:unknown){
 return browserFailureMetadata(raw,new Set(['partner-workspace.spec.ts','partner-guides.spec.ts','partner-learning.spec.ts','partner-revocation.spec.ts','partner-accessibility.spec.ts'])).slice(0,20);
}
