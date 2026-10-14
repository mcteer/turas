import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { chmod } from 'node:fs/promises';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
import { createProfileTestSession } from '../fixtures/profiles';
import { signIn, requireUiFixtureDatabaseUrl } from '../fixtures/ui';
import { persistPublicCustomerResearch } from '../../lib/server/research/public-persistence';
import { dossierAreas, publicDigest, signCheckedPublicPage } from '../../lib/server/research/public-dossier';

test.beforeAll(async()=>{
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();
 try{
  const actor=await createProfileTestSession(db as unknown as import('pg').PoolClient,'mcteer');
  const text='Cedar (synthetic) Workers run on Vercel Sandbox to isolate customer-written code. This researched fact applies to the Workers workload only.';
  const page=signCheckedPublicPage({url:'https://example.com/synthetic-cedar-workers',title:'Synthetic Workers on Vercel Sandbox',text,bodyDigest:publicDigest(text),normalizedDigest:publicDigest(text),retrievedAt:new Date().toISOString(),publishedAt:null,discoveryPurpose:'architecture_outcomes'});
  await persistPublicCustomerResearch(actor,{requestKey:randomUUID(),batchDigest:'a'.repeat(64),customer:{name:'Cedar (synthetic)',industries:[],directoryListed:false,stories:[]},dossier:{description:'A synthetic collaboration business with a documented Workers workload.',findings:[{area:'architecture_outcomes',statement:text,quote:text,sourceIndex:0,attribution:'Synthetic independent source',caveats:['Workers workload only']}],coverage:dossierAreas.map(area=>({area,state:area==='architecture_outcomes'?'supported':'not_found',explanation:'Synthetic bounded source check'})),unknowns:['Maturity is not assessed']},usage:{searches:0,fetches:1,inputTokens:0,outputTokens:0,costUsd:0,model:'synthetic-test',modelCalls:0}},[page],DEMO_IDS.sharedCustomer);
 }finally{await db.end();}
});

test('customer names open profiles directly and customer search has clear empty and reset states',async({page})=>{
 await signIn(page,'panel');await page.goto('/customers');
 await expect(page.getByRole('heading',{name:'Customer Profiles',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open Profile'})).toHaveCount(0);
 const search=page.getByRole('searchbox',{name:'Search Customers'});await search.fill('cEdAr');
 const link=page.locator('.customer-card h2').getByRole('link',{name:'Cedar (synthetic)'});await expect(link).toBeVisible();
 await search.fill('NO_CUSTOMER_MATCH');await expect(page.getByText('No Matching Customers',{exact:true})).toBeVisible();await expect(page.locator('.customer-card')).toHaveCount(0);
 await search.fill('');await expect(link).toBeVisible();await link.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(new RegExp(`/customers/${DEMO_IDS.sharedCustomer}$`));await expect(page.getByRole('region',{name:'Customer Overview'})).toBeVisible();
});

test('the overview restores researched business and products without inferring maturity or risk',async({page},info)=>{
 await signIn(page,'panel');await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
 const overview=page.getByRole('region',{name:'Customer Overview'});await expect(overview).toBeVisible();
 await expect(overview).toContainText('A synthetic collaboration business');await expect(overview.getByText('Unknown',{exact:true})).toHaveCount(2);
 await expect(overview).toContainText('None Recorded');await expect(overview.getByRole('button',{name:'Vercel Sandbox'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
 if(process.env.TURAS_UI_CAPTURE_ROOT){const file=join(process.env.TURAS_UI_CAPTURE_ROOT,info.project.name+'-customer-overview.png');await page.screenshot({path:file,fullPage:true});await chmod(file,0o600);}
 await overview.getByRole('button',{name:'Vercel Sandbox'}).click();await expect(page.getByRole('heading',{name:'Source Detail'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Source Detail'})).toContainText('Accepted Research');
});

test('Sandbox research is searchable as accepted facts and decision-filter emptiness offers the facts directly',async({page})=>{
 await signIn(page,'panel');await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
 const search=page.getByRole('region',{name:'Search Evidence'});await search.getByLabel('Question or terms').fill('Sandboxes');
 await expect(search.getByLabel('Use')).toHaveValue('accepted_fact');await search.getByRole('button',{name:'Search',exact:true}).click();
 await expect(search.locator('.evidence-passage')).toContainText('Vercel Sandbox');await expect(search).toContainText('Accepted research');
 await search.getByLabel('Use').selectOption('current_fact');await search.getByRole('button',{name:'Search',exact:true}).click();await expect(search).toContainText('No fresh, decision-ready evidence');
 await search.getByRole('button',{name:'Search Accepted Facts'}).click();await expect(search.locator('.evidence-passage')).toContainText('Vercel Sandbox');
 await search.getByRole('button',{name:'View citation'}).click();await expect(search).toContainText('Cedar (synthetic) Workers run on Vercel Sandbox');
});

test('the summary displays a scoped reviewed maturity stage, risk and delivery indicator accessibly',async({page},info)=>{
 await signIn(page,'panel');
 const evidence=['11111111-1111-4111-8111-111111111111'],date='2026-10-01T00:00:00Z';
 const maturity={kind:'maturity_assessment',observationStart:date,observationEnd:date,assessor:'Synthetic assessor',rubricVersion:'customer-maturity-v1',rationale:'Synthetic scoped assessment',journeyStage:'Accelerate',reviewAt:'2026-12-01T00:00:00Z',nextCapability:'Measure outcomes',evidenceRevisionIds:evidence,dimensions:['outcome_ownership','delivery_collaboration','experience_adoption','operational_trust','platform_organization','innovation_ai'].map(key=>({key,state:'Established',rationale:'Observed synthetic capability',nextCapability:'Measure outcomes',evidenceRevisionIds:evidence}))};
 const risk={kind:'risk',category:'Delivery',description:'Synthetic open risk',owner:'Synthetic owner',likelihood:2,impact:3,severity:'high',severityRationale:'Synthetic risk assessment',mitigation:'Review dependencies',status:'open',observedAt:date,evidenceRevisionIds:evidence};
 await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile`,async route=>{
  const response=await route.fetch(),body=await response.json();
  body.data.acceptedFacts=[maturity,risk].map(payload=>({id:randomUUID(),recordId:randomUUID(),recordVersion:1,workloadId:null,kind:payload.kind,reviewState:'accepted',payload,supportStatus:'settled',quality:{band:'usable'}}));
  body.data.activeDelivery={state:'ready',activeCount:2};await route.fulfill({response,json:body});
 });
 await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);const overview=page.getByRole('region',{name:'Customer Overview'});
 await expect(overview).toContainText('Accelerate');await expect(overview).toContainText('Stage 3 of 6');await expect(overview).toContainText('High');await expect(overview).toContainText('2 Active');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).include('.customer-summary').analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
 if(process.env.TURAS_UI_CAPTURE_ROOT){const file=join(process.env.TURAS_UI_CAPTURE_ROOT,info.project.name+'-customer-overview-assessed.png');await overview.screenshot({path:file});await chmod(file,0o600);}
});
