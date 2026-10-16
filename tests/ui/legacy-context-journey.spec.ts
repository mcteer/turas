import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {Client} from 'pg';
import {expect,test,type Page} from '@playwright/test';
import {signIn,requireUiFixtureDatabaseUrl,sanitizedScreenshot} from '../fixtures/ui';
import {getCurrentSession} from '../../lib/server/auth/sessions';

async function fixture(page:Page){
 await signIn(page,'mcteer');
 const cookie=(await page.context().cookies()).find(item=>item.name==='turas_session'||item.name==='__Host-turas_session');
 if(!cookie)throw Error('Owned browser session required');
 const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${cookie.name}=${cookie.value}`}}));
 if(!actor)throw Error('Owned browser actor required');
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();
 const customerId=randomUUID();try{await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,false)",[customerId,actor.workspaceId,'Synthetic journey browser '+customerId]);}finally{await db.end();}
 // Compile the actual changed Next development routes before interactions so
 // development-only Fast Refresh cannot replace a completed browser navigation.
 for(const path of ['/context-approvals',`/customers/${customerId}/review`,`/api/context-approvals?includeDenied=false&offset=0`,`/api/customers/${customerId}/review`,`/api/customers/${customerId}/profile`,`/api/customers/${customerId}/journey`])expect((await page.request.get(path)).status()).toBe(200);
 expect((await page.request.get(`/api/customers/${customerId}/commands`)).status()).toBe(405);
 expect((await page.request.get(`/api/customers/${customerId}/records/${randomUUID()}/history`)).status()).toBe(404);
 for(let attempt=0;attempt<2;attempt++){try{await page.goto(`/customers/${customerId}/journey`);break;}catch(error){if(attempt||!(error instanceof Error)||!error.message.includes('interrupted by another navigation')||new URL(page.url()).pathname!=='/s')throw error;}}
 await expect(page.getByRole('heading',{name:'Customer Journey',exact:true})).toBeVisible();
 return customerId;
}
async function fillDraft(page:Page,title:string,impact=false){
 await page.getByRole('textbox',{name:'Title',exact:true}).fill(title);
 await page.getByRole('textbox',{name:'Summary',exact:true}).fill('A synthetic measured customer operating observation with a retained original source.');
 await page.getByRole('textbox',{name:'Scope',exact:true}).fill('A bounded synthetic customer delivery pilot');
 await page.getByRole('combobox',{name:'Record type',exact:true}).selectOption(impact?'outcome':'note');
 await page.getByRole('combobox',{name:'Journey stage',exact:true}).selectOption('Adopt');
 await page.getByLabel('Observed on',{exact:true}).fill('2026-09-30');
 await page.getByLabel('Review after',{exact:true}).fill('2026-12-01');
 await page.getByRole('textbox',{name:'Source reference',exact:true}).fill('Synthetic original measurement note');
 await page.getByRole('textbox',{name:'Original source excerpt',exact:true}).fill('Synthetic original source: active administrators increased from twenty to forty percent for this one scoped pilot.');
 if(impact){
  await page.getByLabel('Include an impact measurement',{exact:true}).check();
  await page.getByLabel('Metric',{exact:true}).fill('Weekly active administrators');await page.getByLabel('Unit',{exact:true}).fill('%');
  await page.getByLabel('Attribution and limitations',{exact:true}).fill('Only this synthetic scoped population was observed; no causal portfolio claim.');
  await page.getByLabel('Baseline',{exact:true}).fill('20');await page.getByLabel('Current value',{exact:true}).fill('40');
  await page.getByLabel('Target (optional)',{exact:true}).fill('50');
  await page.getByLabel('Measurement start',{exact:true}).fill('2026-09-01');await page.getByLabel('Measurement end',{exact:true}).fill('2026-09-30');
 }
}
async function command(page:Page,customerId:string,name:string){
 const received=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/customers/${customerId}/commands`&&response.request().method()==='POST');
 await page.getByRole('button',{name,exact:true}).click();const response=await received;
 expect([200,201]).toContain(response.status());return (await response.json()).data as {revisionId:string;recordId:string};
}
async function decide(page:Page,customerId:string,action:'Accept exact proposal'|'Reject'){
 await page.getByLabel('Internal review rationale',{exact:true}).fill('Reviewed the exact synthetic source, scope and measurement before this decision.');
 await command(page,customerId,action);await expect(page.getByRole('button',{name:action,exact:true})).toHaveCount(0);
}
async function facts(page:Page,customerId:string){const response=await page.request.get(`/api/customers/${customerId}/profile`);expect(response.status()).toBe(200);return (await response.json()).data.acceptedFacts as Array<{payload:{title?:string;legacyJourney?:unknown}}> ;}

