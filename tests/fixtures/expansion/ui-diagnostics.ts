import {test,type Page,type Request} from '@playwright/test';
import {fixedExpansionEntryObservation,type ExpansionEntryObservation} from '../../../scripts/ci-browser-diagnostics';

/** Observe the original journey; publish fixed metadata only after failure. */
export function installExpansionEntryDiagnostics(){
 type Event=ExpansionEntryObservation['events'][number];type Category=Event['category'];
 const states=new WeakMap<Page,{started:number;active:boolean;events:Event[];pending:Map<Request,{category:Category;started:number}>;actions:ExpansionEntryObservation['actions'];pageErrors:ExpansionEntryObservation['pageErrors']}>();
 test.beforeEach(async({page})=>{
  const state={started:Date.now(),active:true,events:[] as Event[],pending:new Map<Request,{category:Category;started:number}>(),actions:[] as ExpansionEntryObservation['actions'],pageErrors:[] as ExpansionEntryObservation['pageErrors']};states.set(page,state);
  const elapsed=()=>Math.max(0,Math.min(300000,Date.now()-state.started));
  const category=(request:Request):Category|null=>{try{if(request.method()!=='GET')return null;const path=new URL(request.url()).pathname;
   if(path==='/api/auth/session')return 'session';if(/^\/api\/expansion\/customers\/[^/]+$/.test(path))return 'overview';
   if(path.startsWith('/_next/')&&path.endsWith('.js'))return 'module_asset';if(request.resourceType()==='document'&&/^\/customers\/[^/]+\/expansion\/?$/.test(path))return 'document';return null;
  }catch{return null;}};
  const record=(category:Category,phase:Event['phase'],status:number|null=null)=>{if(state.active){state.events.push({category,phase,elapsedMs:elapsed(),status});if(state.events.length>16)state.events.shift();}};
  page.on('request',request=>{try{const c=category(request);if(c&&state.active){if(state.pending.size<64)state.pending.set(request,{category:c,started:Date.now()});record(c,'request');}}catch{}});
  page.on('response',response=>{try{const c=category(response.request());if(c)record(c,'headers',response.status());}catch{}});
  page.on('requestfinished',request=>{try{const c=category(request);state.pending.delete(request);if(c)record(c,'finished');}catch{}});
  page.on('requestfailed',request=>{try{const c=category(request);state.pending.delete(request);if(c)record(c,'failed');}catch{}});
  page.on('pageerror',error=>{if(!state.active)return;state.pageErrors.push(/ChunkLoadError|Loading chunk/i.test(error.message)?'chunk_load':/hydrat/i.test(error.message)?'hydration':error.name==='TypeError'?'type':error.name==='ReferenceError'?'reference':error.name==='SyntaxError'?'syntax':'other');if(state.pageErrors.length>4)state.pageErrors.shift();});
  const prefix='TURAS_EXPANSION_ENTRY ';
  page.on('console',message=>{try{const text=message.text();if(!state.active||!text.startsWith(prefix)||text.length>512)return;const action=JSON.parse(text.slice(prefix.length)),parsed=fixedExpansionEntryObservation({contract:'expansion-entry-observation-v1',elapsedMs:elapsed(),collectionError:'none',snapshot:null,events:[],pending:[],actions:[action],pageErrors:[]});if(parsed){state.actions.push(parsed.actions[0]);if(state.actions.length>8)state.actions.shift();}}catch{}});
  await page.addInitScript(({started,prefix})=>{
   let count=0;for(const [event,kind]of [['pointerdown','new_pointer'],['click','new_click']])document.addEventListener(event,value=>{const button=value.target instanceof Element?value.target.closest('button'):null;if(button?.textContent?.trim()==='New Hypothesis'&&count++<16)console.info(prefix+JSON.stringify({kind,elapsedMs:Math.max(0,Math.min(300000,Date.now()-started))}));},{capture:true,passive:true});
  },{started:state.started,prefix}).catch(()=>{/* Observation cannot replace a journey result. */});
 });
 test.afterEach(async({page},info)=>{
  const state=states.get(page);if(!state)return;state.active=false;if(info.status===info.expectedStatus){state.pending.clear();return;}
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   let collectionError:ExpansionEntryObservation['collectionError']=page.isClosed()?'page_closed':'none';
   const snapshot=page.isClosed()?null:await Promise.race([page.evaluate(()=>{
    const visible=(node:Element)=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return !node.closest('[hidden]')&&style.visibility!=='hidden'&&style.display!=='none'&&rect.width>0&&rect.height>0;};
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(node=>node.textContent?.trim()==='New Hypothesis'),button=buttons[0],rect=button?.getBoundingClientRect(),within=!!rect&&rect.x>=0&&rect.y>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,hit=rect?document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2):null;
    const statuses=Array.from(document.querySelectorAll('[role="status"]')).filter(visible).map(node=>node.textContent?.trim()??'');
    return {pathCategory:/^\/customers\/[^/]+\/expansion\/?$/.test(location.pathname)?'expansion' as const:/^\/(login|sign-in)\/?$/.test(location.pathname)?'login' as const:'other' as const,visibility:document.visibilityState==='visible'?'visible' as const:document.visibilityState==='hidden'?'hidden' as const:'unknown' as const,focused:document.hasFocus(),newCount:Math.min(8,buttons.length),newEnabled:buttons.some(node=>!node.disabled),newVisible:buttons.some(visible),newWithinViewport:within,newHitTarget:!!button&&!!hit&&(button===hit||button.contains(hit)),loadingVisible:statuses.some(text=>text==='Loading expansion opportunities…'||text==='Loading expansion scope…'),unavailableVisible:statuses.some(text=>text==='Expansion unavailable'||text==='Expansion is unavailable to your account.'),unconfirmedVisible:statuses.some(text=>text==='A previous command is unconfirmed. Check its status before continuing.')};
   }).catch(()=>{collectionError='collection_failed';return null;}),new Promise<null>(resolve=>{timer=setTimeout(()=>{collectionError='collection_timeout';resolve(null);},650);})]);
   clearTimeout(timer);const value=fixedExpansionEntryObservation({contract:'expansion-entry-observation-v1',elapsedMs:Math.max(0,Math.min(300000,Date.now()-state.started)),collectionError,snapshot,events:state.events,pending:[...state.pending.values()].slice(-8).map(item=>({category:item.category,elapsedMs:Math.max(0,Math.min(300000,Date.now()-item.started))})),actions:state.actions,pageErrors:state.pageErrors});
   if(value)await Promise.race([info.attach('expansion-entry-observation',{body:JSON.stringify(value),contentType:'application/json'}),new Promise<void>(resolve=>{timer=setTimeout(resolve,150);})]);
  }catch{/* Keep the original timeout, assertion, error and retry outcome. */}finally{clearTimeout(timer);state.pending.clear();}
 });
}
