import axe from 'axe-core';
type BrowserFailure={file:string;line:number;column:number;project:string;status:string;durationMs:number|null;category:string;signatures:string[];mentionedAccessibilityRules:string[];phases?:string[]};
const accessibilityRules=new Set(axe.getRules().map(rule=>rule.ruleId));
const projects=new Set(['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark']);
const signatures=['Test timeout','Timeout','toBeVisible','toBeFocused','toHaveCount','toEqual','strict mode violation','navigation interrupted','ERR_ABORTED','ECONNREFUSED','Execution context was destroyed','page.reload','page.goto','Target page, context or browser has been closed','WebKit encountered an internal error','Frame load interrupted','Load failed'] as const;
/** Fixed metadata only: never publish titles, error prose, DOM, attachments or stdout. */
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
    const phases=new Set<string>(),knownPhases=new Set(['Reload retained failed history','Verify retained file after reload']);
    const steps=Array.isArray(result.steps)?result.steps.slice(0,1000):[];
    for(let inspected=0;steps.length&&inspected<1000;inspected++){const step=steps.shift();if(!step||typeof step!=='object')continue;if(step.error&&typeof step.title==='string'&&knownPhases.has(step.title))phases.add(step.title);if(Array.isArray(step.steps))steps.push(...step.steps.slice(0,1000-steps.length));}
    const matched=signatures.filter(signature=>prose.toLowerCase().includes(signature.toLowerCase()));
    const mentionedAccessibilityRules=[...new Set([...prose.matchAll(/"([a-z][a-z0-9-]{1,79})"/g)].map(match=>match[1]).filter(id=>accessibilityRules.has(id)))].slice(0,8);
    failures.push({...location,...(phases.size?{phases:[...phases].sort()}:{}),project:projects.has(test.projectName)?test.projectName:'unknown',status:result.status,durationMs:typeof result.duration==='number'&&Number.isFinite(result.duration)&&result.duration>=0&&result.duration<=3600000?result.duration:null,category:/test timeout/i.test(prose)?'test_timeout':/timeout|timed out/i.test(prose)?'operation_timeout':/strict mode violation/i.test(prose)?'ambiguous_locator':/navigation|ERR_ABORTED/i.test(prose)?'navigation':/expect|AssertionError/i.test(prose)?'assertion':'case_failure',signatures:matched,mentionedAccessibilityRules});
   }
  }
  for(const key of ['suites','specs'])if(Array.isArray(row[key]))for(const child of row[key])walk(child,depth+1);
 }
 walk(raw,0);return failures;
}
