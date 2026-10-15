import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {Client} from 'pg';
import {webkit} from 'playwright';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Unpaid native file check requires empty provider credentials');
const authored=resolve('agent/agent.ts'),authoredDigest=createHash('sha256').update(await readFile(authored)).digest('hex');
const out=resolve('local-artifacts/legacy-parity-native-files');await mkdir(out,{recursive:true,mode:0o700});
const image='pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f';
const docker=(args:string[])=>spawnSync('docker',args,{encoding:'utf8'});
const fixtureOwner='turas-native-file-'+randomUUID();
let marker:string|undefined;
try{await withPlanEvalEnvironment(async environment=>{
 const path=join(environment.appRoot,'agent/agent.ts'),source=await readFile(path,'utf8');
 const target='return wrapOrdinaryChatModel(parityBudgetModel(gateway(selectedModel),selectedModel),principal,ctx.session.id,turnId);';
 if(source.split(target).length!==2)throw Error('Authored model shape changed');
 await writeFile(path,'import {createOrdinaryNativeFileFixtureModel} from "../tests/fixtures/ordinary-native-file-model";\n'+source.replace(target,'return {model:wrapOrdinaryChatModel(createOrdinaryNativeFileFixtureModel(String(principal?.attributes?.turasAttemptId)),principal,ctx.session.id,turnId),modelContextWindowTokens:128_000};'),{mode:0o600});
 const fixtureOwnerUrl=process.env.DATABASE_URL!,fixtureCustomerId=randomUUID();
 const owner=new Client({connectionString:fixtureOwnerUrl});await owner.connect();try{await owner.query(`CREATE TABLE ordinary_native_file_fixture_calls(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES response_attempts(id),bytes_digest text NOT NULL,tool_names text[] NOT NULL DEFAULT '{}');CREATE TABLE ordinary_native_file_fixture_resolutions(attempt_id uuid PRIMARY KEY REFERENCES response_attempts(id),customer_id uuid NOT NULL REFERENCES customer_references(id));GRANT SELECT,INSERT ON ordinary_native_file_fixture_calls,ordinary_native_file_fixture_resolutions TO turas_runtime`);}finally{await owner.end();}
 const runtime=new URL(process.env.DATABASE_URL!);runtime.searchParams.set('options','-c role=turas_runtime');await closeRuntimePool();process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_TEST_DATABASE_URL=runtime.href;
 process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED='1';process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE='1';
 if(process.argv.includes('--steer'))process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE='1';
 if(process.argv.includes('--memory')||process.argv.includes('--memory-files'))process.env.TURAS_ORDINARY_MEMORY_FIXTURE='1';
 if(process.argv.includes('--memory-files'))process.env.TURAS_ORDINARY_MEMORY_FILE_FIXTURE='1';
 await environment.start();
 const browser=await webkit.launch({headless:true}),context=await browser.newContext({baseURL:environment.origin});let csrf:string|undefined;
 try{
  const login=await context.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'panel',password:process.env.PANEL_PASSWORD}});if(!login.ok())throw Error('Fixture login failed');csrf=(await login.json()).data.csrfToken;
  const seed=new Client({connectionString:fixtureOwnerUrl});await seed.connect();try{await seed.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Native file fixture customer',false)",[fixtureCustomerId,DEMO_IDS.workspace]);}finally{await seed.end();}
  const headers={origin:environment.origin,'x-csrf-token':csrf!},operationId=randomUUID();
  let id:string,native:string|undefined;
  const firstPrompt=process.argv.includes('--memory')||process.argv.includes('--memory-files')?'Remember that I prefer concise answers.':'Please inspect this native file.';
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC','base64');
  const page=await context.newPage();
  if(process.argv.includes('--composer')){
   // Compile the actual thread surface before starting the paused provider.
   // This avoids measuring a cold development compile as correction latency.
   const warmupKey=randomUUID(),warmup=await context.request.post('/api/conversations',{headers,data:{requestKey:warmupKey}});if(!warmup.ok())throw Error('Thread warmup creation failed');
   const warmupId=(await warmup.json()).data.id;
   const warmupBinding=await context.request.post('/eve/v1/session',{headers:{...headers,'x-turas-conversation-id':warmupId},data:{operationId:warmupKey}});if(!warmupBinding.ok())throw Error('Thread warmup binding failed');
   await page.goto('/s/'+warmupId,{waitUntil:'domcontentloaded'});
   await page.getByLabel('Message Turi').waitFor({timeout:60000});
   await page.goto('/s',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const input=document.querySelector<HTMLInputElement>('input[type="file"][aria-label="Chat document files"]');return input&&!input.disabled;},null,{timeout:30000});
   await page.getByLabel('Message Turi').fill(firstPrompt);
   await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:bytes});
   await page.getByRole('button',{name:'Remove pixel.png'}).waitFor({timeout:20000});
   await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.waitForURL(/\/s\/[0-9a-f-]+$/,{timeout:30000});id=new URL(page.url()).pathname.split('/').at(-1)!;
   const saved=await context.request.get('/api/conversations/'+id);if(!saved.ok())throw Error('Composer conversation unavailable');native=(await saved.json()).data.eveSessionId;
   if(!native)throw Error('Composer native binding unavailable');
  }else{
  const created=await context.request.post('/api/conversations',{headers,data:{requestKey:operationId}});if(!created.ok())throw Error('Fixture conversation creation failed');id=(await created.json()).data.id;
  for(let i=0;i<5;i++){const response=await context.request.post('/eve/v1/session',{headers:{...headers,'x-turas-conversation-id':id},data:{operationId}});if(response.ok()){native=(await response.json()).sessionId;break;}if(response.status()!==409)throw Error('Native binding failed');await new Promise(resolve=>setTimeout(resolve,1000));}if(!native)throw Error('Native binding unconfirmed');
  const sent=await context.request.post('/eve/v1/session/'+native,{headers:{...headers,'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message:process.argv.includes('--memory')?firstPrompt:[{type:'text',text:firstPrompt},{type:'file',filename:'pixel.png',mediaType:'image/png',data:'data:image/png;base64,'+bytes.toString('base64')}]}});
  if(!sent.ok()){await writeFile(join(out,'send-private.json'),JSON.stringify({status:sent.status(),body:await sent.text()}),{mode:0o600});throw Error('Native file send rejected');}
  }
  if(process.argv.includes('--steer')){
   const deadline=Date.now()+90000;while(!(await query('SELECT 1 FROM ordinary_native_file_fixture_calls')).rowCount){const state=(await query('SELECT response_state,last_error_code FROM response_attempts WHERE conversation_id=$1',[id])).rows[0];if(state?.response_state==='failed')throw Error('Original response failed: '+String(state.last_error_code??'unknown'));if(Date.now()>deadline)throw Error('Original provider did not start');await new Promise(resolve=>setTimeout(resolve,100));}
   if(process.argv.includes('--composer')){
    await page.getByLabel('Message Turi').fill('Correct this using the attached file.');
    await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'corrected.png',mimeType:'image/png',buffer:bytes});
    await page.getByRole('button',{name:'Remove corrected.png'}).waitFor({timeout:10000});
    const [delivery]=await Promise.all([page.waitForResponse(response=>response.request().method()==='POST'&&response.url()===environment.origin+'/eve/v1/session/'+native),page.getByRole('button',{name:'Send message',exact:true}).click()]);
    if(!delivery.ok())throw Error('Composer file correction rejected');
   }else{
   const correction=await context.request.post('/eve/v1/session/'+native,{headers:{...headers,'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{turnPolicy:'steer',message:[{type:'text',text:'Correct this using the attached file.'},{type:'file',filename:'corrected.png',mediaType:'image/png',data:'data:image/png;base64,'+bytes.toString('base64')}]}});
   if(!correction.ok()){await writeFile(join(out,'send-private.json'),JSON.stringify({status:correction.status(),body:await correction.text()}),{mode:0o600});throw Error('File correction rejected');}
   }
  }
  const until=Date.now()+60000;let completed=false;while(Date.now()<until){const rows=(await query('SELECT response_state FROM response_attempts WHERE conversation_id=$1',[id])).rows;if(rows.some(row=>row.response_state==='completed')){completed=true;break;}if(rows.some(row=>row.response_state==='failed'))throw Error('Native file response failed');await new Promise(resolve=>setTimeout(resolve,100));}
  if(!completed)throw Error('Native file response timed out');
  const calls=(await query('SELECT bytes_digest,tool_names FROM ordinary_native_file_fixture_calls')).rows;
  if((process.argv.includes('--steer')?calls.length<2:calls.length!==(process.argv.includes('--memory')||process.argv.includes('--memory-files')?3:2))||calls.some(call=>call.bytes_digest!==createHash('sha256').update(process.argv.includes('--memory')?Buffer.alloc(0):bytes).digest('hex')))throw Error('Provider file bytes differ');
  if(process.argv.includes('--steer')){const projected=(await query('SELECT native_event_id FROM ordinary_steering_deliveries d JOIN response_attempts a ON a.id=d.attempt_id WHERE a.conversation_id=$1',[id])).rows;if(projected.length!==1||!projected[0].native_event_id)throw Error('Native file correction was not consumed');if(Number((await query('SELECT count(*) AS n FROM response_attempts WHERE conversation_id=$1',[id])).rows[0].n)!==1)throw Error('Correction created a second response allowance');}
  const resolutions=(await query('SELECT customer_id FROM ordinary_native_file_fixture_resolutions')).rows;if(resolutions.length!==1||resolutions[0].customer_id!==fixtureCustomerId)throw Error('Actual native resolver did not return the seeded canonical account');
  if(!process.argv.includes('--composer'))await page.goto('/s/'+id,{waitUntil:'domcontentloaded'});await page.getByText('Native file bytes received.',{exact:true}).waitFor({timeout:30000});await page.reload();await page.getByText('Native file bytes received.',{exact:true}).waitFor({timeout:30000});if(process.argv.includes('--composer')){await page.getByText('pixel.png',{exact:true}).waitFor();if(process.argv.includes('--steer'))await page.getByText('corrected.png',{exact:true}).waitFor();await page.screenshot({path:join(out,'native-file-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'native-file-mobile.png'),fullPage:true});}
  let personalPreferenceCrossSession=false,personalPreferenceIsolated=false,personalPreferenceRemoved=false;
  if(process.argv.includes('--memory')){
   const check=async(username:string,prompt:string,expected:string)=>{
    const isolated=await browser.newContext({baseURL:environment.origin});let token:string|undefined;
    try{
     const login=await isolated.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username,password:username==='panel'?process.env.PANEL_PASSWORD:process.env.TURAS_DEMO_PASSWORD}});if(!login.ok())throw Error('Preference fixture login failed');token=(await login.json()).data.csrfToken;
     const ownHeaders={origin:environment.origin,'x-csrf-token':token!},operationId=randomUUID();
     const created=await isolated.request.post('/api/conversations',{headers:ownHeaders,data:{requestKey:operationId}});if(!created.ok())throw Error('Preference conversation creation failed');const ownedId=(await created.json()).data.id;
     const bound=await isolated.request.post('/eve/v1/session',{headers:{...ownHeaders,'x-turas-conversation-id':ownedId},data:{operationId}});if(!bound.ok())throw Error('Preference session binding failed');const ownedNative=(await bound.json()).sessionId;
     const sent=await isolated.request.post('/eve/v1/session/'+ownedNative,{headers:{...ownHeaders,'x-turas-conversation-id':ownedId,'x-turas-request-key':randomUUID()},data:{message:prompt}});if(!sent.ok())throw Error('Preference check send failed');
     const page=await isolated.newPage();await page.goto('/s/'+ownedId,{waitUntil:'domcontentloaded'});await page.getByText(expected,{exact:true}).waitFor({timeout:60000});
     const retired=await isolated.request.post('/eve/v1/session/'+ownedNative+'/reset',{headers:ownHeaders,data:{reason:'Owned preference fixture complete'}});if(!retired.ok())throw Error('Preference session retirement failed');
    }finally{if(token)await isolated.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':token}}).catch(()=>{});await isolated.close();}
   };
   await check('mcteer','Check for a stored preference.','No stored preference is visible.');personalPreferenceIsolated=true;
   await check('panel','Recall the saved preference.','Stored preference recalled and removed.');personalPreferenceCrossSession=true;
   await check('panel','Check for a stored preference.','No stored preference is visible.');personalPreferenceRemoved=true;
  }
  const retired=await context.request.post('/eve/v1/session/'+native+'/reset',{headers,data:{reason:'Owned native file fixture complete'}});if(!retired.ok())throw Error('Native file retirement unconfirmed');
  const receipt={kind:'ordinary-native-file-bytes',actualEveRuntime:true,fixtureProvider:true,paidProviderCalls:0,providerBytesPreserved:!process.argv.includes('--memory'),personalPreferenceSaved:process.argv.includes('--memory')||process.argv.includes('--memory-files'),personalPreferenceCrossSession,personalPreferenceIsolated,personalPreferenceRemoved,providerToolSets:calls.map(row=>row.tool_names),actualCanonicalCustomerResolved:true,nativeFileCorrection:process.argv.includes('--steer'),toolNames:calls[0].tool_names,composerUsed:process.argv.includes('--composer'),reloadedHistory:true,nativeRetirementStatus:retired.status()};await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));for(const name of ['failure-private.json','failure-private.log','send-private.json'])await rm(join(out,name),{force:true});
 }catch(error){
  // Only this unpaid, synthetic fixture is eligible for bounded CI diagnostics.
  // Keep full logs private; remove URLs and known credentials from error lines.
  if(process.env.CI)for(const line of environment.privateLogTail().split('\n').filter(line=>/(?:Error:|Error \[|error:|Cannot |Missing |ENOENT|EACCES|timed out)/i.test(line)).slice(-16)){
   let reason=line.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/gi,'<redacted-url>').replaceAll('synthetic-test-password','<redacted>');
   for(const [key,value]of Object.entries(process.env))if(value&&value.length>=8&&/(?:SECRET|PASSWORD|TOKEN|API_KEY)/i.test(key))reason=reason.replaceAll(value,'<redacted>');
   console.error(JSON.stringify({kind:'native_file_fixture_failure',name:'RuntimeDiagnostic',reason:reason.slice(0,240)}));
  }
  await writeFile(join(out,'failure-private.log'),environment.privateLogTail(),{mode:0o600});await writeFile(join(out,'failure-private.json'),JSON.stringify({name:error instanceof Error?error.name:'Unknown',message:error instanceof Error?error.message:String(error)}),{mode:0o600});throw error;}
 finally{if(csrf)await context.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':csrf}}).catch(()=>{});await context.close();await browser.close();}
},{feature:'010',empty:true,deadlineAt:Date.now()+420000,prepare:async({appRoot,environmentId})=>{
 marker=fixtureOwner;
 // Eve prepares every declared environment on the first native file. Keep all
 // owned fixture environments on its selected Docker provider, rather than
 // auto-installing an unrelated default provider during the browser turn.
 for(const specialist of ['customer-recon-worker','implementation-research-worker','vercel-best-practices-worker'])
  await writeFile(join(appRoot,'agent/subagents',specialist,'sandbox.ts'),"import {defineParentSandbox} from 'eve/sandbox';export default defineParentSandbox();\n",{mode:0o600});
 const dev=join(appRoot,'scripts/dev.mjs');await writeFile(dev,"import {execFileSync} from 'node:child_process';\nexecFileSync(process.execPath,['--experimental-strip-types','scripts/bootstrap-demo.ts'],{stdio:'ignore'});\n"+(await readFile(dev,'utf8')).replace('["dev"]','["dev","--webpack"]'),{mode:0o600});
 await writeFile(join(appRoot,'agent/sandbox.ts'),`import {defineSandbox} from 'eve/sandbox';import {DockerSandbox} from 'eve/sandbox/docker';export const environment=DockerSandbox.image(${JSON.stringify(image)},{pullPolicy:'never',env:{TURAS_NATIVE_FILE_FIXTURE_OWNER:${JSON.stringify(fixtureOwner)}}});export default defineSandbox(()=>environment.open({networkPolicy:'deny-all'}));\n`,{mode:0o600});return {};
}});}catch(error){
 const reason=(error instanceof Error?error.message:'Unknown fixture failure').split('\n')[0].replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi,'<redacted>@').slice(0,200);
 console.error(JSON.stringify({kind:'native_file_fixture_failure',name:error instanceof Error?error.name:'Unknown',reason}));throw error;
}finally{
 delete process.env.TURAS_ORDINARY_MEMORY_FILE_FIXTURE;delete process.env.TURAS_ORDINARY_MEMORY_FIXTURE;delete process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE;delete process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED;delete process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE;
 // Exact baked-in fixture ownership excludes every unrelated Docker resource.
 const removedContainers:string[]=[],removedImages:string[]=[];
 if(marker){const ids=docker(['ps','-aq']).stdout.trim().split(/\s+/).filter(Boolean);for(const id of ids){const inspected=docker(['inspect',id]);if(inspected.status===0&&JSON.parse(inspected.stdout)[0]?.Config?.Env?.includes('TURAS_NATIVE_FILE_FIXTURE_OWNER='+marker)){if(docker(['rm','-f','-v',id]).status!==0)throw Error('Owned native file container cleanup failed');removedContainers.push(id);}}
 const images=[...new Set(docker(['image','ls','-q','--no-trunc']).stdout.trim().split(/\s+/).filter(Boolean))];for(const id of images){const inspected=docker(['image','inspect',id]);if(inspected.status===0&&JSON.parse(inspected.stdout)[0]?.Config?.Env?.includes('TURAS_NATIVE_FILE_FIXTURE_OWNER='+marker)){if(docker(['ps','-aq','--filter','ancestor='+id]).stdout.trim())throw Error('Owned native file image remains in use');if(docker(['image','rm','-f',id]).status!==0)throw Error('Owned native file image cleanup failed');removedImages.push(id);}}}
 await writeFile(join(out,'resource-cleanup.json'),JSON.stringify({removedContainers:removedContainers.length,removedImages:removedImages.length,ownerMarker:marker}),{mode:0o600});
 if(createHash('sha256').update(await readFile(authored)).digest('hex')!==authoredDigest)throw Error('Authored root model changed');
}
