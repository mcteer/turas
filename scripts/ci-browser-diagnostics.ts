export const knownBrowserPhases=new Set(['Reload retained failed history','Verify retained file after reload','Open learning draft','Prepare learning draft','Verify learning draft','Audit learning draft','Cancel learning draft','Verify learning partner denial','Prepare absent request assignment','Prepare absent request draft','Dispatch absent request draft','Verify unresolved absent request','Reload absent request assignment','Verify absent request after reload','Resolve absent request fence','Audit absent request outcome']);
export function fixedBrowserPhases(raw:unknown){return Array.isArray(raw)?[...new Set(raw.filter((value):value is string=>typeof value==='string'&&knownBrowserPhases.has(value)))].slice(0,8):[];}
import axe from 'axe-core';
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
type BrowserFailure={file:string;line:number;column:number;project:string;status:string;durationMs:number|null;category:string;signatures:string[];mentionedAccessibilityRules:string[];phases?:string[];utilization?:UtilizationMetadata};
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
    failures.push({...location,...(phases.size?{phases:[...phases].sort()}:{}),...(utilization?{utilization}:{}),project:projects.has(test.projectName)?test.projectName:'unknown',status:result.status,durationMs:typeof result.duration==='number'&&Number.isFinite(result.duration)&&result.duration>=0&&result.duration<=3600000?result.duration:null,category:/test timeout/i.test(prose)?'test_timeout':/timeout|timed out/i.test(prose)?'operation_timeout':/strict mode violation/i.test(prose)?'ambiguous_locator':/navigation|ERR_ABORTED/i.test(prose)?'navigation':/expect|AssertionError/i.test(prose)?'assertion':'case_failure',signatures:matched,mentionedAccessibilityRules});
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
