import {captureOwnedWorkflowMetadata} from './owned-workflow-diagnostics';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {Client} from 'pg';
import {webkit} from 'playwright';
import {Client as NativeClient} from 'eve/client';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
import {ordinaryNativeFileFixtureMaximumMs,waitForNativeFileFixtureResponse} from '../tests/fixtures/ordinary-native-file-steering';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Unpaid native file check requires empty provider credentials');
const authored=resolve('agent/agent.ts'),authoredDigest=createHash('sha256').update(await readFile(authored)).digest('hex');
const out=resolve('local-artifacts/legacy-parity-native-files');await mkdir(out,{recursive:true,mode:0o700});
const image='pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f';
const docker=(args:string[])=>spawnSync('docker',args,{encoding:'utf8'});
const fixtureOwner='turas-native-file-'+randomUUID();
let marker:string|undefined;
let fixturePhase='owned_environment_preparation';
const fixtureDeadlineAt=Date.now()+ordinaryNativeFileFixtureMaximumMs;
try{await withPlanEvalEnvironment(async environment=>{
 environment.bootstrapDemo();
 const path=join(environment.appRoot,'agent/agent.ts'),source=await readFile(path,'utf8');
 const target='return selectTurasGatewayModel(wrapOrdinaryChatModel(parityBudgetModel(gateway(selectedModel),selectedModel),principal,ctx.session.id,turnId));';
 if(source.split(target).length!==2)throw Error('Authored model shape changed');
 await writeFile(path,'import {createOrdinaryNativeFileFixtureModel} from "../tests/fixtures/ordinary-native-file-model";\n'+source.replace(target,'return {...selectTurasGatewayModel(wrapOrdinaryChatModel(createOrdinaryNativeFileFixtureModel(String(principal?.attributes?.turasAttemptId)),principal,ctx.session.id,turnId)),modelContextWindowTokens:128_000};'),{mode:0o600});
 // Exercise the installed framework's real interrupted-step retry only in
 // this owned staged-10 copy. No runtime fault flag exists in the application.
 const interruptedStepMarker=join(environment.appRoot,'.eve','native-file-interruption.json');
 if(process.argv.includes('--staged-10')){
  const hookPath=join(environment.appRoot,'agent/hooks/persist-conversation.ts'),hook=await readFile(hookPath,'utf8');
  const target='await projectNativeEvent(ctx.session.id, attemptId, projectEveFact(ctx.session.id,event,ctx.position,ctx.now.toISOString(),ctx.view),ctx.position.line);';
  if(hook.split(target).length!==2)throw Error('Owned interruption hook shape changed');
  const addition=`
        const eventBytes=Buffer.byteLength(JSON.stringify(event));
        appendFileSync(${JSON.stringify(interruptedStepMarker+'.stream-metrics')},JSON.stringify({type:event.type,eventBytes,base64Bytes:Math.ceil(eventBytes/3)*4})+'\\n');
        if(event.type==='delivery.consumed'&&!existsSync(${JSON.stringify(interruptedStepMarker)})){
          const captured=(await query("SELECT a.input_event_id,a.input_digest,a.native_delivery_id,a.deadline_at,(SELECT count(*) FROM ordinary_model_operations WHERE attempt_id=a.id) AS operations FROM response_attempts a WHERE a.id=$1",[attemptId])).rows[0];
          writeFileSync(${JSON.stringify(interruptedStepMarker)},JSON.stringify(captured),{flag:'wx',mode:0o600});
          console.error('OWNED_NATIVE_FILE_POST_RECEIVED_INTERRUPTION');
          await new Promise<void>(()=>{});
        }`;
  await writeFile(hookPath,'import {existsSync,writeFileSync,appendFileSync} from "node:fs";\nimport {query} from "../../lib/server/db/client";\n'+hook.replace(target,target+addition),{mode:0o600});
 }
 const fixtureOwnerUrl=process.env.DATABASE_URL!,fixtureCustomerId=randomUUID();
 const owner=new Client({connectionString:fixtureOwnerUrl});await owner.connect();try{await owner.query(`CREATE TABLE ordinary_native_file_fixture_calls(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES response_attempts(id),bytes_digest text NOT NULL,tool_names text[] NOT NULL DEFAULT '{}');CREATE TABLE ordinary_native_file_fixture_resolutions(attempt_id uuid PRIMARY KEY REFERENCES response_attempts(id),customer_id uuid NOT NULL REFERENCES customer_references(id));GRANT SELECT,INSERT ON ordinary_native_file_fixture_calls,ordinary_native_file_fixture_resolutions TO turas_runtime`);}finally{await owner.end();}
 const runtime=new URL(process.env.DATABASE_URL!);runtime.searchParams.set('options','-c role=turas_runtime');await closeRuntimePool();process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_TEST_DATABASE_URL=runtime.href;
 process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE='1';
 process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE_DEADLINE_AT=String(fixtureDeadlineAt);
 if(process.argv.includes('--steer'))process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE='1';
 if(process.argv.includes('--memory')||process.argv.includes('--memory-files'))process.env.TURAS_ORDINARY_MEMORY_FIXTURE='1';
 if(process.argv.includes('--memory-files'))process.env.TURAS_ORDINARY_MEMORY_FILE_FIXTURE='1';
 if(process.argv.includes('--task-state'))process.env.TURAS_ORDINARY_TASK_STATE_FIXTURE='1';
 await environment.start();
 const browser=await webkit.launch({headless:true}),context=await browser.newContext({baseURL:environment.origin});let csrf:string|undefined;
 const fileResponses:{kind:'file'|'native';method:string;status:number;chunk:number|null;code?:string}[]=[];
 let inspectFileUi:()=>Promise<unknown>=async()=>null;
 let captureFailurePage:()=>Promise<unknown>=async()=>null;
 context.on('response',async response=>{
  const url=new URL(response.url()),method=response.request().method(),file=url.pathname.includes('/native-uploads/'),native=url.pathname.startsWith('/eve/v1/');if(url.origin!==environment.origin||!file&&!native)return;
  const chunk=/\/chunks\/(\d+)$/.exec(url.pathname),entry={kind:file?'file' as const:'native' as const,method,status:response.status(),chunk:chunk?Number(chunk[1]):null,code:undefined as string|undefined};fileResponses.push(entry);if(fileResponses.length>64)fileResponses.shift();
  if(!response.ok())try{const body=await response.json();if(typeof body.code==='string'&&/^[a-zA-Z0-9_]{1,80}$/.test(body.code))entry.code=body.code;}catch{/* A failed transport need not contain JSON. */}
 });
 try{
  const login=await context.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'panel',password:process.env.PANEL_PASSWORD}});if(!login.ok())throw Error('Fixture login failed');csrf=(await login.json()).data.csrfToken;
  const seed=new Client({connectionString:fixtureOwnerUrl});await seed.connect();try{await seed.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Native file fixture customer',false)",[fixtureCustomerId,DEMO_IDS.workspace]);}finally{await seed.end();}
  const headers={origin:environment.origin,'x-csrf-token':csrf!},operationId=randomUUID();
  let id:string,native:string|undefined;
  const firstPrompt=process.argv.includes('--memory')||process.argv.includes('--memory-files')?'Remember that I prefer concise answers.':'Please inspect this native file.';
  // Keep a real decodable 32x32 PNG under the staged byte-size padding.
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3NMQ0AAAwDoPo33arYsQQMkB6LQCAQCAQCgUAg+BIMi1X0pjxKe0gAAAAASUVORK5CYII=','base64');
  const boundaryMiB=process.argv.includes('--staged-10')?10:process.argv.includes('--staged-4')?4:0;
  if(boundaryMiB&&!process.argv.includes('--composer'))throw Error('Large-file boundary requires the real browser composer');
  // PNG permits trailing data. Keep an actual decodable image while exercising
  // the original byte-size boundary through browser, HTTP, Eve and provider.
  const bytes=boundaryMiB?Buffer.concat([pixel,Buffer.alloc(boundaryMiB*1024*1024-pixel.length,0x5a)]):pixel;
  let page=await context.newPage();
  inspectFileUi=async()=>({cards:await page.locator('.chat-file-card').evaluateAll(cards=>cards.slice(0,4).map(card=>({downloadPresent:Boolean(card.querySelector('a[download]')),loading:Boolean(card.querySelector('button:disabled')),errorPresent:Boolean(card.querySelector('[role="alert"]'))}))),alerts:(await page.getByRole('alert').allTextContents()).slice(0,4).map(value=>value.slice(0,200)),sendRequestBytes,syntheticPageText:(await page.locator('body').innerText({timeout:1000})).slice(-2000)});
  captureFailurePage=()=>page.screenshot({path:join(out,'failure-page-private.png'),animations:'disabled',timeout:1000,mask:[page.locator('input[type="password"]')]});
  const uploadRequestBytes:number[]=[],sendRequestBytes:number[]=[];
  const captureRequest=(request:import('@playwright/test').Request)=>{if(!['POST','PUT'].includes(request.method()))return;
    if(request.url().includes('/native-uploads'))uploadRequestBytes.push(request.postDataBuffer()?.byteLength??0);
    if(/\/eve\/v1\/session\/wrun_[^/]+$/.test(request.url()))sendRequestBytes.push(request.postDataBuffer()?.byteLength??0);
  };page.on('request',captureRequest);
  let attachmentMutationBlockedDuringUpload=false;
  let readyDraftRemovalReleasedQuota=false,uncertainDraftRemovalPreserved=false;
  const submitWhileUploadPaused=async(filename:string)=>{
   fixturePhase='staged_upload_pause';
   let resume!:()=>void,started!:()=>void;
   const released=new Promise<void>(resolve=>{resume=resolve;}),paused=new Promise<void>(resolve=>{started=resolve;});
   await page.route('**/native-uploads/*/chunks/0',async route=>{started();await released;await route.continue();},{times:1});
   const clicked=page.getByRole('button',{name:'Send message',exact:true}).click();
   try{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([paused,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Upload chunk did not reach the pause boundary')),30000);})]);}
    finally{if(timer)clearTimeout(timer);}
    if(!await page.getByRole('button',{name:`Remove ${filename}`,exact:true}).isDisabled()||
       !await page.getByRole('button',{name:'Add attachments',exact:true}).isDisabled())throw Error('Attachment mutation remained enabled during a staged send');
    attachmentMutationBlockedDuringUpload=true;
   }finally{resume();await clicked;}
  };
  if(process.argv.includes('--composer')){
   // Compile the actual thread surface before starting the paused provider.
   // This avoids measuring a cold development compile as correction latency.
   const warmupKey=randomUUID(),warmup=await context.request.post('/api/conversations',{headers,data:{requestKey:warmupKey}});if(!warmup.ok())throw Error('Thread warmup creation failed');
   const warmupId=(await warmup.json()).data.id;
   const warmupBinding=await context.request.post('/eve/v1/session',{headers:{...headers,'x-turas-conversation-id':warmupId},data:{operationId:warmupKey}});if(!warmupBinding.ok())throw Error('Thread warmup binding failed');
   fixturePhase='warmup_thread_compile';
   const threadCompiled=await context.request.get('/s/'+warmupId,{timeout:90000});
   if(threadCompiled.status()!==200)throw Error('Owned thread compile request failed');
   // Compile native-upload handlers without reserving or sending any file.
   // The random nonexistent upload produces only the ordinary scoped 404 reads.
   fixturePhase='warmup_upload_routes';const unusedUpload=randomUUID(),uploadPath='/api/conversations/'+warmupId+'/native-uploads';
   for(const [path,status] of [[uploadPath,405],[uploadPath+'/'+unusedUpload,404],[uploadPath+'/'+unusedUpload+'/chunks/0',404]] as const){
    const compiled=await context.request.get(path,{timeout:90000});if(compiled.status()!==status)throw Error('Owned native upload route compile failed');
   }
   fixturePhase='initial_thread_navigation';
   await page.goto('/s/'+warmupId,{waitUntil:'domcontentloaded'});
   fixturePhase='native_file_interaction';
   await page.getByLabel('Message Turi').waitFor({timeout:60000});
   if(boundaryMiB){
    // SSR textarea visibility does not mean the first document's draft effect
    // has run. Set the reload fixture only after actual composer hydration.
    await page.waitForFunction(()=>{const input=document.querySelector<HTMLInputElement>('input[type="file"][aria-label="Chat document files"]');return input&&!input.disabled;},null,{timeout:30000});
    const readyBytes=Buffer.alloc(1024*1024,0x62),key=randomUUID(),path='/api/conversations/'+warmupId+'/native-uploads';
    const intent=await context.request.post(path,{headers,data:{requestKey:key,filename:'unused.bin',mediaType:'application/octet-stream',size:readyBytes.length,sha256:createHash('sha256').update(readyBytes).digest('hex')}});
    if(!intent.ok())throw Error('Restored draft upload reservation failed');
    const uploadId=(await intent.json()).data.data.slice('turas-upload:'.length);
    for(let offset=0,index=0;offset<readyBytes.length;offset+=512*1024,index++)if(!(await context.request.put(path+'/'+uploadId+'/chunks/'+index,{headers,data:readyBytes.subarray(offset,offset+512*1024)})).ok())throw Error('Restored draft chunk failed');
    const finished=await context.request.post(path+'/'+uploadId,{headers});if(!finished.ok())throw Error('Restored draft completion failed');const reference=(await finished.json()).data;
    await page.evaluate(({id,reference,key})=>sessionStorage.setItem('turas-chat-draft:'+id,JSON.stringify({text:[{type:'text',text:'Unused staged draft.'},reference],requestKey:key,autoSend:false})),{id:warmupId,reference,key});
    await page.reload();await page.getByRole('button',{name:'Remove unused.bin',exact:true}).waitFor();
    await page.route('**/native-uploads/'+uploadId,async route=>{if(route.request().method()==='DELETE'){await route.fetch();await route.abort('connectionfailed');}else await route.continue();},{times:1});
    await page.getByRole('button',{name:'Remove unused.bin',exact:true}).click();
    await page.getByText('File removal could not be confirmed. The attachment remains visible; retry removal to check its status.',{exact:true}).waitFor();
    if(!await page.getByRole('button',{name:'Remove unused.bin',exact:true}).isVisible())throw Error('An uncertain removal discarded its draft');uncertainDraftRemovalPreserved=true;
    await page.getByRole('button',{name:'Remove unused.bin',exact:true}).click();
    await page.getByRole('button',{name:'Remove unused.bin',exact:true}).waitFor({state:'detached'});
    const retained=(await query("SELECT state,(SELECT count(*)::int FROM ordinary_native_upload_chunks WHERE upload_id=u.id) AS chunks FROM ordinary_native_uploads u WHERE id=$1",[uploadId])).rows[0];
    if(retained?.state!=='cancelled'||retained.chunks!==0)throw Error('Removing an unused staged draft did not release its reserved bytes');readyDraftRemovalReleasedQuota=true;
   }
   // Steer on the existing thread so the same composer owns both sends.
   if(!process.argv.includes('--steer')){await page.close();page=await context.newPage();page.on('request',captureRequest);await page.goto('/s',{waitUntil:'domcontentloaded'});await page.waitForURL('/s');}
   await page.waitForFunction(()=>{const input=document.querySelector<HTMLInputElement>('input[type="file"][aria-label="Chat document files"]');return input&&!input.disabled;},null,{timeout:30000});
   await page.getByLabel('Message Turi').fill(firstPrompt);
   await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:bytes});
   await page.getByRole('button',{name:'Remove pixel.png'}).waitFor({timeout:20000});
   if(boundaryMiB)await submitWhileUploadPaused('pixel.png');else await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.waitForURL(/\/s\/[0-9a-f-]+$/,{timeout:30000});
   await page.getByRole('button',{name:'Remove pixel.png',exact:true}).waitFor({state:'detached',timeout:10000});
   id=new URL(page.url()).pathname.split('/').at(-1)!;
   const saved=await context.request.get('/api/conversations/'+id);if(!saved.ok())throw Error('Composer conversation unavailable');native=(await saved.json()).data.eveSessionId;
   if(!native)throw Error('Composer native binding unavailable');
   if(process.argv.includes('--staged-10')){
    fixturePhase='restart_after_native_receipt';const end=Date.now()+30000;
    for(;;){try{await readFile(interruptedStepMarker,'utf8');break;}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;if(Date.now()>end)throw Error('Owned interruption receipt missing');await new Promise(resolve=>setTimeout(resolve,100));}}
    await captureOwnedWorkflowMetadata(environment.appRoot,[native],join(out,'workflow-before-restart-private.json'));
    await environment.restart();
    await captureOwnedWorkflowMetadata(environment.appRoot,[native],join(out,'workflow-after-start-private.json'));
    await page.reload({waitUntil:'domcontentloaded'});
   }
  }else{
  const created=await context.request.post('/api/conversations',{headers,data:{requestKey:operationId}});if(!created.ok())throw Error('Fixture conversation creation failed');id=(await created.json()).data.id;
  for(let i=0;i<5;i++){const response=await context.request.post('/eve/v1/session',{headers:{...headers,'x-turas-conversation-id':id},data:{operationId}});if(response.ok()){native=(await response.json()).sessionId;break;}if(response.status()!==409)throw Error('Native binding failed');await new Promise(resolve=>setTimeout(resolve,1000));}if(!native)throw Error('Native binding unconfirmed');
  fixturePhase='warmup_thread_compile';const compiled=await context.request.get('/s/'+id,{timeout:90000});if(compiled.status()!==200)throw Error('Owned thread compile request failed');
  fixturePhase='native_file_interaction';
  const sent=await context.request.post('/eve/v1/session/'+native,{headers:{...headers,'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message:process.argv.includes('--memory')?firstPrompt:[{type:'text',text:firstPrompt},{type:'file',filename:'pixel.png',mediaType:'image/png',data:'data:image/png;base64,'+bytes.toString('base64')}]}});
  if(!sent.ok()){await writeFile(join(out,'send-private.json'),JSON.stringify({status:sent.status(),body:await sent.text()}),{mode:0o600});throw Error('Native file send rejected');}
  }
  if(process.argv.includes('--steer')){
   const deadline=Date.now()+90000;while(!(await query('SELECT 1 FROM ordinary_native_file_fixture_calls')).rowCount){const state=(await query('SELECT response_state,last_error_code FROM response_attempts WHERE conversation_id=$1',[id])).rows[0];if(state?.response_state==='failed')throw Error('Original response failed: '+String(state.last_error_code??'unknown'));if(Date.now()>deadline)throw Error('Original provider did not start');await new Promise(resolve=>setTimeout(resolve,100));}
   if(process.argv.includes('--composer')){
    await page.getByLabel('Message Turi').fill('Correct this using the attached file.');
    await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'corrected.png',mimeType:'image/png',buffer:bytes});
    await page.getByRole('button',{name:'Remove corrected.png'}).waitFor({timeout:10000});
    const correctionRequest=page.waitForRequest(request=>request.method()==='POST'&&request.url()===environment.origin+'/eve/v1/session/'+native,{timeout:Math.max(1,fixtureDeadlineAt-Date.now())});
    const [delivery]=await Promise.all([waitForNativeFileFixtureResponse(correctionRequest,fixtureDeadlineAt),boundaryMiB?submitWhileUploadPaused('corrected.png'):page.getByRole('button',{name:'Send message',exact:true}).click()]);
    if(!delivery||!delivery.ok())throw Error('Composer file correction rejected');
    await page.getByLabel('Message Turi').fill('Keep this next unsent draft.');
   }else{
   const correction=await context.request.post('/eve/v1/session/'+native,{headers:{...headers,'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{turnPolicy:'steer',message:[{type:'text',text:'Correct this using the attached file.'},{type:'file',filename:'corrected.png',mediaType:'image/png',data:'data:image/png;base64,'+bytes.toString('base64')}]}});
   if(!correction.ok()){await writeFile(join(out,'send-private.json'),JSON.stringify({status:correction.status(),body:await correction.text()}),{mode:0o600});throw Error('File correction rejected');}
   }
  }
  const until=Date.now()+60000;let completed=false;while(Date.now()<until){const rows=(await query('SELECT response_state FROM response_attempts WHERE conversation_id=$1',[id])).rows;if(rows.some(row=>row.response_state==='completed')){completed=true;break;}if(rows.some(row=>row.response_state==='failed'))throw Error('Native file response failed');await new Promise(resolve=>setTimeout(resolve,100));}
  if(!completed)throw Error('Native file response timed out');
  if(process.argv.includes('--composer')&&process.argv.includes('--steer')&&await page.getByLabel('Message Turi').inputValue()!=='Keep this next unsent draft.')throw Error('Completing the previous send erased the next draft');
  const calls=(await query('SELECT bytes_digest,tool_names FROM ordinary_native_file_fixture_calls')).rows;
  if((process.argv.includes('--steer')?calls.length<2:calls.length!==(process.argv.includes('--memory')||process.argv.includes('--memory-files')||process.argv.includes('--task-state')?3:2))||calls.some(call=>call.bytes_digest!==createHash('sha256').update(process.argv.includes('--memory')?Buffer.alloc(0):bytes).digest('hex')))throw Error('Provider file bytes differ');
  if(process.argv.includes('--steer')){const projected=(await query('SELECT native_event_id FROM ordinary_steering_deliveries d JOIN response_attempts a ON a.id=d.attempt_id WHERE a.conversation_id=$1',[id])).rows;if(projected.length!==1||!projected[0].native_event_id)throw Error('Native file correction was not consumed');if(Number((await query('SELECT count(*) AS n FROM response_attempts WHERE conversation_id=$1',[id])).rows[0].n)!==1)throw Error('Correction created a second response allowance');}
  const resolutions=(await query('SELECT customer_id FROM ordinary_native_file_fixture_resolutions')).rows;if(resolutions.length!==1||resolutions[0].customer_id!==fixtureCustomerId)throw Error('Actual native resolver did not return the seeded canonical account');
  if(!process.argv.includes('--composer')){fixturePhase='completed_thread_navigation';await page.goto('/s/'+id,{waitUntil:'domcontentloaded'});}await page.getByText('Native file bytes received.',{exact:true}).waitFor({timeout:30000});await page.reload();await page.getByText('Native file bytes received.',{exact:true}).waitFor({timeout:30000});if(process.argv.includes('--composer')){await page.getByText('pixel.png',{exact:true}).waitFor();if(process.argv.includes('--steer'))await page.getByText('corrected.png',{exact:true}).waitFor();await page.screenshot({path:join(out,'native-file-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'native-file-mobile.png'),fullPage:true});}
  if(boundaryMiB){
   fixturePhase='staged_file_preview';
   await page.getByRole('button',{name:'View pixel.png',exact:true}).click();
   const preview=page.locator('.chat-file-card a[download="pixel.png"]');await preview.waitFor({timeout:30000});
   const digest=await preview.evaluate(async anchor=>{const bytes=await (await fetch((anchor as HTMLAnchorElement).href)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');});
   if(digest!==createHash('sha256').update(bytes).digest('hex'))throw Error('Authenticated downloaded bytes differ');
  }
  let personalPreferenceCrossSession=false,personalPreferenceIsolated=false,personalPreferenceRemoved=false;
  let previousFileAvailableAfterReload=false;
  if(boundaryMiB){
   const before=new Set((await query('SELECT id FROM ordinary_native_file_fixture_calls')).rows.map(row=>row.id));
   await page.getByLabel('Message Turi').fill('Inspect the previously attached file after reload.');
   await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.getByText('Previously attached file bytes received.',{exact:true}).waitFor({timeout:60000});
   const after=(await query('SELECT id,bytes_digest FROM ordinary_native_file_fixture_calls')).rows.filter(row=>!before.has(row.id));
   if(!after.length||after.some(row=>row.bytes_digest!==createHash('sha256').update(bytes).digest('hex')))throw Error('Later question lost the original large attachment bytes');
   previousFileAvailableAfterReload=true;
  }
  if(process.argv.includes('--memory')||process.argv.includes('--memory-files')){
   const check=async(username:string,prompt:string,expected:string)=>{
    const isolated=await browser.newContext({baseURL:environment.origin});let token:string|undefined;
    try{
     const login=await isolated.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username,password:username==='panel'?process.env.PANEL_PASSWORD:process.env.TURAS_DEMO_PASSWORD}});if(!login.ok())throw Error('Preference fixture login failed');token=(await login.json()).data.csrfToken;
     const ownHeaders={origin:environment.origin,'x-csrf-token':token!},operationId=randomUUID();
     const created=await isolated.request.post('/api/conversations',{headers:ownHeaders,data:{requestKey:operationId}});if(!created.ok())throw Error('Preference conversation creation failed');const ownedId=(await created.json()).data.id;
     const bound=await isolated.request.post('/eve/v1/session',{headers:{...ownHeaders,'x-turas-conversation-id':ownedId},data:{operationId}});if(!bound.ok())throw Error('Preference session binding failed');const ownedNative=(await bound.json()).sessionId;
     const sent=await isolated.request.post('/eve/v1/session/'+ownedNative,{headers:{...ownHeaders,'x-turas-conversation-id':ownedId,'x-turas-request-key':randomUUID()},data:{message:prompt}});if(!sent.ok())throw Error('Preference check send failed');
     fixturePhase='preference_thread_navigation';const page=await isolated.newPage();await page.goto('/s/'+ownedId,{waitUntil:'domcontentloaded'});await page.getByText(expected,{exact:true}).waitFor({timeout:60000});
     const retired=await isolated.request.post('/eve/v1/session/'+ownedNative+'/end',{headers:ownHeaders,data:{reason:'Owned preference fixture complete'}});if(!retired.ok())throw Error('Preference session retirement failed');
    }finally{if(token)await isolated.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':token}}).catch(()=>{});await isolated.close();}
   };
   await check('mcteer','Check for a stored preference.','No stored preference is visible.');personalPreferenceIsolated=true;
   await check('panel','Recall the saved preference.','Stored preference recalled and removed.');personalPreferenceCrossSession=true;
   await check('panel','Check for a stored preference.','No stored preference is visible.');personalPreferenceRemoved=true;
  }
  if(environment.privateLogTail().includes('installing optional dependency'))throw Error('Native turn attempted an in-process dependency installation');
  if(process.argv.includes('--task-state')){
   await context.request.post('/api/auth/logout',{headers});
   const fresh=await context.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'panel',password:process.env.PANEL_PASSWORD}});
   if(!fresh.ok())throw Error('Checklist fresh-owner login failed');
   csrf=(await fresh.json()).data.csrfToken;headers['x-csrf-token']=csrf!;
   await page.reload();await page.getByText('Native file bytes received.',{exact:true}).waitFor({timeout:30000});
   await page.getByLabel('Message Turi').fill('Read the private checklist after reconnect.');
   await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.getByText('Private checklist survived reconnect.',{exact:true}).waitFor({timeout:60000});
   const outsider=await browser.newContext({baseURL:environment.origin});let outsiderCsrf:string|undefined;
   try{
    const login=await outsider.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'mcteer',password:process.env.TURAS_DEMO_PASSWORD}});
    if(!login.ok())throw Error('Checklist other-owner login failed');outsiderCsrf=(await login.json()).data.csrfToken;
    if((await outsider.request.get('/api/conversations/'+id)).status()!==404)throw Error('Checklist conversation crossed an owner boundary');
    const ownHeaders={origin:environment.origin,'x-csrf-token':outsiderCsrf!},operation=randomUUID();
    const created=await outsider.request.post('/api/conversations',{headers:ownHeaders,data:{requestKey:operation}});if(!created.ok())throw Error('Checklist isolation chat creation failed');
    const ownId=(await created.json()).data.id;
    const binding=await outsider.request.post('/eve/v1/session',{headers:{...ownHeaders,'x-turas-conversation-id':ownId},data:{operationId:operation}});if(!binding.ok())throw Error('Checklist isolation binding failed');
    const ownNative=(await binding.json()).sessionId;
    const sent=await outsider.request.post('/eve/v1/session/'+ownNative,{headers:{...ownHeaders,'x-turas-conversation-id':ownId,'x-turas-request-key':randomUUID()},data:{message:'Check private checklist isolation.'}});if(!sent.ok())throw Error('Checklist isolation send failed');
    const ownPage=await outsider.newPage();await ownPage.goto('/s/'+ownId,{waitUntil:'domcontentloaded'});await ownPage.getByText('New conversation has no private checklist.',{exact:true}).waitFor({timeout:60000});
    if(!(await outsider.request.post('/eve/v1/session/'+ownNative+'/end',{headers:ownHeaders,data:{reason:'Owned checklist isolation complete'}})).ok())throw Error('Checklist isolation retirement failed');
   }finally{if(outsiderCsrf)await outsider.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':outsiderCsrf}}).catch(()=>{});await outsider.close();}
   await writeFile(join(out,'task-state-receipt.json'),JSON.stringify({actualNativeTool:true,deterministicProvider:true,paidProviderCalls:0,
    replacedRevision:1,items:[{id:'source-review',text:'Inspect the exact supplied file.',status:'in_progress'}],freshOwnerLogin:true,
    sameThreadReloadRead:true,otherOwnerConversationDenied:true,newConversationRevision:0,newConversationItems:[]},null,2),{mode:0o600});
  }
  let interruptedStepRecovery=false;
  if(process.argv.includes('--staged-10')){
   const captured=JSON.parse(await readFile(interruptedStepMarker,'utf8'));
   const streamMetrics=(await readFile(interruptedStepMarker+'.stream-metrics','utf8')).trim().split('\n').map(line=>JSON.parse(line));
   const maximumNativeEventBytes=Math.max(...streamMetrics.map(row=>row.eventBytes));
   const maximumBase64EventBytesEstimate=Math.max(...streamMetrics.map(row=>row.base64Bytes));
   if(maximumNativeEventBytes>=64*1024||maximumBase64EventBytesEstimate>=10*1024*1024)throw Error('Staged file bytes leaked into native event transport');
   const current=(await query('SELECT input_event_id,input_digest,native_delivery_id,deadline_at FROM response_attempts WHERE conversation_id=$1',[id])).rows;
   const inputs=(await query("SELECT visible_payload FROM event_projections WHERE conversation_id=$1 AND event_type='message.received'",[id])).rows;
   const aliases=inputs.filter(row=>row.visible_payload.applicationInputReplay);
   if(Number(captured.operations)!==0||current.length!==2||!current.some(row=>row.input_event_id===captured.input_event_id&&row.input_digest===captured.input_digest&&row.native_delivery_id===captured.native_delivery_id&&row.deadline_at.toISOString()===captured.deadline_at)||aliases.length>1||aliases.some(alias=>alias.visible_payload.applicationInputReplay.retryOfInputEventId!==captured.input_event_id||alias.visible_payload.applicationInputReplay.admittedDeliveryId!==captured.native_delivery_id))throw Error('Owned interrupted-step recovery changed canonical input, deadline or delivery');
   const rendered=await page.locator('article.chat-message-user').allTextContents();
   if(rendered.length!==2||rendered.filter(text=>text.includes(firstPrompt)).length!==1)throw Error('Interrupted native delivery duplicated rendered user sends');
   interruptedStepRecovery=true;
   await writeFile(join(out,'interrupted-step-recovery.json'),JSON.stringify({actualEveRuntime:true,maximumNativeEventBytes,maximumBase64EventBytesEstimate,hostedPlatformLimitBytes:10*1024*1024,forcedInterruptions:1,initialModelOperations:0,canonicalInputPreserved:true,originalDeadlinePreserved:true,admittedAliases:aliases.length,renderedUserSends:2,originalUserSendCopies:1,providerFileBytesPreserved:true,paidProviderCalls:0},null,2),{mode:0o600});
  }
  let failedFileHistoryRecovery=false;let activeFailedNativeSnapshot:{messages:number;events:number}|undefined;let failedOperationSnapshot:unknown[]|undefined;let failedProviderCalls=0;let failedUnknownHoldsPreserved=false;
  const failedPrompt='Fail this native file turn explicitly.',recoveryPrompt='Recover after the failed native file turn.';
  if(process.argv.includes('--staged-4')&&process.argv.includes('--composer')&&process.argv.includes('--steer')){
   fixturePhase='synthetic_provider_failed_file_turn';
   const beforeAttempts=new Set((await query('SELECT id FROM response_attempts WHERE conversation_id=$1',[id])).rows.map(row=>row.id));
   await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:bytes});await page.getByLabel('Message Turi').fill(failedPrompt);await page.getByRole('button',{name:'Send message',exact:true}).click();
   let failedAttempt:string|undefined;const failureDeadline=Date.now()+90000;
   while(!failedAttempt){const candidates=(await query('SELECT id,response_state FROM response_attempts WHERE conversation_id=$1',[id])).rows.filter(row=>!beforeAttempts.has(row.id));if(candidates.length>1)throw Error('Failed fixture created duplicate attempts');if(candidates[0]?.response_state==='failed')failedAttempt=candidates[0].id;else{if(Date.now()>failureDeadline)throw Error('Synthetic provider failure did not settle');await new Promise(resolve=>setTimeout(resolve,100));}}
   const failedCalls=(await query('SELECT bytes_digest FROM ordinary_native_file_fixture_calls WHERE attempt_id=$1',[failedAttempt])).rows;
   failedProviderCalls=failedCalls.length;if(!failedCalls.length||failedCalls.some(row=>row.bytes_digest!==createHash('sha256').update(bytes).digest('hex')))throw Error('Failed provider turn did not receive original file bytes');
   if(!(await query("SELECT 1 FROM event_projections e JOIN response_attempts a ON a.conversation_id=e.conversation_id AND a.native_turn_id=e.turn_id WHERE a.id=$1 AND e.event_type IN('step.failed','turn.failed') AND e.visible_payload->>'code'='MODEL_CALL_FAILED'",[failedAttempt])).rowCount)throw Error('Actual synthetic SDK failure was not projected');
   failedOperationSnapshot=(await query('SELECT id,ceiling_tokens,actual_tokens,settled_at FROM ordinary_model_operations WHERE attempt_id=$1 ORDER BY id',[failedAttempt])).rows;if(!failedOperationSnapshot.length)throw Error('Synthetic failed provider did not reserve original allowance');
   const cookie=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');const nativeClient=new NativeClient({baseUrl:environment.origin,headers:{cookie,origin:environment.origin}});const nativeEvents=[];for await(const event of nativeClient.sessions.attach(native).stream({follow:false,signal:AbortSignal.timeout(30000)}))nativeEvents.push(event);activeFailedNativeSnapshot={messages:nativeEvents.filter(event=>event.type==='delivery.consumed'||event.type==='content.completed').length,events:nativeEvents.length};await writeFile(join(out,'active-failed-native-snapshot-private.json'),JSON.stringify(nativeEvents,null,2),{mode:0o600});
   const assertFailedUser=async()=>{await page.locator('article.chat-message-user').filter({hasText:failedPrompt}).waitFor({timeout:30000});const users=await page.locator('article.chat-message-user').allTextContents();if(users.filter(text=>text.includes(failedPrompt)).length!==1)throw Error('Failed native user turn lost or duplicated');await page.locator('article.chat-message-user').filter({hasText:failedPrompt}).getByText('pixel.png',{exact:true}).waitFor();};
   await page.reload();await page.getByRole('button',{name:'Send message',exact:true}).waitFor();await assertFailedUser();
   fixturePhase='successful_turn_after_provider_failure';await page.getByLabel('Message Turi').fill(recoveryPrompt);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Native file recovery completed.',{exact:true}).waitFor({timeout:60000});await page.reload();await page.getByText('Native file recovery completed.',{exact:true}).waitFor({timeout:30000});await assertFailedUser();
   if(await page.getByText('Native file recovery completed.',{exact:true}).count()!==1)throw Error('Recovery completion duplicated');
   if(JSON.stringify(failedOperationSnapshot)!==JSON.stringify((await query('SELECT id,ceiling_tokens,actual_tokens,settled_at FROM ordinary_model_operations WHERE attempt_id=$1 ORDER BY id',[failedAttempt])).rows))throw Error('Successful followup altered original failed provider holds');
   const held=Number((await query('SELECT COALESCE(sum(COALESCE(actual_tokens,ceiling_tokens)),0) AS n FROM ordinary_model_operations WHERE conversation_id=$1',[id])).rows[0].n);if(held>20000)throw Error('Failed turn reset cumulative conversation allowance');
   failedUnknownHoldsPreserved=true;failedFileHistoryRecovery=true;
  }
  const retired=await context.request.post('/eve/v1/session/'+native+'/end',{headers,data:{reason:'Owned native file fixture complete'}});if(!retired.ok())throw Error('Native file retirement unconfirmed');
  if(failedFileHistoryRecovery){await page.reload();await page.getByText('Native file recovery completed.',{exact:true}).waitFor({timeout:30000});const retiredDetail=await context.request.get('/api/conversations/'+id);if(!retiredDetail.ok()||(await retiredDetail.json()).data.nativeRetired!==true)throw Error('Failed-file fixture retirement missing');const users=await page.locator('article.chat-message-user').allTextContents();if(users.filter(text=>text.includes(failedPrompt)).length!==1)throw Error('Retired failed file user lost or duplicated');await page.getByText('pixel.png',{exact:true}).first().waitFor();}
  if(boundaryMiB&&(!uploadRequestBytes.length||Math.max(...uploadRequestBytes)>512*1024||!sendRequestBytes.length||Math.max(...sendRequestBytes)>4096))throw Error('Large native file bypassed bounded staging transport');
  const receipt={failedFileHistoryRecovery,failedProviderCalls,failedUnknownHoldsPreserved,activeFailedNativeSnapshot,activeFailedNativeEmpty:activeFailedNativeSnapshot?activeFailedNativeSnapshot.events===0:null,retirementEmptyIsActiveFailureProof:false,interruptedStepRecovery,kind:'ordinary-native-file-bytes',actualEveRuntime:true,fixtureProvider:true,paidProviderCalls:0,runtimeDependencyInstallation:false,providerBytesPreserved:!process.argv.includes('--memory'),stagedFileBytes:boundaryMiB?bytes.length:null,maximumUploadRequestBytes:uploadRequestBytes.length?Math.max(...uploadRequestBytes):null,maximumSendRequestBytes:sendRequestBytes.length?Math.max(...sendRequestBytes):null,attachmentMutationBlockedDuringUpload,readyDraftRemovalReleasedQuota,uncertainDraftRemovalPreserved,previousFileAvailableAfterReload,personalPreferenceSaved:process.argv.includes('--memory')||process.argv.includes('--memory-files'),personalPreferenceCrossSession,personalPreferenceIsolated,personalPreferenceRemoved,providerToolSets:calls.map(row=>row.tool_names),actualCanonicalCustomerResolved:true,nativeFileCorrection:process.argv.includes('--steer'),toolNames:calls[0].tool_names,composerUsed:process.argv.includes('--composer'),reloadedHistory:true,nativeRetirementStatus:retired.status()};await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));for(const name of ['failure-private.json','failure-private.log','failure-page-private.png','send-private.json'])await rm(join(out,name),{force:true});
 }catch(error){
  if(process.argv.includes('--staged-10'))await captureOwnedWorkflowMetadata(environment.appRoot,(await query('SELECT eve_session_id FROM conversations WHERE eve_session_id IS NOT NULL LIMIT 20')).rows.map(row=>row.eve_session_id),join(out,'workflow-after-failure-private.json')).catch(()=>{});
  await writeFile(join(out,'runtime-state-private.json'),JSON.stringify({
   attempts:(await query('SELECT id,dispatch_state,response_state,native_turn_id,last_error_code FROM response_attempts')).rows,
   corrections:(await query('SELECT dispatch_state,native_turn_id,native_event_id,native_status FROM ordinary_steering_deliveries')).rows,
   providerCalls:(await query('SELECT attempt_id,bytes_digest FROM ordinary_native_file_fixture_calls')).rows,
   events:(await query(`SELECT native_event_id,event_type,turn_id,visible_payload->>'deliveryId' AS delivery_id FROM event_projections ORDER BY emitted_at,native_event_id`)).rows,
  }),{mode:0o600}).catch(()=>{});
  // Only this unpaid, synthetic fixture is eligible for bounded CI diagnostics.
  // Keep full logs private; remove URLs and known credentials from error lines.
  if(process.env.CI)for(const line of environment.privateLogTail().split('\n').filter(line=>/(?:Error:|Error \[|error:|Cannot |Missing |ENOENT|EACCES|timed out|installing optional dependency)/i.test(line)).slice(-16)){
   let reason=line.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/gi,'<redacted-url>').replaceAll('synthetic-test-password','<redacted>');
   for(const [key,value]of Object.entries(process.env))if(value&&value.length>=8&&/(?:SECRET|PASSWORD|TOKEN|API_KEY)/i.test(key))reason=reason.replaceAll(value,'<redacted>');
   console.error(JSON.stringify({kind:'native_file_fixture_failure',name:'RuntimeDiagnostic',reason:reason.slice(0,240)}));
  }
  let ui:unknown=null,timer:ReturnType<typeof setTimeout>|undefined;
  try{ui=await Promise.race([inspectFileUi(),new Promise(resolve=>{timer=setTimeout(()=>resolve({unavailable:true}),1000);})]);}catch{ui={unavailable:true};}finally{if(timer)clearTimeout(timer);}
  await captureFailurePage().catch(()=>undefined);
  const diagnostic={phase:fixturePhase,applicationMode:'development',fileResponses,ui};
  if(process.env.CI)console.error(JSON.stringify({kind:'native_file_boundary_diagnostic',...diagnostic}));
  await writeFile(join(out,'failure-private.log'),environment.privateLogTail(),{mode:0o600});await writeFile(join(out,'failure-private.json'),JSON.stringify({name:error instanceof Error?error.name:'Unknown',message:error instanceof Error?error.message:String(error),...diagnostic}),{mode:0o600});throw error;}
 finally{if(csrf)await context.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':csrf}}).catch(()=>{});await context.close();await browser.close();}
},{feature:'010',empty:true,deadlineAt:fixtureDeadlineAt,prepare:async({appRoot,environmentId})=>{
 marker=fixtureOwner;
 if(process.argv.includes('--staged-10')){const manifestPath=join(appRoot,'package.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.scripts['build:eve:check']='eve build';await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
 await writeFile(join(appRoot,'package-lock.json'),await readFile(resolve('package-lock.json')),{mode:0o600});
 // npm ci installs the pinned local provider before any agent turn. Keep the
 // shared dependency link intact; no in-turn or fixture-specific installs.
 const provider=JSON.parse(await readFile(join(appRoot,'node_modules/just-bash/package.json'),'utf8'));
 if(provider.version!=='3.6.0')throw Error('Pinned local sandbox provider required');
 // Eve prepares every declared environment on the first native file. Keep all
 // owned fixture environments on its selected Docker provider, rather than
 // auto-installing an unrelated default provider during the browser turn.
 for(const specialist of ['customer-recon-worker','implementation-research-worker','vercel-best-practices-worker'])
  await writeFile(join(appRoot,'agent/subagents',specialist,'sandbox.ts'),"import {defineParentSandbox} from 'eve/sandbox';export default defineParentSandbox();\n",{mode:0o600});
 const devPath=join(appRoot,'scripts/dev.mjs');let source=await readFile(devPath,'utf8');
 // The documented --resume CLI owns this disposable app's retained local world.
 // withEve reuses that already-running local server. Do not enable automatic
 // recovery for the user's selected development database or workflow state.
 const launcher=`const ownedEve=spawn(resolve(cwd,'node_modules/.bin/eve'),['dev','--resume','--no-ui','--port','0'],{cwd,env:process.env,stdio:['ignore','pipe','pipe']});
let ownedOrigin='';
await new Promise((done,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Owned resume server timeout')),90000);const listen=chunk=>{const value=chunk.toString();process.stdout.write(value);text=(text+value).slice(-200000);const match=text.match(/server listening at (http:\\/\\/127\\.0\\.0\\.1:\\d+)\\//);if(match){ownedOrigin=match[1];clearTimeout(timer);done();}};ownedEve.stdout.on('data',listen);ownedEve.stderr.on('data',listen);ownedEve.once('exit',()=>{clearTimeout(timer);reject(Error('Owned resume server exited'));});});
`;
 source=source.replace('const next = spawn(',launcher+'const next = spawn(').replace('["dev"]','["dev","--webpack"]').replace('  next.kill("SIGTERM");','  next.kill("SIGTERM");\n  ownedEve.kill("SIGTERM");');
 source+='\nconsume("server listening at "+ownedOrigin+"/");\n';
 await writeFile(devPath,source,{mode:0o600});
 await writeFile(join(appRoot,'agent/sandbox.ts'),`import {defineSandbox} from 'eve/sandbox';import {DockerSandbox} from 'eve/sandbox/docker';export const environment=DockerSandbox.image(${JSON.stringify(image)},{pullPolicy:'never',env:{TURAS_NATIVE_FILE_FIXTURE_OWNER:${JSON.stringify(fixtureOwner)}}});export default defineSandbox(()=>environment.open({networkPolicy:'deny-all'}));\n`,{mode:0o600});
 // Queue the owned local-world step separately: its default inline-owner lease
 // is 860 seconds, longer than this unchanged attempt authority. This setting
 // applies before initial execution and only to this disposable runtime.
 return process.argv.includes('--staged-10')?{WORKFLOW_INLINE_OWNERSHIP:'false'}:{};
}});}catch(error){
 const reason=(error instanceof Error?error.message:'Unknown fixture failure').split('\n')[0].replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi,'<redacted>@').slice(0,200);
 console.error(JSON.stringify({kind:'native_file_fixture_failure',phase:fixturePhase,name:error instanceof Error?error.name:'Unknown',reason}));throw error;
}finally{
 delete process.env.TURAS_ORDINARY_MEMORY_FILE_FIXTURE;delete process.env.TURAS_ORDINARY_MEMORY_FIXTURE;delete process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE;delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;delete process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE;
 delete process.env.TURAS_ORDINARY_TASK_STATE_FIXTURE;
 delete process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE_DEADLINE_AT;
 // Exact baked-in fixture ownership excludes every unrelated Docker resource.
 const removedContainers:string[]=[],removedImages:string[]=[];
 if(marker){const ids=docker(['ps','-aq']).stdout.trim().split(/\s+/).filter(Boolean);for(const id of ids){const inspected=docker(['inspect',id]);if(inspected.status===0&&JSON.parse(inspected.stdout)[0]?.Config?.Env?.includes('TURAS_NATIVE_FILE_FIXTURE_OWNER='+marker)){if(docker(['rm','-f','-v',id]).status!==0)throw Error('Owned native file container cleanup failed');removedContainers.push(id);}}
 const images=[...new Set(docker(['image','ls','-q','--no-trunc']).stdout.trim().split(/\s+/).filter(Boolean))];for(const id of images){const inspected=docker(['image','inspect',id]);if(inspected.status===0&&JSON.parse(inspected.stdout)[0]?.Config?.Env?.includes('TURAS_NATIVE_FILE_FIXTURE_OWNER='+marker)){if(docker(['ps','-aq','--filter','ancestor='+id]).stdout.trim())throw Error('Owned native file image remains in use');if(docker(['image','rm','-f',id]).status!==0)throw Error('Owned native file image cleanup failed');removedImages.push(id);}}}
 await writeFile(join(out,'resource-cleanup.json'),JSON.stringify({removedContainers:removedContainers.length,removedImages:removedImages.length,ownerMarker:marker}),{mode:0o600});
 if(createHash('sha256').update(await readFile(authored)).digest('hex')!==authoredDigest)throw Error('Authored root model changed');
}
