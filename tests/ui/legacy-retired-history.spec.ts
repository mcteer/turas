import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {test as base,expect} from '@playwright/test';
import {signIn,requireUiFixtureDatabaseUrl} from '../fixtures/ui';
import {prepareAttempt} from '../../lib/server/conversations/dispatch';
import {getCurrentSession} from '../../lib/server/auth/sessions';

const test=base.extend<{retiredConversation:string;nativeProtocol:25|27}>({nativeProtocol:[25,{option:true}],retiredConversation:[async({page,nativeProtocol},use)=>{
 const databaseUrl=requireUiFixtureDatabaseUrl();
 await signIn(page,'mcteer');
 const cookie=(await page.context().cookies()).find(c=>c.name==='turas_session'||c.name==='__Host-turas_session');
 if(!cookie)throw Error('Owned browser session required');
 const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${cookie.name}=${cookie.value}`}}));
 if(!actor)throw Error('Owned browser actor required');
 const auth=await page.request.get('/api/auth/session');expect(auth.status()).toBe(200);
 const csrf=(await auth.json()).data.csrfToken;
 const created=await page.request.post('/api/conversations',{headers:{origin:process.env.TURAS_UI_BASE_URL!,'x-csrf-token':csrf},data:{requestKey:randomUUID(),title:'Synthetic retained history'}});
 expect(created.status()).toBe(201);const id=(await created.json()).data.id;
 const nativeId='wrun_retired_'+randomUUID().replaceAll('-','');
 const db=new Client({connectionString:databaseUrl});await db.connect();
 try{
  await db.query('BEGIN');
  await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2,native_protocol=$3 WHERE id=$1",[id,nativeId,nativeProtocol]);
  await db.query("INSERT INTO ordinary_native_retirements(id,environment_id,workspace_id,owner_principal_id,conversation_id,native_session_id,state,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,'confirmed',clock_timestamp())",[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.principalId,id,nativeId]);
  const events=[['message.received',{message:'Synthetic question',parts:[{type:'text',text:'Synthetic question'},{type:'file',filename:'retired.png',mediaType:'image/png',size:42}]}],['message.completed',{message:'**Retained synthetic answer** with [source](https://example.com/source).'}],['message.received',{message:'Synthetic follow-up'}],['message.completed',{message:'Second retained synthetic answer.'}]] as const;
  for(const [index,[type,payload]] of events.entries())await db.query("INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,event_type,turn_id,visible_payload,emitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'2026-10-01T00:00:00Z'::timestamptz + $4::bigint * interval '1 second')",[randomUUID(),id,nativeId,index,type,'turn_'+Math.floor(index/2),JSON.stringify(payload)]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
 await use(id);
},{timeout:30_000}]});

test('retired chat preserves complete turns across reload without reconnecting or reviving files',async({page,retiredConversation})=>{
 const errors:string[]=[],eveRequests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/eve/'))eveRequests.push(request.url());});
 await page.goto(`/s/${retiredConversation}`);
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 await expect(page.getByText('Retained synthetic answer',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'source',exact:true})).toHaveAttribute('href','https://example.com/source');
 await expect(page.getByText('retired.png',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'View retired.png'})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Message Turi'})).toHaveCount(0);
 await page.waitForLoadState('networkidle');
 await page.reload();await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 await page.waitForLoadState('networkidle');
 const detail=await page.request.get(`/api/conversations/${retiredConversation}`);expect(detail.status()).toBe(200);expect((await detail.json()).data.nativeRetired).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(eveRequests).toEqual([]);expect(errors).toEqual([]);
});

test('another internal account cannot read retained private conversation history',async({browser,retiredConversation})=>{
 const context=await browser.newContext({baseURL:process.env.TURAS_UI_BASE_URL});
 try{const page=await context.newPage();await signIn(page,'panel');
  expect((await page.request.get(`/api/conversations/${retiredConversation}`)).status()).toBe(404);
  await page.goto(`/s/${retiredConversation}`);
  await expect(page.getByText('Retained synthetic answer',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Synthetic question',{exact:true})).toHaveCount(0);
 }finally{await context.close();}
});

test('retained view clears generated history when its authorized read fails and recovers on retry',async({page,retiredConversation})=>{
 await page.route(`**/api/conversations/${retiredConversation}`,route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto(`/s/${retiredConversation}`);
 await expect(page.getByText('Conversation access could not be confirmed.',{exact:true})).toBeVisible();
 await expect(page.locator('.chat-message')).toHaveCount(0);
 await page.unroute(`**/api/conversations/${retiredConversation}`);
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
});

test('a later interrupted step survives an earlier completed step and long history is disclosed',async({page,retiredConversation})=>{
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();
 try{
  await db.query("INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,event_type,turn_id,step_index,visible_payload,emitted_at) SELECT $1,id,eve_session_id,4,'message.appended','turn_1',1,$3,'2026-10-01T00:00:05Z' FROM conversations WHERE id=$2",[randomUUID(),retiredConversation,JSON.stringify({messageDelta:'Retained interrupted later step'})]);
  await db.query("UPDATE event_projections SET step_index=0 WHERE conversation_id=$1 AND event_type='message.completed'",[retiredConversation]);
  await db.query("INSERT INTO event_projections(native_event_id,conversation_id,native_session_id,stream_index,event_type,visible_payload,emitted_at) SELECT $2||n,c.id,c.eve_session_id,5+n,'message.received',jsonb_build_object('message','Synthetic later question '||n),'2026-10-02T00:00:00Z'::timestamptz+n*interval '1 second' FROM conversations c CROSS JOIN generate_series(1,501)n WHERE c.id=$1",[retiredConversation,randomUUID()]);
 }finally{await db.end();}
 await page.goto(`/s/${retiredConversation}`);
 await expect(page.getByText('Retained interrupted later step',{exact:true})).toBeVisible();
 await expect(page.getByText('Partial response',{exact:true})).toBeVisible();
 await expect(page.getByText('This conversation is long. Only the first 500 saved events and recent partial responses are shown.',{exact:true})).toBeVisible();
});

// UI integration only: seed authoritative failed projections and let the real
// SDK resume an explicitly empty transport. The native staged-file gate covers
// the separate real provider-failure lifecycle.
test.describe('current native runtime',()=>{
 test.use({nativeProtocol:27});
 test('active failed history survives empty SDK resume, reload, a later send attempt and current-read fences',async({page,retiredConversation,browser})=>{
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();let nativeId:string;
 try{
  nativeId=(await db.query('SELECT eve_session_id FROM conversations WHERE id=$1',[retiredConversation])).rows[0].eve_session_id;
  await db.query('DELETE FROM ordinary_native_retirements WHERE conversation_id=$1',[retiredConversation]);
  const cookie=(await page.context().cookies()).find(c=>c.name==='turas_session'||c.name==='__Host-turas_session');if(!cookie)throw Error('Fixture owner cookie missing');const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${cookie.name}=${cookie.value}`}}));if(!actor)throw Error('Fixture owner missing');await db.query("INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at",[process.env.TURAS_ENVIRONMENT_ID,'ui-active-history-'+randomUUID()]);const prepared=await prepareAttempt(actor,retiredConversation,nativeId,randomUUID(),'Synthetic question');await db.query("UPDATE response_attempts SET response_state='failed',dispatch_state='admitted',native_turn_id='turn_0',input_event_id=(SELECT native_event_id FROM event_projections WHERE conversation_id=$2 AND event_type='message.received' ORDER BY emitted_at LIMIT 1) WHERE id=$1",[prepared.attemptId,retiredConversation]);
 }finally{await db.end();}
 let emptyResumes=0,sends=0;
 await page.route(`**/eve/v1/session/${nativeId}/stream**`,route=>{emptyResumes++;return route.fulfill({status:200,contentType:'application/x-ndjson',headers:{'x-eve-stream-tail-index':'-1','x-eve-stream-version':'27'},body:''});});
 await page.route(`**/eve/v1/session/${nativeId}`,route=>{if(route.request().method()==='POST'){sends++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'synthetic_display_send_unavailable'})});}return route.continue();});
 await page.goto(`/s/${retiredConversation}`);
 await expect(page.getByText('retired.png',{exact:true})).toBeVisible();
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 await expect.poll(()=>emptyResumes).toBeGreaterThan(0);
 await test.step('Reload retained failed history',async()=>{await page.reload();});
 await test.step('Verify retained file after reload',async()=>{await expect(page.getByText('retired.png',{exact:true})).toBeVisible();});
 await page.getByRole('textbox',{name:'Message Turi',exact:true}).fill('A subsequent synthetic turn');
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect.poll(()=>sends).toBe(1);
 await expect(page.getByText('retired.png',{exact:true})).toBeVisible();
 await expect(page.getByText('Retained synthetic answer',{exact:true})).toHaveCount(1);
 // The fallback must disappear after its real authenticated read fails, then
 // recover only after another successful current authorized response.
 await page.route(`**/api/conversations/${retiredConversation}`,route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await expect(page.locator('.chat-message-assistant')).toHaveCount(0);
 await page.unroute(`**/api/conversations/${retiredConversation}`);
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 // Hold the older initial successful read across a newer failed refresh.
 let releaseOld!:()=>void,seenNewerFailure!:()=>void;
 const held=new Promise<void>(resolve=>{releaseOld=resolve;}),newerFailed=new Promise<void>(resolve=>{seenNewerFailure=resolve;});let heldFirst=false;
 await page.route(`**/api/conversations/${retiredConversation}`,async route=>{
  if(!heldFirst){heldFirst=true;const original=await route.fetch();await held;return route.fulfill({response:original});}
  await route.fulfill({status:503,contentType:'application/json',body:'{}'});seenNewerFailure();
 });
 await page.reload({waitUntil:'domcontentloaded'});await newerFailed;
 const oldResponse=page.waitForResponse(response=>response.url().endsWith(`/api/conversations/${retiredConversation}`)&&response.status()===200);
 releaseOld();await oldResponse;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator('.chat-message')).toHaveCount(0);
 await page.unroute(`**/api/conversations/${retiredConversation}`);
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 // Slow successful reads remain usable while a newer poll is still pending.
 let releaseSlow!:()=>void,releaseNewer!:()=>void,newerStarted!:()=>void;
 const slow=new Promise<void>(resolve=>{releaseSlow=resolve;}),newer=new Promise<void>(resolve=>{releaseNewer=resolve;}),started=new Promise<void>(resolve=>{newerStarted=resolve;});let firstSlow=true;
 await page.route(`**/api/conversations/${retiredConversation}`,async route=>{const response=await route.fetch();if(firstSlow){firstSlow=false;await slow;}else{newerStarted();await newer;}return route.fulfill({response});});
 await page.reload({waitUntil:'domcontentloaded'});await started;releaseSlow();
 await expect(page.locator('.chat-message-assistant')).toHaveCount(2);
 releaseNewer();await page.unroute(`**/api/conversations/${retiredConversation}`);
 await page.route(`**/api/conversations/${retiredConversation}`,async route=>{const response=await route.fetch(),body=await response.json();body.data.contextStatus='changed';body.data.history=body.data.history.filter((event:{eventType:string})=>event.eventType==='message.received');return route.fulfill({response,json:body});});
 await expect(page.getByText('Customer context has changed. Start a new conversation to use current information.',{exact:true})).toBeVisible();
 await expect(page.locator('.chat-message-assistant')).toHaveCount(0);
 const other=await browser.newContext({baseURL:process.env.TURAS_UI_BASE_URL});try{const outsider=await other.newPage();await signIn(outsider,'panel');expect((await outsider.request.get(`/api/conversations/${retiredConversation}`)).status()).toBe(404);}finally{await other.close();}
});

});
