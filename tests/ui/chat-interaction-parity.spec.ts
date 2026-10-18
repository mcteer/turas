import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {test,expect,type Page} from '@playwright/test';
import type {MessageStreamEvent} from 'eve/client';
import {signIn,requireUiFixtureDatabaseUrl} from '../fixtures/ui';

// Real authenticated application/owned database, explicitly substituted native
// wire events. These assertions prove UI interaction, not provider execution.
type EventData<T extends MessageStreamEvent['type']>=Extract<MessageStreamEvent,{type:T}> extends {data:infer D}?D:Record<string,never>;
function wire<T extends MessageStreamEvent['type']>(type:T,data:EventData<T>):MessageStreamEvent{
 return {type,data,meta:{id:randomUUID(),at:new Date().toISOString()}} as MessageStreamEvent;
}
function transcript(native:string,answer:string){return [
 wire('session.started',{}),wire('turn.started',{turnId:'turn',sequence:0}),
 wire('message.received',{turnId:'turn',sequence:0,message:'Synthetic original question'}),
 wire('step.started',{turnId:'turn',sequence:0,stepIndex:0,modelId:'synthetic-ui-fixture'}),
 wire('message.completed',{turnId:'turn',sequence:0,stepIndex:0,message:answer,finishReason:'stop'}),
 wire('turn.completed',{turnId:'turn',sequence:0}),wire('session.waiting',{continuationToken:native,wait:'next-user-message'}),
];}
async function ownedChat(page:Page,events:(native:string)=>MessageStreamEvent[],options:{nativeFiles?:boolean}={}){
 requireUiFixtureDatabaseUrl();await signIn(page,'mcteer');
 const csrf=(await (await page.request.get('/api/auth/session')).json()).data.csrfToken;
 const created=await page.request.post('/api/conversations',{headers:{origin:process.env.TURAS_UI_BASE_URL!,'x-csrf-token':csrf},data:{requestKey:randomUUID(),title:'Synthetic interaction check'}});
 expect(created.status()).toBe(201);const id=(await created.json()).data.id,native='wrun_interaction_'+randomUUID().replaceAll('-','');
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();
 try{await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[id,native]);}finally{await db.end();}
 // This transport-only race substitutes upload failure below. Expose its file
 // control without enabling native uploads in the shared disposable runtime.
 if(options.nativeFiles)await page.route(`**/api/conversations/${id}`,async route=>{const response=await route.fetch();const body=await response.json();body.data.canAttachNativeFiles=true;await route.fulfill({response,json:body});});
 let current=events(native),reads=0;
 await page.route(`**/eve/v1/session/${native}/stream**`,route=>{reads++;return route.fulfill({status:200,contentType:'application/x-ndjson',headers:{'x-eve-stream-version':'25','x-eve-stream-tail-index':String(current.length-1)},body:current.map(event=>JSON.stringify(event)).join('\n')+'\n'});});
 await page.goto(`/s/${id}`);await expect(page.getByLabel('Message Turi',{exact:true})).toBeEditable();
 return {id,native,setEvents:(events:MessageStreamEvent[])=>{current=events;},reads:()=>reads};
}

test('legacy file paste/drop, empty Backspace and link flow use the current composer',async({page},info)=>{
 await signIn(page,'panel');await expect(page.getByRole('button',{name:'Attach documents',exact:true})).toBeEnabled();
 const composer=page.locator('form.chat-composer'),text=page.getByLabel('Message Turi',{exact:true});
 await text.fill('Keep this draft.');
 await text.evaluate(element=>{const transfer=new DataTransfer();transfer.items.add(new File(['Pasted unverified text'],'pasted.txt',{type:'text/plain'}));element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));});
 await expect(page.getByRole('button',{name:'Remove pasted.txt',exact:true})).toBeVisible();
 await composer.evaluate(element=>{const transfer=new DataTransfer();transfer.items.add(new File(['Dropped unverified text'],'dropped.txt',{type:'text/plain'}));element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
 await expect(page.getByRole('button',{name:'Remove dropped.txt',exact:true})).toBeVisible();
 await expect(text).toHaveValue('Keep this draft.');await text.fill('');await text.press('Backspace');
 await expect(page.getByRole('button',{name:'Remove dropped.txt',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Remove pasted.txt',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Remove pasted.txt',exact:true}).click();
 await text.fill('Inspect this page.');await page.getByRole('button',{name:'Add a link',exact:true}).click();
 await page.getByLabel('Link URL',{exact:true}).fill('https://example.com/reference');await page.getByRole('button',{name:'Add link',exact:true}).click();
 await expect(text).toHaveValue('Inspect this page.\nhttps://example.com/reference');
 await expect(page.getByRole('list',{name:'Message links'}).getByRole('link')).toHaveAttribute('href','https://example.com/reference');
 await page.getByRole('button',{name:'Remove link https://example.com/reference',exact:true}).click();
 await expect(text).toHaveValue('Inspect this page.\n');
 await text.press('Shift+Enter');await expect(text).toHaveValue('Inspect this page.\n\n');
 let sends=0;page.on('request',request=>{if(request.method()==='POST'&&/\/eve\/v1\/session(?:\/[^/]+)?$/.test(new URL(request.url()).pathname))sends++;});
 await text.dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});expect(sends).toBe(0);
 await text.fill(Array.from({length:12},()=> 'A line in the multiline composer.').join('\n'));
 expect((await text.boundingBox())!.height).toBeGreaterThan(100);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`local-artifacts/019/composer-${info.project.name}.png`,fullPage:true});
});

