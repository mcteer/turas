import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,realpath,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from 'pg';
import {webkit} from 'playwright';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';

assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY||process.env.CONTEXT_DEV_API_KEY)throw Error('Unpaid native fixture requires empty provider credentials');
const authored=join(process.cwd(),'agent/agent.ts'),original=await readFile(authored,'utf8'),originalDigest=createHash('sha256').update(original).digest('hex');
const output=resolve('local-artifacts/legacy-parity-native');await mkdir(output,{recursive:true,mode:0o700});
try{await withPlanEvalEnvironment(async environment=>{
 environment.bootstrapDemo();
 const root=await realpath(environment.appRoot),owned=await realpath(resolve('local-artifacts/010'));
 if(!root.startsWith(owned+'/eval-')||!root.endsWith('/app'))throw Error('Owned ordinary app copy required');
 const path=join(root,'agent/agent.ts'),source=await readFile(path,'utf8');
 const target='return selectTurasGatewayModel(wrapOrdinaryChatModel(parityBudgetModel(gateway(selectedModel),selectedModel),principal,ctx.session.id,turnId));';
 if(source.split(target).length!==2||!source.includes('const selectedModel = "anthropic/claude-sonnet-5.5";'))throw Error('Ordinary model shape changed');
 await writeFile(path,'import {createOrdinaryNativeFixtureModel} from "../tests/fixtures/ordinary-chat-native-model";\n'+source.replace(target,
  "return {...selectTurasGatewayModel(wrapOrdinaryChatModel(createOrdinaryNativeFixtureModel(String(principal?.attributes?.turasAttemptId)),principal,ctx.session.id,turnId)),modelContextWindowTokens:128_000};"),{mode:0o600});
 const hookPath=join(root,'agent/hooks/persist-conversation.ts');const hook=await readFile(hookPath,'utf8');await writeFile(hookPath,hook.replace('      try {',"      if(['message.received','turn.cancelled','turn.completed'].includes(event.type))console.info(JSON.stringify({fixtureNativeEvent:event.type,attemptId,turnId:'turnId' in event.data?event.data.turnId:null}));\n      try {"),{mode:0o600});
 const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();
 try{await admin.query(`CREATE TABLE ordinary_native_fixture_calls(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES response_attempts(id),provider_path text NOT NULL,prompt_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());GRANT SELECT,INSERT ON ordinary_native_fixture_calls TO turas_runtime;`);}finally{await admin.end();}
 const runtime=new URL(process.env.DATABASE_URL!);runtime.searchParams.set('options','-c role=turas_runtime');
 await closeRuntimePool();process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_TEST_DATABASE_URL=runtime.href;
 process.env.TURAS_ORDINARY_NATIVE_FIXTURE='1';
 await environment.start();
 const browser=await webkit.launch({headless:true}),context=await browser.newContext({baseURL:environment.origin,viewport:{width:1440,height:1000},colorScheme:'dark'});
 let csrf:string|undefined;const errors:string[]=[];
 try{
  const login=await context.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'panel',password:process.env.PANEL_PASSWORD}});
  if(!login.ok())throw Error('Owned ordinary login failed');csrf=(await login.json()).data.csrfToken;
  const headers={origin:environment.origin,'x-csrf-token':csrf!};
  const operationId=randomUUID();const created=await context.request.post('/api/conversations',{headers,data:{requestKey:operationId,title:'Synthetic unpaid native correction'}});
  if(!created.ok())throw Error('Owned ordinary creation failed');const conversation=(await created.json()).data;
  let nativeSessionId:string|undefined;
  for(let i=0;i<5;i++){const bound=await context.request.post('/eve/v1/session',{headers:{...headers,'x-turas-conversation-id':conversation.id},data:{operationId}});if(bound.ok()){nativeSessionId=(await bound.json()).sessionId;break;}await writeFile(join(output,'binding-response-private.json'),JSON.stringify({status:bound.status(),body:await bound.text()}),{mode:0o600});if(bound.status()!==409)throw Error('Owned ordinary binding failed');await new Promise(resolve=>setTimeout(resolve,1000));}
  if(!nativeSessionId)throw Error('Owned ordinary binding was not confirmed');
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));
  await page.goto('/s/'+conversation.id,{waitUntil:'domcontentloaded'});
  const composer=page.getByRole('textbox',{name:'Message Turi'});await composer.waitFor({timeout:45000});
  await composer.fill('Hold this synthetic response until I correct it.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  async function until(check:()=>Promise<boolean>,name:string){const end=Date.now()+45000;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Owned ordinary timed out: '+name);}
  await until(async()=>Number((await query('SELECT count(*) AS n FROM ordinary_native_fixture_calls')).rows[0].n)>=1,'initial native provider');
  const before=(await query('SELECT id,deadline_at FROM response_attempts WHERE conversation_id=$1',[conversation.id])).rows;
  if(before.length!==1)throw Error('Initial response identity was duplicated');
  await until(()=>composer.isEnabled(),'correction composer');
  await composer.fill('Replace the first request with this correction.');
  const sent=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/eve/v1/session/'+nativeSessionId);
  await composer.press('Enter');const request=await sent;
  if(request.postDataJSON()?.turnPolicy!=='steer')throw Error('Native correction policy was not forwarded');
  await until(async()=>(await page.locator('.chat-message-assistant').allInnerTexts()).some(text=>text.trim()==='Correction applied to the same response.'),'corrected answer');
  await until(async()=>!await page.getByRole('button',{name:'Stop response',exact:true}).count(),'corrected completion');
  const after=(await query('SELECT id,deadline_at,response_state FROM response_attempts WHERE conversation_id=$1',[conversation.id])).rows;
  if(after.length!==1||after[0].id!==before[0].id||after[0].deadline_at.getTime()!==before[0].deadline_at.getTime())throw Error('Correction renewed its response allowance');
  const delivery=(await query('SELECT native_event_id,native_turn_id FROM ordinary_steering_deliveries WHERE attempt_id=$1',[before[0].id])).rows;
  if(delivery.length!==1||!delivery[0].native_event_id)throw Error('Native correction consumption was not projected');
  const ordered=await page.locator('.chat-message').allInnerTexts();if(ordered.findIndex(text=>text.trim()==='Replace the first request with this correction.')>ordered.findIndex(text=>text.trim()==='Correction applied to the same response.'))throw Error('Corrected answer appears before its correction');
  await page.screenshot({path:join(output,'correction-desktop.png'),fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  await until(async()=>(await page.locator('.chat-message-assistant').allInnerTexts()).some(text=>text.trim()==='Correction applied to the same response.'),'reloaded correction');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'correction-mobile.png'),fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Owned ordinary mobile overflow');
  await composer.fill('Hold this synthetic response until I stop it.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await until(async()=>Number((await query('SELECT count(*) AS n FROM response_attempts WHERE conversation_id=$1',[conversation.id])).rows[0].n)===2,'second response');
  await until(async()=>Number((await query('SELECT count(*) AS n FROM ordinary_native_fixture_calls')).rows[0].n)>=3,'second native provider');
  const cancellation=page.waitForResponse(response=>new URL(response.url()).pathname==='/eve/v1/session/'+nativeSessionId+'/cancel');await page.getByRole('button',{name:'Stop response',exact:true}).click();const cancellationResponse=await cancellation;await writeFile(join(output,'cancel-response-private.json'),JSON.stringify({status:cancellationResponse.status(),body:await cancellationResponse.text()}),{mode:0o600});
  if(!cancellationResponse.ok())throw Error('Native cancellation request failed');
  await until(async()=>Number((await query("SELECT count(*) AS n FROM response_attempts WHERE conversation_id=$1 AND response_state IN('pending','running','stopping')",[conversation.id])).rows[0].n)===0,'native cancellation');
  const retired=await context.request.post('/eve/v1/session/'+nativeSessionId+'/end',{headers,data:{reason:'Owned unpaid native check complete'}});
  if(!retired.ok())throw Error('Owned ordinary native retirement failed');
  const operations=(await query('SELECT sum(COALESCE(actual_tokens,ceiling_tokens))::int AS tokens FROM ordinary_model_operations WHERE conversation_id=$1',[conversation.id])).rows[0];
  if(operations.tokens>20000)throw Error('Native interruptions exceeded the ordinary allowance');
  const receipt={kind:'ordinary-native-mechanics',fixtureProvider:true,actualModelQuality:false,paidProviderCalls:0,webkit:true,correctionConsumed:true,sameAttempt:true,deadlinePreserved:true,reloadedHistory:true,stopSettled:true,nativeRetirementStatus:retired.status(),accountedOutputTokens:operations.tokens,pageErrors:errors};
  await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));for(const name of ['failure-private.log','failure-receipt-private.json','binding-response-private.json','attempts-private.json','cancel-response-private.json'])await rm(join(output,name),{force:true});
 }catch(error){await writeFile(join(output,'attempts-private.json'),JSON.stringify((await query('SELECT id,native_turn_id,response_state,dispatch_state,input_event_id FROM response_attempts')).rows,null,2),{mode:0o600});await writeFile(join(output,'failure-private.log'),environment.privateLogTail(),{mode:0o600});await writeFile(join(output,'failure-receipt-private.json'),JSON.stringify({name:error instanceof Error?error.name:'Unknown',message:error instanceof Error?error.message:String(error)},null,2),{mode:0o600});throw error;}
 finally{if(csrf)await context.request.post('/api/auth/logout',{headers:{origin:environment.origin,'x-csrf-token':csrf}}).catch(()=>{});await context.close();await browser.close();}
},{feature:'010',empty:true,deadlineAt:Date.now()+300000});}finally{
 delete process.env.TURAS_ORDINARY_NATIVE_FIXTURE;
 if(createHash('sha256').update(await readFile(authored)).digest('hex')!==originalDigest)throw Error('Authored root model changed during fixture verification');
}
