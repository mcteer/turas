import AxeBuilder from '@axe-core/playwright';
import {test,expect,type Page} from '@playwright/test';
import {withLearningDatabase} from '../fixtures/learning/environment';
import {learningTestActors,learningScopedFixture,learningAcceptedOriginal} from '../fixtures/learning/setup';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
test.beforeEach(()=>{if(process.env.TURAS_LEARNING_UI_FIXTURE_READY!=='1')throw Error('Owned learning UI runner required');});
test('internal author prepares and cancels a current-original draft without a paid call',async({page})=>{
 const actors=await withLearningDatabase(learningTestActors);await test.step('Open learning draft',async()=>{await page.context().addCookies([{name:'turas_session',value:actors.member.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);await page.goto('/learning/drafts/new');});await test.step('Prepare learning draft',async()=>{await page.getByRole('combobox',{name:'Customer',exact:true}).selectOption(DEMO_IDS.sharedCustomer);await page.getByRole('group',{name:'Selected Accepted Originals',exact:true}).getByRole('checkbox').first().check();await page.getByRole('textbox',{name:'Proposed Reuse Basis',exact:true}).fill('Synthetic permission, subject to independent rights review');await page.getByRole('textbox',{name:'Question for Turi',exact:true}).fill('Propose a sanitized practice from the selected original');await page.getByRole('textbox',{name:'Maximum Spend (USD)',exact:true}).fill('25');await page.getByRole('button',{name:'Prepare Draft',exact:true}).click();await expect(page.getByRole('button',{name:'Start Prepared Draft',exact:true})).toBeVisible();});
 await test.step('Verify learning draft',async()=>{await expect(page).toHaveURL(/\/learning\/drafts\/[0-9a-f-]+$/);await expect(page.getByRole('heading',{name:'Learning Draft',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Question for Turi',exact:true})).toHaveCount(0);
 // Require the authored navigation title before auditing; visible destination
 // content alone does not assert metadata readiness. Keep every Axe rule.
 await expect(page).toHaveTitle('Turas');});
 await test.step('Audit learning draft',async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??'')).map(v=>v.id)).toEqual([]);});
 const id=new URL(page.url()).pathname.split('/').at(-1);await test.step('Cancel learning draft',async()=>{await page.getByRole('button',{name:'Cancel Draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Start Prepared Draft',exact:true})).toHaveCount(0);
 await withLearningDatabase(async db=>{expect((await db.query('SELECT count(*)::int n FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id WHERE a.id=$1',[id])).rows[0].n).toBe(0);});});
 await test.step('Verify learning partner denial',async()=>{await page.context().addCookies([{name:'turas_session',value:actors.partner.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);await page.goto('/learning/drafts/new');await expect(page.getByText('Draft preparation is available to internal members.',{exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Maximum Spend (USD)',exact:true})).toHaveCount(0);});
});


type PreparedReceipt={requestId:string;targetId:string;outcome:string};
async function prepareLearningForm(page:Page){
 const scope=await withLearningDatabase(async db=>{
  const scope=await learningScopedFixture(db);
  await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[scope.workspaceId]);
  await learningAcceptedOriginal(db,scope.actors.member,scope.actors.admin,scope.customerId);
  return scope;
 });
 const actors=scope.actors;
 await page.context().addCookies([{name:'turas_session',value:actors.member.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
 await page.goto('/learning/drafts/new');
 await page.getByRole('combobox',{name:'Customer',exact:true}).selectOption(scope.customerId);
 await page.getByRole('group',{name:'Selected Accepted Originals',exact:true}).getByRole('checkbox').first().check();
 await page.getByRole('textbox',{name:'Proposed Reuse Basis',exact:true}).fill('Synthetic permission, subject to independent rights review');
 await page.getByRole('textbox',{name:'Question for Turi',exact:true}).fill('Propose a sanitized practice from the selected original');
 await page.getByRole('textbox',{name:'Maximum Spend (USD)',exact:true}).fill('25');
}
async function preparedWithoutPaidReservation(id:string){
 await withLearningDatabase(async db=>{
  expect((await db.query('SELECT state FROM learning_attempts WHERE id=$1',[id])).rows[0]?.state).toBe('prepared');
  expect((await db.query('SELECT count(*)::int n FROM learning_budget_reservations WHERE attempt_id=$1',[id])).rows[0].n).toBe(0);
 });
}
test('confirmed draft navigation does not wait for a customer-list refresh and uses fresh destination reads',async({page})=>{
 const observed:{receipt?:PreparedReceipt;posts:number;detailReads:number;authReads:number}={posts:0,detailReads:0,authReads:0};
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 page.on('response',response=>{if(!observed.receipt||!response.ok())return;const path=new URL(response.url()).pathname;if(path==='/api/learning/drafts/'+observed.receipt.targetId)observed.detailReads++;if(path==='/api/auth/session')observed.authReads++;});
 await page.route(url=>url.pathname==='/api/learning/drafts',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  observed.posts++;const response=await route.fetch({maxRetries:0,maxRedirects:0});const body=await response.json();expect(response.ok()).toBe(true);expect(body.data.outcome).toBe('committed');observed.receipt=body.data;await route.fulfill({response});
 });
 await page.route(url=>url.pathname==='/api/customers',async route=>{if(observed.receipt)await held;if(!page.isClosed())await route.continue();});
 try{
  await prepareLearningForm(page);await page.getByRole('button',{name:'Prepare Draft',exact:true}).click();
  await expect(page.getByRole('button',{name:'Start Prepared Draft',exact:true})).toBeVisible();
  const receipt=observed.receipt;if(!receipt)throw Error('Actual committed draft receipt required');
  await expect(page).toHaveURL(new URL('/learning/drafts/'+receipt.targetId,process.env.TURAS_UI_BASE_URL!).href);
  expect(observed.posts).toBe(1);expect(observed.detailReads).toBeGreaterThan(0);expect(observed.authReads).toBeGreaterThan(0);
  await preparedWithoutPaidReservation(receipt.targetId);
  await page.getByRole('button',{name:'Cancel Draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();
 }finally{release();}
});
for(const fault of ['lost acknowledgement','invalid target','foreign request','uncommitted outcome']as const)test('draft '+fault+' remains pending until its actual server receipt is reconciled',async({page})=>{
 const observed:{receipt?:PreparedReceipt;posts:number}={posts:0};
 await page.route(url=>url.pathname==='/api/learning/drafts',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  observed.posts++;const response=await route.fetch({maxRetries:0,maxRedirects:0});const body=await response.json();expect(response.ok()).toBe(true);expect(body.data.outcome).toBe('committed');observed.receipt=body.data;
  if(fault==='lost acknowledgement'){await route.abort('failed');return;}
  const data={...body.data,...(fault==='invalid target'?{targetId:'not-a-draft-id'}:fault==='foreign request'?{requestId:'00000000-0000-4000-8000-000000000000'}:{outcome:'pending'})};
  const headers={...response.headers()};delete headers['content-length'];delete headers['transfer-encoding'];
  await route.fulfill({status:response.status(),headers,contentType:'application/json',body:JSON.stringify({...body,data})});
 });
 await prepareLearningForm(page);await page.getByRole('button',{name:'Prepare Draft',exact:true}).click();
 await expect.poll(()=>observed.receipt?.targetId).toBeTruthy();
 await expect(page.getByRole('button',{name:'Check Request Status',exact:true})).toBeEnabled();
 await expect(page.getByText('Draft preparation is unconfirmed.',{exact:true})).toBeVisible();
 await expect(page).toHaveURL(/\/learning\/drafts\/new$/);expect(observed.posts).toBe(1);
 const receipt=observed.receipt;if(!receipt)throw Error('Actual server receipt required');await preparedWithoutPaidReservation(receipt.targetId);
 await page.getByRole('button',{name:'Check Request Status',exact:true}).click();
 await expect(page.getByRole('button',{name:'Start Prepared Draft',exact:true})).toBeVisible();
 await expect(page).toHaveURL(new URL('/learning/drafts/'+receipt.targetId,process.env.TURAS_UI_BASE_URL!).href);expect(observed.posts).toBe(1);
 await preparedWithoutPaidReservation(receipt.targetId);
 await page.getByRole('button',{name:'Cancel Draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();
});
test('draft authentication failure clears private form data without acknowledging or navigating the request',async({page})=>{
 const observed:{requestId?:string;status?:number;posts:number}={posts:0};
 const before=await withLearningDatabase(async db=>(await db.query('SELECT count(*)::int n FROM learning_attempts')).rows[0].n);
 await page.route(url=>url.pathname==='/api/learning/drafts',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  observed.posts++;observed.requestId=route.request().postDataJSON().requestId;await page.context().clearCookies();
  const response=await route.fetch({headers:{...route.request().headers(),cookie:''},maxRetries:0,maxRedirects:0});observed.status=response.status();await route.fulfill({response});
 });
 await prepareLearningForm(page);await page.getByRole('button',{name:'Prepare Draft',exact:true}).click();
 await expect.poll(()=>observed.status).toBe(401);
 await expect(page.getByRole('combobox',{name:'Customer',exact:true})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Selected Accepted Originals',exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Question for Turi',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Start Prepared Draft',exact:true})).toHaveCount(0);
 await expect(page).toHaveURL(/\/learning\/drafts\/new$/);expect(observed.posts).toBe(1);
 expect(await page.evaluate(requestId=>Object.keys(sessionStorage).some(key=>key.startsWith('learning-command:')&&sessionStorage.getItem(key)===requestId),observed.requestId)).toBe(true);
 await withLearningDatabase(async db=>{
  expect((await db.query('SELECT count(*)::int n FROM learning_attempts')).rows[0].n).toBe(before);
  expect((await db.query('SELECT count(*)::int n FROM learning_command_receipts WHERE request_id=$1',[observed.requestId])).rows[0].n).toBe(0);
 });
});
