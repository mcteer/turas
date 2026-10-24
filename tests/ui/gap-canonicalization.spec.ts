import {installGapUiDiagnostics} from '../fixtures/gaps/ui-diagnostics';
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {randomUUID} from 'node:crypto';
import {gapActors} from '../fixtures/gaps/seed';
import {reviewedSyntheticGap,reviewedSuspectedImpact} from '../fixtures/gaps/authoring';
import {withGapDatabase} from '../fixtures/gaps/environment';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {testCredentials} from '../fixtures/ui';
async function login(page:Page){expect((await page.request.post('/api/auth/login',{headers:{origin:process.env.TURAS_UI_BASE_URL!},data:{...testCredentials('mcteer'),returnTo:'/product-gaps'}})).ok()).toBe(true);}
installGapUiDiagnostics();
test.beforeEach(async()=>{if(process.env.TURAS_GAPS_UI_FIXTURE_READY!=='1')throw Error('Owned gap app required');await withGapDatabase(db=>db.query("DELETE FROM rate_windows WHERE environment_id=$1 AND category LIKE 'gap_%'",[process.env.TURAS_ENVIRONMENT_ID]));});
async function setup(){const actors=await gapActors(),token=randomUUID().slice(0,8),a=await reviewedSyntheticGap(actors.panel,actors.mcteer,{title:`Canonical First ${token}`}),b=await reviewedSyntheticGap(actors.panel,actors.mcteer,{title:`Canonical Second ${token}`}),x=await reviewedSuspectedImpact(actors.panel,actors.mcteer,a.id,DEMO_IDS.sharedCustomer),y=await reviewedSuspectedImpact(actors.panel,actors.mcteer,b.id,DEMO_IDS.sharedCustomer);return {actors,a,b,x,y,token};}
async function merge(page:Page,fixture:Awaited<ReturnType<typeof setup>>){await login(page);await page.goto(`/product-gaps/${fixture.a.id}`);await page.getByLabel('Find Reviewed Candidate',{exact:true}).fill(fixture.token);await page.getByRole('checkbox',{name:`Canonical Second ${fixture.token}`,exact:true}).check();await page.getByRole('button',{name:'Load Assignment Review',exact:true}).click();await expect(page.getByLabel(`Result for Observation ${fixture.y}`,{exact:true})).toBeVisible();for(const id of [fixture.x,fixture.y])await page.getByLabel(`Result for Observation ${id}`,{exact:true}).selectOption(fixture.a.id);await page.getByLabel('Canonicalization Rationale',{exact:true}).fill('Review exact synthetic duplicate assignments and survivor.');await page.getByRole('checkbox',{name:/I reviewed the exact narratives/}).check();await page.getByRole('button',{name:'Preview Canonicalization',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm Canonicalization',exact:true})).toBeVisible();}
test('merges exact mappings, redirects aliases and counts one repeated customer',async({page},info)=>{const fixture=await setup();await merge(page,fixture);await page.getByRole('button',{name:'Confirm Canonicalization',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel(`Result for Observation ${fixture.y}`,{exact:true})).toHaveCount(0);await page.goto(`/product-gaps/${fixture.b.id}`);await expect(page.getByText('This gap now refers to',{exact:false})).toBeVisible();await page.getByRole('link',{name:'its canonical gap',exact:true}).click();await page.waitForURL(`**/product-gaps/${fixture.a.id}`);await expect(page.getByRole('heading',{name:'Canonical First '+fixture.token,exact:true})).toBeVisible();await page.locator('.workspace-main').getByRole('link',{name:'Product Gaps',exact:true}).click();await page.waitForURL('**/product-gaps');await page.getByLabel('Search Gaps',{exact:true}).fill(fixture.token);await expect(page.locator('article').filter({has:page.getByRole('link',{name:'Canonical First '+fixture.token,exact:true})}).getByText('Confirmed Customers: 0 · Suspected-only Customers: 1 · Resolved History: 0 (Nonadditive)',{exact:true})).toBeVisible();await expect(page.locator('article').filter({has:page.getByRole('link',{name:'Canonical First '+fixture.token,exact:true})}).getByText('Evidence Freshness: no evidence',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Canonical Second '+fixture.token,exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);await page.screenshot({path:info.outputPath('gap-merged-counts.png'),fullPage:true});});
test('rejects a stale reviewed mapping after another observation arrives',async({page})=>{const fixture=await setup();await merge(page,fixture);await reviewedSuspectedImpact(fixture.actors.panel,fixture.actors.mcteer,fixture.b.id,DEMO_IDS.deniedCustomer);await page.getByRole('button',{name:'Confirm Canonicalization',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Record changed'})).toBeVisible();expect((await withGapDatabase(db=>db.query('SELECT canonical_state FROM product_gaps WHERE id=$1',[fixture.b.id]))).rows[0].canonical_state).toBe('active');});
test('splits exact results while retaining original identity and assignment history',async({page},info)=>{const actors=await gapActors(),token=randomUUID().slice(0,8),gap=await reviewedSyntheticGap(actors.panel,actors.mcteer,{title:`Split Original ${token}`}),x=await reviewedSuspectedImpact(actors.panel,actors.mcteer,gap.id,DEMO_IDS.sharedCustomer),y=await reviewedSuspectedImpact(actors.panel,actors.mcteer,gap.id,DEMO_IDS.deniedCustomer);await login(page);await page.goto(`/product-gaps/${gap.id}`);await page.getByRole('combobox',{name:'Canonical Operation',exact:true}).selectOption('split');await page.getByRole('button',{name:'Load Assignment Review',exact:true}).click();await page.getByRole('button',{name:'Edit Result 2',exact:true}).click();await page.getByLabel('Gap Title',{exact:true}).fill(`Split Additional ${token}`);await page.getByRole('checkbox',{name:/The common narrative/}).check();await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();await page.getByLabel(`Result for Observation ${x}`,{exact:true}).selectOption('result-1');await page.getByLabel(`Result for Observation ${y}`,{exact:true}).selectOption('result-2');await page.getByLabel('Canonicalization Rationale',{exact:true}).fill('Partition the exact two independent synthetic observations.');await page.getByRole('checkbox',{name:/I reviewed the exact narratives/}).check();await page.getByRole('button',{name:'Preview Canonicalization',exact:true}).click();await page.getByRole('button',{name:'Confirm Canonicalization',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm Canonicalization',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:`Split Original ${token}`,exact:true})).toBeVisible();const target=(await withGapDatabase(db=>db.query('SELECT canonical_gap_id FROM gap_observation_assignments WHERE observation_id=$1',[y]))).rows[0].canonical_gap_id;expect(target).not.toBe(gap.id);await page.goto(`/product-gaps/${target}`);await expect(page.getByRole('heading',{name:`Split Additional ${token}`,exact:true})).toBeVisible();expect((await withGapDatabase(db=>db.query('SELECT count(*) AS n FROM gap_assignment_events WHERE observation_id=$1',[y]))).rows[0].n).toBe('2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('gap-split-result.png'),fullPage:true});});

test('retires confirmed merge controls before a stalled refresh and permits a read-only retry',async({page})=>{
 const fixture=await setup();await merge(page,fixture);
 let armed=false,released=false,commitCount=0,held=0,decisionId:string|null=null;
 let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/product-gaps/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'&&url.pathname==='/api/product-gaps/canonicalization/decisions'){
   const response=await route.fetch();expect(response.status()).toBe(200);const body=await response.json();expect(body.data.outcome).toBe('merge');decisionId=body.data.resultId;commitCount++;armed=true;await route.fulfill({response});return;
  }
  if(armed&&!released&&request.method()==='GET'&&url.pathname==='/api/product-gaps/'+fixture.a.id){
   const response=await route.fetch();held++;await barrier;
   try{await route.fulfill({response});}catch(error){if(!request.failure())throw error;}return;
  }
  await route.continue();
 });
 try{
  await page.getByRole('button',{name:'Confirm Canonicalization',exact:true}).click();
  // The original five-second mapping assertion must pass before releasing any
  // response. The actual acknowledged write is never substituted or repeated.
  await expect(page.getByLabel(`Result for Observation ${fixture.y}`,{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Canonical First '+fixture.token,exact:true})).toHaveCount(0);
  await expect.poll(()=>held).toBeGreaterThan(0);
  const actual=await withGapDatabase(db=>db.query('SELECT canonical_state,canonical_target FROM product_gaps WHERE id=$1',[fixture.b.id]));
  expect(actual.rows[0]).toEqual({canonical_state:'redirected',canonical_target:fixture.a.id});expect(commitCount).toBe(1);expect(decisionId).not.toBeNull();
  expect((await withGapDatabase(db=>db.query('SELECT count(*)::int AS n FROM gap_canonicalization_decisions WHERE id=$1',[decisionId]))).rows[0].n).toBe(1);
  await expect(page.getByRole('status').filter({hasText:'Product gaps are unavailable. Refresh to retry.'})).toBeVisible({timeout:12000});
  await expect(page.getByRole('button',{name:'Refresh Gap',exact:true})).toBeEnabled();
  released=true;release();await page.getByRole('button',{name:'Refresh Gap',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Canonical First '+fixture.token,exact:true})).toBeVisible();expect(commitCount).toBe(1);
  expect((await withGapDatabase(db=>db.query("SELECT count(*)::int AS n FROM gap_request_receipts WHERE record_id=$1 AND operation='canonicalize'",[fixture.a.id]))).rows[0].n).toBe(1);
 }finally{released=true;release();await page.unrouteAll({behavior:'wait'});}
});

test('restores a fresh view to reconcile a lost merge acknowledgement without replay',async({page})=>{
 const fixture=await setup();await merge(page,fixture);
 let armed=false,released=false,commitCount=0,held=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/product-gaps/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'&&url.pathname==='/api/product-gaps/canonicalization/decisions'){
   const response=await route.fetch();expect(response.status()).toBe(200);expect((await response.json()).data.outcome).toBe('merge');commitCount++;armed=true;await route.abort('failed');return;
  }
  if(armed&&!released&&request.method()==='GET'&&url.pathname==='/api/product-gaps/'+fixture.a.id){
   held++;const response=await route.fetch();await barrier;try{await route.fulfill({response});}catch(error){if(!request.failure())throw error;}return;
  }
  await route.continue();
 });
 try{
  const failed=page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname==='/api/product-gaps/canonicalization/decisions');
  await page.getByRole('button',{name:'Confirm Canonicalization',exact:true}).click();await failed;
  await expect(page.getByRole('button',{name:'Confirm Canonicalization',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Check Request Status',exact:true})).toBeVisible();expect(commitCount).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading',{name:'Canonical First '+fixture.token,exact:true})).toHaveCount(0);
  const refresh=page.getByRole('button',{name:'Refresh Gap',exact:true});await expect(refresh).toBeEnabled();
  const previousReads=held;await refresh.click();await expect.poll(()=>held).toBeGreaterThan(previousReads);released=true;release();
  await expect(page.getByRole('heading',{name:'Canonical First '+fixture.token,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check Request Status',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Request confirmed.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Check Request Status',exact:true})).toHaveCount(0);
  expect(commitCount).toBe(1);expect((await withGapDatabase(db=>db.query("SELECT count(*)::int AS n FROM gap_request_receipts WHERE record_id=$1 AND operation='canonicalize'",[fixture.a.id]))).rows[0].n).toBe(1);
 }finally{released=true;release();await page.unrouteAll({behavior:'wait'});}
});