test('workspace approvals preserves pending facts, denied history and exact resubmission',async({page},testInfo)=>{
 const customerId=await fixture(page),title='Synthetic queue proposal '+customerId.slice(0,8);
 await fillDraft(page,title);await command(page,customerId,'Save pending proposal');
 expect(await facts(page,customerId)).toEqual([]);
 await page.goto('/context-approvals');await expect(page.getByRole('heading',{name:'Context Approvals',exact:true})).toBeVisible();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toBeVisible();
 await card.getByRole('link',{name:'Inspect proposal and history',exact:true}).click();
 await expect(page.locator('pre').filter({hasText:'Synthetic original measurement note'})).toBeVisible();
 await decide(page,customerId,'Reject');expect(await facts(page,customerId)).toEqual([]);
 await page.goto('/context-approvals');await page.getByLabel('Include denied proposals',{exact:true}).check();
 await expect(page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})})).toBeVisible();
 mkdirSync('local-artifacts/018',{recursive:true});await sanitizedScreenshot(page,`local-artifacts/018/context-approvals-${testInfo.project.name}.png`);
 await page.goto(`/customers/${customerId}/journey`);await page.getByRole('button',{name:'Revise and resubmit',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Source reference',exact:true})).toHaveValue('Synthetic original measurement note');
 await page.getByRole('textbox',{name:'Title',exact:true}).fill(title+' corrected');await command(page,customerId,'Submit revised proposal');
 await page.goto(`/customers/${customerId}/review`);await decide(page,customerId,'Accept exact proposal');
 expect((await facts(page,customerId)).map(fact=>fact.payload.title)).toEqual([title+' corrected']);
 await page.goto(`/customers/${customerId}/journey`);await page.getByRole('button',{name:'View history',exact:true}).first().click();
 await expect(page.getByRole('region',{name:'Record History',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Rejected',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Accepted',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('structured journey impact survives review, correction, reload and explicit retraction',async({page},testInfo)=>{
 const customerId=await fixture(page),title='Synthetic measured journey '+customerId.slice(0,8);
 await fillDraft(page,title,true);await command(page,customerId,'Save pending proposal');expect(await facts(page,customerId)).toEqual([]);
 await page.goto(`/customers/${customerId}/review`);await decide(page,customerId,'Accept exact proposal');
 await page.goto(`/customers/${customerId}/journey`);await page.reload();
 const entry=page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await expect(entry).toContainText('20 → 40 %');await expect(entry).toContainText('Change 20');await expect(entry).toContainText('Synthetic original measurement note');
 await entry.getByRole('button',{name:'Correct record',exact:true}).click();
 await expect(page.getByLabel('Metric',{exact:true})).toHaveValue('Weekly active administrators');
 await expect(page.getByRole('textbox',{name:'Original source excerpt',exact:true})).toHaveValue('Synthetic original source: active administrators increased from twenty to forty percent for this one scoped pilot.');
 await page.getByRole('textbox',{name:'Title',exact:true}).fill(title+' corrected');await command(page,customerId,'Submit revised proposal');
 expect((await facts(page,customerId)).map(fact=>fact.payload.title)).toEqual([title]);
 await page.goto(`/customers/${customerId}/review`);await decide(page,customerId,'Accept exact proposal');
 await page.goto(`/customers/${customerId}/journey`);await page.reload();
 const current=page.locator('article').filter({has:page.getByRole('heading',{name:title+' corrected',exact:true})});
 await expect(current).toContainText('20 → 40 %');
 await current.getByLabel('Retraction reason',{exact:true}).fill('Synthetic original source was withdrawn; review this exact accepted observation.');
 await command(page,customerId,'Request retraction review');
 await page.goto(`/customers/${customerId}/review`);await page.getByLabel('Internal rationale',{exact:true}).fill('Confirmed withdrawal of the exact synthetic source; retract this accepted observation.');
 await command(page,customerId,'Retract accepted fact');expect(await facts(page,customerId)).toEqual([]);
 await page.goto(`/customers/${customerId}/journey`);
 const retracted=page.locator('article').filter({has:page.getByRole('heading',{name:title+' corrected',exact:true})});
 await expect(retracted).toContainText('retracted');
 await retracted.getByRole('button',{name:'View history',exact:true}).click();
 await expect(page.getByRole('region',{name:'Record History',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Retracted',exact:true})).toBeVisible();
 await retracted.getByRole('button',{name:'Correct record',exact:true}).click();
 await expect(page.getByLabel('Metric',{exact:true})).toHaveValue('Weekly active administrators');
 await page.getByRole('textbox',{name:'Title',exact:true}).fill(title+' resubmitted');
 await command(page,customerId,'Submit revised proposal');
 expect(await facts(page,customerId)).toEqual([]);
 await page.goto(`/customers/${customerId}/review`);await decide(page,customerId,'Accept exact proposal');
 expect((await facts(page,customerId)).map(fact=>fact.payload.title)).toEqual([title+' resubmitted']);
 await page.goto(`/customers/${customerId}/journey`);
 await expect(page.getByRole('heading',{name:title+' resubmitted',exact:true})).toBeVisible();
 await page.getByRole('heading',{name:title+' resubmitted',exact:true}).scrollIntoViewIfNeeded();
 mkdirSync('local-artifacts/018',{recursive:true});await sanitizedScreenshot(page,`local-artifacts/018/customer-journey-${testInfo.project.name}.png`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