test('scroll escape, late growth, jump to latest and reload preserve the reading position',async({page},info)=>{
 const long=Array.from({length:45},(_,i)=>`### Review item ${i+1}\n\nCheck the evidence and the owner for this synthetic review.`).join('\n\n');
 const chat=await ownedChat(page,native=>transcript(native,long));
 const pane=page.getByRole('region',{name:'Conversation messages',exact:true});
 await expect(page.getByRole('heading',{name:'Review item 45',exact:true})).toBeAttached();
 await expect.poll(()=>pane.evaluate(p=>p.scrollHeight-p.clientHeight-p.scrollTop)).toBeLessThan(5);
 await pane.evaluate(p=>{p.scrollTop=180;p.dispatchEvent(new Event('scroll'));});
 await expect(page.getByRole('button',{name:'Scroll to bottom',exact:true})).toBeVisible();
 const before=await pane.evaluate(p=>p.scrollTop);
 // A late source/image layout change cannot steal the escaped reading position.
 await page.locator('.chat-messages-content').evaluate(content=>{const block=document.createElement('div');block.style.height='300px';content.append(block);});
 await expect.poll(()=>pane.evaluate(p=>p.scrollTop)).toBeCloseTo(before,0);
 await page.reload();await expect(page.getByRole('heading',{name:'Review item 45',exact:true})).toBeAttached();
 await expect.poll(()=>pane.evaluate(p=>p.scrollTop)).toBeCloseTo(before,0);
 await expect(page.getByRole('button',{name:'Scroll to bottom',exact:true})).toBeVisible();
 await page.screenshot({path:`local-artifacts/019/reading-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Scroll to bottom',exact:true}).click();
 await expect.poll(()=>pane.evaluate(p=>p.scrollHeight-p.clientHeight-p.scrollTop)).toBeLessThan(5);
 await expect(page.getByRole('button',{name:'Scroll to bottom',exact:true})).toHaveCount(0);
 const saved=await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`turas:chat-scroll:${id}`)!),chat.id);
 expect(Object.keys(saved).sort()).toEqual(['atBottom','scrollTop']);expect(saved.atBottom).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('tools stay inspectable and pending questions suppress background thinking then show their settled reply',async({page},info)=>{
 const action={kind:'tool-call' as const,callId:'lookup',toolName:'get_customer',input:{name:'Synthetic example'}};
 const request={requestId:'question-1',kind:'question' as const,action:{kind:'tool-call' as const,callId:'ask',toolName:'ask_question',input:{prompt:'Choose a target'}},prompt:'Choose a target',allowFreeform:true,options:[{id:'desktop',label:'Desktop'}]};
 const chat=await ownedChat(page,native=>{
  const all=transcript(native,'A source-backed synthetic answer.');
  all.splice(4,0,wire('actions.requested',{turnId:'turn',sequence:0,stepIndex:0,actions:[action]}),wire('action.result',{turnId:'turn',sequence:0,stepIndex:0,status:'completed',result:{kind:'tool-result',callId:'lookup',toolName:'get_customer',output:{found:true}}}));
  all.splice(-1,0,wire('subagent.completed',{callId:'research',subagentName:'implementation-research',output:'Working',backgroundTask:{taskId:'task_fixture',status:'working'}}),wire('input.requested',{turnId:'question-turn',sequence:1,stepIndex:0,requests:[request]}));
  return all;
 });
 await expect(page.getByRole('group',{name:'get customer Completed'})).toHaveCount(0); // Native details is a disclosure, not a decision.
 const tool=page.locator('details.chat-activity').filter({has:page.locator('summary',{hasText:'get customer'})});
 await expect(tool).toBeVisible();await tool.locator('summary').click();await expect(tool).toContainText('Synthetic example');await expect(tool).toContainText('found');
 await expect(page.getByRole('region',{name:'Turi question'})).toBeVisible();
 await expect(page.locator('.chat-thinking')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Desktop',exact:true})).toBeEnabled();
 await page.screenshot({path:`local-artifacts/019/question-${info.project.name}.png`,fullPage:true});
 const answered=transcript(chat.native,'Continued after the selected target.');
 answered.splice(4,0,wire('input.requested',{turnId:'turn',sequence:0,stepIndex:0,requests:[request]}),wire('input.resolved',{turnId:'turn',sequence:0,stepIndex:0,resolutions:[{requestId:request.requestId,kind:'question' as const,outcome:'answered',response:{requestId:request.requestId,optionId:'desktop'}}]}));
 chat.setEvents(answered);await page.reload();
 await expect(page.getByRole('region',{name:'Submitted response'})).toContainText('Desktop');
 await expect(page.getByRole('button',{name:'Desktop',exact:true})).toHaveCount(0);
 await expect(page.getByText('Response complete.',{exact:true})).toHaveCount(0);
});

test('ordinary busy chat accepts a correction once, preserves the next draft and confirms Stop separately',async({page})=>{
 const chat=await ownedChat(page,native=>transcript(native,'A settled synthetic initial answer.'));
 const text=page.getByLabel('Message Turi',{exact:true});
 let sends=0,policy='';let releaseFirst!:()=>void,releaseCorrection!:()=>void;
 const first=new Promise<void>(resolve=>{releaseFirst=resolve;}),correction=new Promise<void>(resolve=>{releaseCorrection=resolve;});
 await page.route(`**/eve/v1/session/${chat.native}`,async route=>{
  if(route.request().method()!=='POST')return route.continue();const index=++sends;
  if(index===2)policy=route.request().postDataJSON().turnPolicy;
  await(index===1?first:correction);await route.fulfill(index===1?{status:202,json:{sessionId:chat.native,deliveryId:'synthetic-first-delivery'}}:{status:503,json:{code:'synthetic_delivery_unavailable'}}).catch(()=>{});
 });
 try{
  await text.fill('Begin a synthetic held delivery.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect.poll(()=>sends).toBe(1);
  await expect(page.getByRole('button',{name:'Stop response',exact:true})).toBeVisible();await expect(text).toBeEditable();
  await text.fill('Use the corrected synthetic constraint.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  releaseFirst();await expect.poll(()=>sends).toBe(2);expect(policy).toBe('steer');
  await expect(text).toHaveValue('');await text.fill('The next unsent draft must survive.');releaseCorrection();
  await expect(text).toHaveValue('The next unsent draft must survive.');
  await text.fill('');let stops=0;
  await page.route(`**/eve/v1/session/${chat.native}/cancel`,route=>{stops++;return route.fulfill({status:202,json:{ok:true}});});
  await page.getByRole('button',{name:'Stop response',exact:true}).click();
  await expect.poll(()=>stops).toBe(1);await expect(page.getByRole('button',{name:'Stop response',exact:true})).toBeDisabled();
  await expect(page.getByText('Stopping requested. Waiting for confirmation…',{exact:true})).toBeVisible();
  chat.setEvents([wire('session.started',{}),wire('turn.cancelled',{turnId:'running',sequence:0}),wire('session.waiting',{continuationToken:chat.native,wait:'next-user-message'})]);
  await page.reload();await expect(page.getByText('Response cancelled. Partial output may be visible.',{exact:true})).toBeVisible();
  expect(stops).toBe(1);expect(sends).toBe(2);
 }finally{releaseFirst();releaseCorrection();}
});

test('a failed initial history read recovers saved scrolling on the next authoritative refresh',async({page})=>{
 await page.clock.install();
 const long=Array.from({length:40},(_,i)=>`### Recovery item ${i+1}\n\nSynthetic long history for delayed restoration.`).join('\n\n');
 const chat=await ownedChat(page,native=>transcript(native,long));
 await page.getByRole('heading',{name:'Recovery item 40',exact:true}).waitFor({state:'attached'});
 const viewport=page.getByRole('region',{name:'Conversation messages',exact:true});
 // Wait for the initial authoritative history positioning before introducing
 // the saved offset; the failure under test happens on the subsequent reload.
 await expect.poll(()=>viewport.evaluate(p=>p.scrollHeight-p.clientHeight-p.scrollTop)).toBeLessThan(5);
 await viewport.evaluate(p=>{p.scrollTop=220;p.dispatchEvent(new Event('scroll'));});
 await expect(page.getByRole('button',{name:'Scroll to bottom',exact:true})).toBeVisible();
 let reads=0;
 await page.route(`**/api/conversations/${chat.id}`,route=>{if(++reads===1)return route.fulfill({status:503,json:{error:{code:'synthetic_initial_failure'}}});return route.continue();});
 await page.reload();await expect(page.getByRole('heading',{name:'Recovery item 40',exact:true})).toBeAttached();
 await expect.poll(()=>reads).toBeGreaterThan(1);
 const pane=page.getByRole('region',{name:'Conversation messages',exact:true});
 await expect.poll(()=>pane.evaluate(p=>p.scrollTop)).toBeCloseTo(220,0);
 await expect(page.getByRole('button',{name:'Scroll to bottom',exact:true})).toBeVisible();
 let deniedReads=0;
 await page.route(`**/api/conversations/${chat.id}`,route=>{deniedReads++;return route.fulfill({status:404,json:{error:{code:'not_found'}}});});
 await expect(page.getByRole('heading',{name:'Chat Unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Message Turi'})).toHaveCount(0);
 const stopped=deniedReads;
 await page.clock.fastForward(10_000);
 await page.waitForLoadState('networkidle');
 expect(deniedReads).toBe(stopped);
});

test('a rejected main-composer question answer retains its draft without a second delivery',async({page})=>{
 const request={requestId:'question-rejected',kind:'question' as const,action:{kind:'tool-call' as const,callId:'ask-rejected',toolName:'ask_question',input:{}},prompt:'Which target should be checked?',allowFreeform:true};
 const chat=await ownedChat(page,native=>[wire('session.started',{}),wire('input.requested',{turnId:'waiting',sequence:0,stepIndex:0,requests:[request]}),wire('session.waiting',{continuationToken:native,wait:'next-user-message'})]);
 await expect(page.getByRole('region',{name:'Turi question'})).toBeVisible();
 let responses=0;
 await page.route(`**/eve/v1/session/${chat.native}`,route=>{if(route.request().method()!=='POST')return route.continue();responses++;return route.fulfill({status:503,json:{code:'synthetic_response_unavailable'}});});
 const text=page.getByLabel('Message Turi',{exact:true});await text.fill('Keep this unconfirmed answer.');await text.press('Enter');
 await expect.poll(()=>responses).toBe(1);await expect(text).toHaveValue('Keep this unconfirmed answer.');
 await expect(page.getByText('Your response could not be confirmed. Reload to check its status.',{exact:true})).toBeVisible();
 expect(responses).toBe(1);
});

test('an older failed delivery cannot unlock a newer file preparation',async({page})=>{
 const chat=await ownedChat(page,native=>transcript(native,'Synthetic settled baseline.'),{nativeFiles:true});
 let releaseDelivery!:()=>void,releaseUpload!:()=>void;const delivery=new Promise<void>(resolve=>{releaseDelivery=resolve;}),upload=new Promise<void>(resolve=>{releaseUpload=resolve;});let sends=0,uploads=0,settled=false;
 await page.route(`**/api/conversations/${chat.id}/attempts/*`,route=>settled?route.fulfill({status:200,json:{data:{dispatchState:'admitted',responseState:'failed',watchdogState:null}}}):route.continue());
 await page.route(`**/eve/v1/session/${chat.native}`,async route=>{if(route.request().method()!=='POST')return route.continue();sends++;await delivery;await route.fulfill({status:503,json:{code:'synthetic_old_delivery_failed'}}).catch(()=>{});});
 await page.route(`**/api/conversations/${chat.id}/native-uploads`,async route=>{if(route.request().method()!=='POST')return route.continue();uploads++;await upload;await route.fulfill({status:503,json:{error:{code:'synthetic_upload_unavailable'}}}).catch(()=>{});});
 const text=page.getByLabel('Message Turi',{exact:true});
 try{
  await text.fill('The first held delivery.');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect.poll(()=>sends).toBe(1);
  await page.getByLabel('Chat document files',{exact:true}).setInputFiles({name:'newer.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z0YAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('button',{name:'Remove newer.png',exact:true})).toBeVisible();await text.fill('A newer correction is preparing this file.');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect.poll(()=>uploads).toBe(1);
  const failed=page.waitForResponse(response=>new URL(response.url()).pathname===`/eve/v1/session/${chat.native}`&&response.status()===503);settled=true;releaseDelivery();await failed;
  // Let the first request's nonthrowing SDK onError and finally settle while
  // the second preparation stays held. Its lock and draft must remain owned.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // The authoritative application receipt clears A's pending key and marks it
  // failed, so a fresh error-state send would otherwise be eligible.
  await expect(page.getByRole('button',{name:'Check status',exact:true})).toHaveCount(0,{timeout:10000});
  await expect(text).toBeDisabled();await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
  await text.dispatchEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});expect(sends).toBe(1);expect(uploads).toBe(1);
  releaseUpload();await expect(text).toBeEditable();await expect(text).toHaveValue('A newer correction is preparing this file.');
  await expect(page.getByRole('button',{name:'Remove newer.png',exact:true})).toBeVisible();expect(sends).toBe(1);expect(uploads).toBe(1);
 }finally{releaseDelivery();releaseUpload();}
});
