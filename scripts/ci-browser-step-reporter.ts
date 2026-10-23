import {performance} from 'node:perf_hooks';
import type {Reporter,TestCase,TestResult,TestStep} from '@playwright/test/reporter';

const projects=['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark'];
const operations=['navigation','fill','click','focus','press','select','check','uncheck','wait_url','wait_load','http_get','http_post','assert','other'];
const sources=['case','expansion-fixture','common-ui-fixture','fixture','other'];
const integer=(v:unknown,max=3600000)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max?v:null;
const fixed=(v:unknown,allowed:readonly string[])=>typeof v==='string'&&allowed.includes(v)?v:'other';
function stepMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {operation:fixed(row.operation,operations),source:fixed(row.source,sources),line:integer(row.line,1000000),column:integer(row.column,1000000),elapsedMs:integer(row.elapsedMs),durationMs:integer(row.durationMs),ended:row.ended===true,failed:row.failed===true};
}
/** Revalidate child output before public CI emission. No titles, selectors,
 * input values, URLs, file paths, error prose or arbitrary fields survive. */
export function browserStepFailure(value:unknown){
 if(!value||typeof value!=='object')return;const row=value as Record<string,unknown>;
 if(row.kind!=='ci_browser_steps'||typeof row.project!=='string'||!projects.includes(row.project)||typeof row.status!=='string'||!['failed','timedOut','interrupted'].includes(row.status)||integer(row.caseLine,1000000)===null)return;
 return {kind:'ci_browser_steps',project:row.project as string,caseLine:row.caseLine as number,status:row.status as string,durationMs:integer(row.durationMs),retry:integer(row.retry,10),steps:Array.isArray(row.steps)?row.steps.slice(-64).map(stepMetadata):[]};
}
export function browserStepFailures(stderr:string){
 return stderr.split('\n').filter(line=>line.startsWith('{"kind":"ci_browser_steps"')&&line.length<=32768).slice(-3).flatMap(line=>{try{const value=browserStepFailure(JSON.parse(line));return value?[value]:[];}catch{return [];}});
}
export function browserStepOperation(title:unknown,category:unknown){
 if(category==='expect')return 'assert';if(typeof title!=='string')return 'other';
 const lower=title.trimStart().toLowerCase();
 const method=/^(?:(?:page|locator|request|apirequestcontext|browsercontext|browser|frame)\.)?([a-z]+)(?:\b|$)/.exec(lower)?.[1];
 if(method==='goto'||method==='navigate')return 'navigation';
 if(method==='dblclick')return 'click';if(method==='selectoption'||method==='select')return 'select';
 if(method&&['fill','click','focus','press','check','uncheck'].includes(method))return method;
 if(method==='waitforurl'||/^wait for url\b/.test(lower))return 'wait_url';
 if(method==='waitforloadstate'||/^wait for load state\b/.test(lower))return 'wait_load';
 if(/^(?:request|apirequestcontext)\.get\b/.test(lower))return 'http_get';
 if(/^(?:request|apirequestcontext)\.post\b/.test(lower))return 'http_post';
 return 'other';
}
function source(test:TestCase,step:TestStep){
 const file=step.location?.file.replace(/\\/g,'/');if(!file)return 'other';
 if(file===test.location.file.replace(/\\/g,'/'))return 'case';
 if(file.endsWith('/tests/fixtures/expansion/ui.ts'))return 'expansion-fixture';
 if(file.endsWith('/tests/fixtures/ui.ts'))return 'common-ui-fixture';
 return file.includes('/tests/fixtures/')?'fixture':'other';
}
type Observation=ReturnType<typeof stepMetadata>;
// elapsedMs is the reporter receipt clock from onTestBegin and can include
// worker fixture setup; it is not the Playwright test-budget clock.
type State={started:number;rows:Observation[];pending:Map<TestStep,Observation>};
/** Passive reporter: original actions, assertions, deadlines and retries are
 * owned by Playwright. Successful tests produce no diagnostic output. */
export default class BrowserStepReporter implements Reporter{
 private states=new WeakMap<TestCase,State>();
 onTestBegin(test:TestCase){try{this.states.set(test,{started:performance.now(),rows:[],pending:new Map()});}catch{/* Observation cannot change a test outcome. */}}
 onStepBegin(test:TestCase,_result:TestResult,step:TestStep){try{
  if(!['pw:api','expect'].includes(step.category))return;const state=this.states.get(test);if(!state)return;
  const row=stepMetadata({operation:browserStepOperation(step.title,step.category),source:source(test,step),line:step.location?.line,column:step.location?.column,elapsedMs:Math.max(0,Math.floor(performance.now()-state.started))});
  state.rows.push(row);state.pending.set(step,row);
  if(state.rows.length>64){const old=state.rows.shift();for(const [key,value]of state.pending)if(value===old){state.pending.delete(key);break;}}
 }catch{/* Observation cannot change a test outcome. */}}
 onStepEnd(test:TestCase,_result:TestResult,step:TestStep){try{const state=this.states.get(test),row=state?.pending.get(step);if(row){row.durationMs=integer(step.duration);row.ended=true;row.failed=Boolean(step.error);state!.pending.delete(step);}}catch{/* Observation cannot change a test outcome. */}}
 onTestEnd(test:TestCase,result:TestResult){try{const state=this.states.get(test);if(!state)return;const value=browserStepFailure({kind:'ci_browser_steps',project:test.parent.project()?.name,caseLine:test.location.line,status:result.status,durationMs:result.duration,retry:result.retry,steps:state.rows});if(value)process.stderr.write(JSON.stringify(value)+'\n');}catch{/* Preserve the original outcome if diagnostics are unavailable. */}finally{this.states.delete(test);}}
}
