import {join} from 'node:path';
import {webkit,expect} from '@playwright/test';
import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {hostedRootBudgetSchema} from '../lib/server/conversations/hosted-root-budget';
import {terminalNativeRetirementReceipt} from '../lib/server/conversations/native-retirement-recovery';
import {boundedHostedJson} from './pilot-hosted-http';
import {reconcileHostedRootGeneration} from './pilot-hosted-root-reconcile';

/** Two actual root sends, never retried. Binding/admission and original058
 * authority must already exist. Browser observations cannot settle a charge. */
export async function runHostedRootBrowser(input:{scope:PilotHostedScope;db:Client;ownerDb:Client;headers:Headers;binding:unknown;conversationId:string;signal:AbortSignal;mobile:boolean;evidenceDirectory:string}){
 const {scope,db,ownerDb,headers,signal}=input,binding=hostedRootBudgetSchema.parse(input.binding),id=z.uuid().parse(input.conversationId),origin=new URL(scope.origin).origin;
 if(!binding.conversationIds.includes(id)||binding.sourceCommit!==scope.sourceCommit||binding.target!==scope.target||binding.projectId!==scope.projectId||binding.workspaceId!==scope.workspaceId||binding.environmentMarker!==scope.environmentMarker)throw Error('Exact original root browser authority required');
 const cookie=/(?:^|;\s*)((?:__Host-)?turas_session)=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.get('cookie')??'');
 if(!cookie||!headers.get('x-csrf-token'))throw Error('Authenticated root owner and CSRF required');
 async function conversation(){
  const row=(await db.query(`SELECT id,owner_principal_id,creation_operation_id,eve_session_id,binding_state,archived_at FROM conversations WHERE id=$1 AND workspace_id=$2 AND environment_id=$3`,[id,scope.workspaceId,scope.environmentMarker])).rows[0];
  if(!row||row.owner_principal_id!==binding.ownerPrincipalId)throw Error('Original root owner differs');return row;
 }
 const original=await conversation();
 if(original.archived_at||original.binding_state!=='unbound'||original.eve_session_id||(await db.query('SELECT 1 FROM response_attempts WHERE conversation_id=$1',[id])).rowCount)throw Error('Fresh original root conversation required');
 signal.throwIfAborted();
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:input.mobile?{width:390,height:844}:{width:1440,height:900},serviceWorkers:'block',extraHTTPHeaders:headers.has('x-vercel-protection-bypass')?{'x-vercel-protection-bypass':headers.get('x-vercel-protection-bypass')!}:{}}).catch(async error=>{
  try{await browser.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Browser context setup and closure failed');}throw error;
 });
 const abort=()=>{void context.close().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 let native:string|undefined,posts=0,forbidden=false,releaseMismatch=false;
 async function nativePost(path:string,body:unknown,cleanup=false){
  const response=await fetch(origin+path,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:cleanup?AbortSignal.timeout(10000):AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  try{if(!response.ok)throw Error('Native root command failed');return await boundedHostedJson(response);}finally{await response.body?.cancel().catch(()=>{});}
 }
 async function attempts(){return (await db.query('SELECT id,deadline_at,response_state FROM response_attempts WHERE conversation_id=$1 ORDER BY created_at,id',[id])).rows;}
 async function operations(){return (await db.query(`SELECT o.id FROM parity_evaluation_operations o WHERE o.budget_id=$1 AND o.provider::jsonb->>'attemptId' IN(SELECT id::text FROM response_attempts WHERE conversation_id=$2) ORDER BY o.created_at,o.id`,[binding.budgetId,id])).rows;}
 async function until(check:()=>Promise<boolean>){const end=Date.now()+90000;while(Date.now()<end){signal.throwIfAborted();if(await check())return;await new Promise<void>(done=>setTimeout(done,200));}throw Error('Actual root transition timed out');}
 let failure:unknown,receipt:unknown;
 try{
  const bound=z.object({sessionId:z.string().min(1).max(256)}).parse(await nativePost('/eve/v1/session',{operationId:original.creation_operation_id}));native=bound.sessionId;
  if((await conversation()).eve_session_id!==native)throw Error('Actual native binding differs');
  await context.addCookies([{name:cookie[1],value:cookie[2],url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   if(url.origin!==origin||!(['GET','HEAD'].includes(method)||method==='POST'&&[ '/eve/v1/session/'+native,'/eve/v1/session/'+native+'/cancel'].includes(url.pathname))){forbidden=true;await route.abort();return;}
   if(method==='POST'&&url.pathname==='/eve/v1/session/'+native&&++posts>2){forbidden=true;await route.abort();return;}
   await route.continue();
  });
  page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/')&&response.headers()['x-turas-code-version']!==scope.sourceCommit)releaseMismatch=true;});
  await page.goto(origin+'/s/'+id,{waitUntil:'domcontentloaded'});
  const composer=page.getByRole('textbox',{name:'Message Turi'});
  await composer.fill('Synthetic transport exercise. Write 180 numbered lines, each saying: This is synthetic test data. Do not use tools.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await until(async()=> (await attempts()).length===1&&(await operations()).length===1&&await page.locator('.chat-message-assistant').last().innerText().then(text=>text.length>20).catch(()=>false));
  const before=(await attempts())[0];if(before.response_state!=='running')throw Error('Response ended before actual streaming reload');
  await page.reload({waitUntil:'domcontentloaded'});
  await until(async()=> (await attempts())[0]?.response_state==='completed');
  const after=await attempts();
  if(after.length!==1||after[0].id!==before.id||after[0].deadline_at.getTime()!==before.deadline_at.getTime()||(await operations()).length!==1||posts!==1)throw Error('Reload changed original attempt, deadline or provider dispatch');
  await expect(page.locator('.chat-message-assistant').last()).toContainText('synthetic test data');
  await page.screenshot({path:join(input.evidenceDirectory,'root-'+(input.mobile?'mobile':'desktop')+'-reloaded-private.png'),fullPage:true});
  await composer.fill('Synthetic cancellation exercise. Write 240 numbered lines, each saying: This is synthetic test data. Do not use tools.');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await until(async()=> (await attempts()).length===2&&(await operations()).length===2&&Number((await db.query("SELECT count(*)::int AS n FROM operations_hosted_root_provider_identities i JOIN parity_evaluation_operations o ON o.id=i.operation_id WHERE o.budget_id=$1 AND i.identity_kind='gateway_generation' AND o.provider::jsonb->>'attemptId' IN(SELECT id::text FROM response_attempts WHERE conversation_id=$2)",[binding.budgetId,id])).rows[0].n)===2);
  const second=(await attempts())[1];if(second.response_state!=='running')throw Error('Response ended before actual UI Stop');
  const cancelled=page.waitForResponse(response=>new URL(response.url()).pathname==='/eve/v1/session/'+native+'/cancel'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Stop response',exact:true}).click();if(!(await cancelled).ok())throw Error('Actual native Stop rejected');
  await until(async()=> (await attempts())[1]?.response_state==='cancelled');
  await page.screenshot({path:join(input.evidenceDirectory,'root-'+(input.mobile?'mobile':'desktop')+'-stopped-private.png'),fullPage:true});
  if(Number(posts)!==2||forbidden||releaseMismatch||(await operations()).length!==2)throw Error('Root browser dispatch or release boundary differs');
  const accounting=[];
  for(const operation of await operations()){
   const result=await reconcileHostedRootGeneration({db:ownerDb,scope,operationId:operation.id,signal});
   if(!result.reconciliationSuccessful)throw Error('Actual root cost exceeded original ceiling');accounting.push(result);
  }
  receipt={contract:'pilot-hosted-root-browser-v1',conversationId:id,mobile:input.mobile,actualUiSends:2,streamingReload:true,sameAttempt:true,deadlinePreserved:true,noReloadResend:true,actualStop:true,accounting,fullHostedCatalogVerified:false};
 }catch(error){failure=error;}
 // Reconcile binding after an uncertain response without issuing another create.
 try{
  const row=await conversation();native=row.eve_session_id??native;
  if(native){
   if(!terminalNativeRetirementReceipt(native,await nativePost('/eve/v1/session/'+encodeURIComponent(native)+'/reset',{reason:'Synthetic root transport exercise completed'},true)))throw Error('Exact native retirement receipt missing');
   const retired=(await db.query("SELECT 1 FROM ordinary_native_retirements WHERE conversation_id=$1 AND native_session_id=$2 AND state='confirmed'",[id,native])).rowCount;
   if(!retired)throw Error('Durable native retirement unconfirmed');
  }
  const response=await fetch(origin+'/api/conversations/'+id,{method:'PATCH',headers,body:JSON.stringify({archived:true}),redirect:'error',signal:AbortSignal.timeout(10000)});
  await response.body?.cancel();if(!response.ok||!(await conversation()).archived_at)throw Error('Root conversation archive unconfirmed');
 }catch(error){failure=failure?new AggregateError([failure,error],'Root exercise and retirement incomplete'):error;}
 finally{
  signal.removeEventListener('abort',abort);
  const closed=await Promise.allSettled([context.close(),browser.close()]);
  const errors=closed.flatMap(result=>result.status==='rejected'?[result.reason]:[]);
  if(errors.length)failure=new AggregateError([...(failure?[failure]:[]),...errors],'Root browser closure incomplete');
 }
 if(failure)throw failure;return receipt;
}
