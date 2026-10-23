import {test,type Page,type Request} from '@playwright/test';
import {fixedExecutionChangesObservation,type ExecutionChangesObservation,fixedExecutionWriteObservation,type ExecutionWriteObservation} from '../../../scripts/ci-browser-diagnostics';

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

/** Failure-only fixed write/read actionability. No interception or extra requests. */
export function installExecutionWriteDiagnostics(){
 type Event=ExecutionWriteObservation['events'][number];type Category=Event['category'];
 const states=new WeakMap<Page,{started:number;active:boolean;events:Event[];commands:Event[];actions:NonNullable<ExecutionWriteObservation['actions']>;pageErrors:NonNullable<ExecutionWriteObservation['pageErrors']>;pending:Map<Request,{category:Category;started:number}>}>();
 test.beforeEach(async({page})=>{
  const state={started:Date.now(),active:true,events:[] as Event[],commands:[] as Event[],actions:[] as NonNullable<ExecutionWriteObservation['actions']>,pageErrors:[] as NonNullable<ExecutionWriteObservation['pageErrors']>,pending:new Map<Request,{category:Category;started:number}>()};states.set(page,state);
  const elapsed=()=>Math.max(0,Math.min(300000,Date.now()-state.started));
  const category=(request:Request):Category|null=>{try{const u=new URL(request.url());
   if(request.method()==='POST'&&/^\/api\/execution\/engagements\/[^/]+\/commands$/.test(u.pathname)){const action=request.postDataJSON()?.action;return action==='record.create'?'create':action==='record.submit'?'submit':'command_other';}
   if(request.method()!=='GET')return null;if(u.pathname==='/api/auth/session')return 'session';
   if(/^\/api\/execution\/engagements\/[^/]+$/.test(u.pathname))return 'overview';if(/\/owners$/.test(u.pathname)&&u.pathname.startsWith('/api/execution/'))return 'owners';
   if(/\/records$/.test(u.pathname)&&u.pathname.startsWith('/api/execution/'))return u.searchParams.get('state')==='accepted'?'accepted':u.searchParams.get('kind')==='activity'?'activity':'delivery';
   return u.pathname.startsWith('/api/execution/')?'read_other':null;
  }catch{return null;}};
  const record=(category:Category,phase:Event['phase'],status:number|null=null)=>{if(state.active){const event={category,phase,elapsedMs:elapsed(),status};state.events.push(event);if(state.events.length>16)state.events.shift();if(['create','submit','command_other'].includes(category)){state.commands.push(event);if(state.commands.length>8)state.commands.shift();}}};
  const actionPrefix='TURAS_EXECUTION_WRITE_ACTION ';
  page.on('console',message=>{try{const text=message.text();if(!state.active||!text.startsWith(actionPrefix)||text.length>512)return;const action=JSON.parse(text.slice(actionPrefix.length)),parsed=fixedExecutionWriteObservation({contract:'execution-write-observation-v1',elapsedMs:elapsed(),collectionError:'none',snapshot:null,events:[],pending:[],actions:[action]});if(parsed?.actions){state.actions.push(parsed.actions[0]);if(state.actions.length>8)state.actions.shift();}}catch{}});
  page.on('pageerror',error=>{if(!state.active)return;state.pageErrors.push(/ChunkLoadError|Loading chunk/i.test(error.message)?'chunk_load':/hydrat/i.test(error.message)?'hydration':error.name==='TypeError'?'type':error.name==='ReferenceError'?'reference':error.name==='SyntaxError'?'syntax':'other');if(state.pageErrors.length>4)state.pageErrors.shift();});
  await page.addInitScript(({started,prefix})=>{
   let count=0;const field=(node:Element)=>{const label=Array.from((node as HTMLInputElement).labels??[]).map(v=>v.textContent?.trim()??'').join(' ');return label.startsWith('Delivery title')?'title':label.startsWith('Delivery context')?'context':label.startsWith('Event date')?'event_date':label.startsWith('Event time zone')?'timezone':label.startsWith('Unknown delivery owner reason')?'owner_reason':label.startsWith('Effort work package')?'work_package':/^(Remaining|Budget) minutes/.test(label)?'minutes':label.startsWith('Estimate as of (UTC)')?'as_of':'other';};
   const record=(kind:string,fieldName='none')=>{if(count++<32)console.info(prefix+JSON.stringify({kind,field:fieldName,elapsedMs:Math.max(0,Math.min(300000,Date.now()-started))}));};
   const button=(event:{target:EventTarget|null})=>event.target instanceof Element?event.target.closest('button'):null;
   document.addEventListener('pointerdown',event=>{const node=button(event),name=node?.textContent?.trim();if(name==='Save delivery draft')record('save_pointer');if(name==='Submit delivery record')record('submit_pointer');},{capture:true,passive:true});
   document.addEventListener('click',event=>{const node=button(event),name=node?.textContent?.trim();if(name==='Save delivery draft')record('save_click');if(name==='Submit delivery record')record('submit_click');},{capture:true,passive:true});
   document.addEventListener('submit',event=>{if(event.target instanceof Element&&event.target.closest('section[aria-label="Delivery Records"]'))record('form_submit');},{capture:true,passive:true});
   document.addEventListener('invalid',event=>{if(event.target instanceof Element&&event.target.closest('section[aria-label="Delivery Records"]'))record('invalid',field(event.target));},{capture:true,passive:true});
  },{started:state.started,prefix:actionPrefix}).catch(()=>{/* Observation cannot affect a journey. */});
  page.on('request',request=>{try{const c=category(request);if(c&&state.active){if(state.pending.size<64)state.pending.set(request,{category:c,started:Date.now()});record(c,'request');}}catch{}});
  page.on('response',response=>{try{const c=category(response.request());if(c)record(c,'response',response.status());}catch{}});
  page.on('requestfinished',request=>{try{const c=category(request);state.pending.delete(request);if(c)record(c,'finished');}catch{}});
  page.on('requestfailed',request=>{try{const c=category(request);state.pending.delete(request);if(c)record(c,'failed');}catch{}});
 });
 test.afterEach(async({page},info)=>{
  const state=states.get(page);if(!state)return;state.active=false;if(info.status===info.expectedStatus)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   let collectionError:ExecutionWriteObservation['collectionError']=page.isClosed()?'page_closed':'none';
   const snapshot=page.isClosed()?null:await Promise.race([page.evaluate(()=>{
    const visible=(node:Element)=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return !node.closest('[hidden]')&&style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0;};
    const buttons=(text:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(n=>n.textContent?.trim()===text);
    const control=(text:string)=>{const nodes=buttons(text);return {count:Math.min(8,nodes.length),enabled:nodes.some(n=>!n.disabled)};};
    const status=Array.from(document.querySelectorAll('[role="status"]')).filter(visible),panel=document.getElementById('execution-panel');
    const recordStates={draft:0,submitted:0,accepted:0,other:0};for(const node of Array.from(document.querySelectorAll('article[aria-label^="Delivery record "] .profile-eyebrow')).slice(0,64)){const value=node.textContent?.trim();if(value==='draft'||value==='submitted'||value==='accepted')recordStates[value]++;else recordStates.other++;}
    const invalid=Array.from(document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('section[aria-label="Delivery Records"] form input,section[aria-label="Delivery Records"] form textarea,section[aria-label="Delivery Records"] form select')).filter(n=>!n.validity.valid);
    const invalidFields=invalid.slice(0,8).map(node=>{const label=Array.from(node.labels??[]).map(v=>v.textContent?.trim()??'').join(' ');return label.startsWith('Delivery title')?'title' as const:label.startsWith('Delivery context')?'context' as const:label.startsWith('Event date')?'event_date' as const:label.startsWith('Event time zone')?'timezone' as const:label.startsWith('Unknown delivery owner reason')?'owner_reason' as const:label.startsWith('Effort work package')?'work_package' as const:/^(Remaining|Budget) minutes/.test(label)?'minutes' as const:label.startsWith('Estimate as of (UTC)')?'as_of' as const:'other' as const;});
    return {visibility:document.visibilityState==='visible'?'visible' as const:document.visibilityState==='hidden'?'hidden' as const:'unknown' as const,focused:document.hasFocus(),pathCategory:/^\/customers\/[^/]+\/engagements\/[^/]+\/execution\/?$/.test(location.pathname)?'execution' as const:/^\/(login|sign-in)\/?$/.test(location.pathname)?'login' as const:'other' as const,panelPresent:!!panel,panelHidden:!!panel&&!visible(panel),save:control('Save delivery draft'),submit:control('Submit delivery record'),submitVisible:buttons('Submit delivery record').some(visible),uncertainVisible:buttons('Check save receipt').some(visible),savedVisible:status.some(n=>['Saved.','Save confirmed.','Saved. Refresh to read the current result.','Save confirmed. Refresh to read the current result.'].includes(n.textContent?.trim()??'')),refreshVisible:buttons('Refresh execution').some(visible),writesDisabledVisible:status.some(n=>n.textContent?.trim()==='Execution changes are temporarily disabled. Reviewed history remains readable.'),invalidControlCount:Math.min(64,invalid.length),invalidFields,commandDeniedVisible:status.some(n=>n.textContent?.trim()==='Current access unavailable. Sign in or refresh access.'),recordStates};
   }).catch(()=>{collectionError='collection_failed';return null;}),new Promise<null>(resolve=>{timer=setTimeout(()=>{collectionError='collection_timeout';resolve(null);},650);})]);
   clearTimeout(timer);const metadata=fixedExecutionWriteObservation({contract:'execution-write-observation-v1',elapsedMs:Math.max(0,Math.min(300000,Date.now()-state.started)),collectionError,snapshot,events:state.events,commands:state.commands,actions:state.actions,pageErrors:state.pageErrors,pending:[...state.pending.values()].slice(-8).map(value=>({category:value.category,elapsedMs:Math.max(0,Math.min(300000,Date.now()-value.started))}))});
   if(metadata)await Promise.race([info.attach('execution-write-observation',{body:JSON.stringify(metadata),contentType:'application/json'}),new Promise<void>(resolve=>{timer=setTimeout(resolve,150);})]);
  }catch{/* Preserve the original journey failure. */}finally{clearTimeout(timer);state.pending.clear();}
 });
}
