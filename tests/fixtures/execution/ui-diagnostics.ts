import {test,type Page} from '@playwright/test';
import {fixedExecutionChangesObservation,type ExecutionChangesObservation} from '../../../scripts/ci-browser-diagnostics';

type Event=ExecutionChangesObservation['events'][number];
const observations=new WeakMap<Page,{started:number;active:boolean;events:Event[]}>();
const prefix='TURAS_EXECUTION_DOCUMENT ';
const overviewPath=(url:string)=>{try{return /^\/api\/execution\/engagements\/[^/]+$/.test(new URL(url).pathname);}catch{return false;}};
/** Passive, file-local observations. No interception, extra requests or UI actions. */
export function installExecutionChangesDiagnostics(){
 test.beforeEach(async({page})=>{
  const state={started:Date.now(),active:true,events:[] as Event[]};observations.set(page,state);
  const elapsed=()=>Math.max(0,Math.min(180000,Date.now()-state.started));
  const record=(event:Event)=>{if(state.active){state.events.push(event);if(state.events.length>16)state.events.shift();}};
  page.on('console',message=>{
   const text=message.text();if(!text.startsWith(prefix)||text.length>512)return;
   try{const event=JSON.parse(text.slice(prefix.length));const parsed=fixedExecutionChangesObservation({contract:'execution-changes-observation-v1',elapsedMs:elapsed(),collectionError:'none',snapshot:null,events:[event]});if(parsed)record(parsed.events[0]);}catch{/* Fixed metadata only. */}
  });
  page.on('pageerror',error=>record({category:'page_error',elapsedMs:elapsed(),error:/ChunkLoadError|Loading chunk/i.test(error.message)?'chunk_load':/hydrat/i.test(error.message)?'hydration':error.name==='TypeError'?'type':error.name==='ReferenceError'?'reference':error.name==='SyntaxError'?'syntax':'other'}));
  page.on('requestfailed',request=>{if(request.method()==='GET'&&overviewPath(request.url()))record({category:'overview',elapsedMs:elapsed(),status:null,error:'transport',initialized:null,reviewRequired:null,reconciliation:null,newEligible:null,baselineMismatch:null});});
  page.on('response',response=>{
   if(response.request().method()!=='GET'||!overviewPath(response.url())||!state.active)return;
   const status=response.status(),event:Extract<Event,{category:'overview'}>={category:'overview',elapsedMs:elapsed(),status,error:[401,403,404].includes(status)?'http_denied':status>=400?'http_error':'body_unavailable',initialized:null,reviewRequired:null,reconciliation:null,newEligible:null,baselineMismatch:null};record(event);
   if(status!==200)return;
   // The route itself caps its envelope at262144 bytes. No body/text is retained.
   if(Number(response.headers()['content-length'])>262144){event.error='oversized';return;}
   let timer:ReturnType<typeof setTimeout>;
   void Promise.race([response.body(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),300);})]).then(bytes=>{
    if(!state.active||bytes===null)return;if(bytes.length>262144){event.error='oversized';return;}
    try{const data=JSON.parse(bytes.toString('utf8'))?.data;
     if(!data||typeof data.initialized!=='boolean'||typeof data.reviewRequired!=='boolean'||!(data.reconciliation===null||typeof data.reconciliation==='object'&&typeof data.reconciliation.newEligible==='boolean')||typeof data.baselineId!=='string'||!(data.boundBaselineId===null||typeof data.boundBaselineId==='string')){event.error='body_invalid';return;}
     Object.assign(event,{error:'none',initialized:data.initialized,reviewRequired:data.reviewRequired,reconciliation:data.reconciliation!==null,newEligible:data.reconciliation?.newEligible??null,baselineMismatch:data.boundBaselineId!==null&&data.boundBaselineId!==data.baselineId});
    }catch{event.error='body_invalid';}
   }).catch(()=>{/* Unavailable transport stays a fixed unavailable category. */}).finally(()=>clearTimeout(timer));
  });
  await page.addInitScript(({started,prefix})=>{
   if(window!==window.top)return;let count=0;
   const observe=(category:'document'|'focus'|'blur'|'visibility')=>{if(count++>=16)return;console.info(prefix+JSON.stringify({category,elapsedMs:Math.max(0,Math.min(180000,Date.now()-started)),visibility:document.visibilityState==='visible'?'visible':document.visibilityState==='hidden'?'hidden':'unknown',focused:document.hasFocus(),pathCategory:/^\/customers\/[^/]+\/engagements\/[^/]+\/execution\/?$/.test(location.pathname)?'execution':/^\/(login|sign-in)\/?$/.test(location.pathname)?'login':'other'}));};
   observe('document');window.addEventListener('focus',()=>observe('focus'));window.addEventListener('blur',()=>observe('blur'));document.addEventListener('visibilitychange',()=>observe('visibility'));
  },{started:state.started,prefix}).catch(()=>{/* Diagnostics cannot replace a journey failure. */});
 });
 test.afterEach(async({page},info)=>{
  const state=observations.get(page);if(!state)return;state.active=false;
  if(info.status===info.expectedStatus)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   let collectionError:ExecutionChangesObservation['collectionError']=page.isClosed()?'page_closed':'none';
   const snapshot=page.isClosed()?null:await Promise.race([page.evaluate(()=>{
    const regions=Array.from(document.querySelectorAll<HTMLElement>('section[aria-label="Baseline Reconciliation"]'));
    const controls=(label:string)=>{const nodes=Array.from(document.querySelectorAll<HTMLSelectElement>('select')).filter(node=>node.getAttribute('aria-label')===label);return {count:Math.min(8,nodes.length),enabled:nodes.some(node=>!node.disabled)};};
    return {visibility:document.visibilityState==='visible'?'visible' as const:document.visibilityState==='hidden'?'hidden' as const:'unknown' as const,focused:document.hasFocus(),pathCategory:/^\/customers\/[^/]+\/engagements\/[^/]+\/execution\/?$/.test(location.pathname)?'execution' as const:/^\/(login|sign-in)\/?$/.test(location.pathname)?'login' as const:'other' as const,reconciliationCount:Math.min(8,regions.length),reconciliationVisible:regions.some(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0;}),mappingSelectCount:Math.min(64,regions.reduce((sum,node)=>sum+node.querySelectorAll('select').length,0)),controls:{workPackageProof:controls('Map work_package proof'),workPackageReadiness:controls('Map work_package readiness'),milestoneProofDone:controls('Map milestone proof_done'),milestoneReady:controls('Map milestone ready')}};
   }).catch(()=>{collectionError='collection_failed';return null;}),new Promise<null>(resolve=>{timer=setTimeout(()=>{collectionError='collection_timeout';resolve(null);},650);})]);
   clearTimeout(timer);const metadata=fixedExecutionChangesObservation({contract:'execution-changes-observation-v1',elapsedMs:Math.max(0,Math.min(180000,Date.now()-state.started)),collectionError,snapshot,events:state.events});
   if(metadata)await Promise.race([info.attach('execution-changes-observation',{body:JSON.stringify(metadata),contentType:'application/json'}),new Promise<void>(resolve=>{timer=setTimeout(resolve,150);})]);
  }catch{/* Preserve the original failure and clocks even if observation is unavailable. */}finally{clearTimeout(timer);}
 });
}
