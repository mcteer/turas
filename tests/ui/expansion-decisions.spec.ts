import {randomUUID} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {supportedExpansionProposal} from '../fixtures/expansion/supported';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {test,expect} from '@playwright/test';
import {expansionUiCustomer,fillExpansionDiscovery} from '../fixtures/expansion/ui';
import {signIn} from '../fixtures/ui';
test('mcteer assigns a designated owner without gaining implicit decision override',async({page})=>{
 const id=await expansionUiCustomer(page,'mcteer');await fillExpansionDiscovery(page);
 await page.getByText('Manage Account Owner',{exact:true}).click();
 await page.getByLabel('Account Owner',{exact:true}).selectOption({label:'panel'});
 await page.getByLabel('Assignment Rationale',{exact:true}).fill('Explicit synthetic account assignment');
 await page.getByRole('button',{name:'Save Account Owner',exact:true}).click();
 await expect(page.getByText('Account-owner assignment saved.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review Hypothesis',exact:true})).toHaveCount(0);
 await signIn(page,'panel');await page.goto(`/customers/${id}/expansion`);
 await expect(page.getByRole('button',{name:'Review Hypothesis',exact:true})).toBeVisible();
});
test('missing owner keeps qualification unavailable and adoption unknown visible',async({page})=>{
 await expansionUiCustomer(page);await fillExpansionDiscovery(page);
 await expect(page.getByRole('button',{name:'Qualify Hypothesis',exact:true})).toHaveCount(0);
 await expect(page.getByText('Current Use: Unknown',{exact:true})).toBeVisible();
});

test('owner self-review keeps qualified and proposed heads distinct through explicit dispositions',async({page},info)=>{
 test.setTimeout(60000);const id=await expansionUiCustomer(page,'mcteer');
 const actors=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')}));
 await supportedExpansionProposal(actors.panel,actors.mcteer,id);await page.reload();
 await page.getByText('Manage Account Owner',{exact:true}).focus();await page.keyboard.press('Enter');
 await page.getByLabel('Account Owner',{exact:true}).selectOption({label:'panel'});await page.getByLabel('Assignment Rationale',{exact:true}).fill('Explicit owner for synthetic self-review');
 await page.getByRole('button',{name:'Save Account Owner',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByText('Account-owner assignment saved.',{exact:true})).toBeVisible();
 await signIn(page,'panel');await page.goto(`/customers/${id}/expansion`);
 async function review(rationale:string){await expect(page.getByRole('button',{name:'Review Hypothesis',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Review Hypothesis',exact:true}).focus();await page.keyboard.press('Enter');await page.getByLabel('Decision Rationale',{exact:true}).fill(rationale);}
 async function action(label:string){await expect(page.getByRole('button',{name:label,exact:true})).toBeEnabled();await page.getByRole('button',{name:label,exact:true}).focus();await page.keyboard.press('Enter');}
 await review('I authored this proposal and reviewed its exact accepted need, capability and validation');await action('Qualify Hypothesis');
 await expect(page.getByText('Disposition: Qualified',{exact:true})).toBeVisible();
 await expect(page.getByText('Reviewed By: panel',{exact:true})).toBeVisible();
 await expect(page.getByText('I authored this proposal and reviewed its exact accepted need, capability and validation',{exact:true})).toBeVisible();
 await action('Edit Hypothesis');await page.getByLabel('Hypothesis Title',{exact:true}).fill('Synthetic proposed changes after qualification');await action('Save as Proposed');
 await expect(page.getByText('Last Decided Disposition: Qualified',{exact:true})).toBeVisible();
 await expect(page.getByText('Working Revision: Proposed Changes — Owner Review Required',{exact:true})).toBeVisible();
 await page.getByText('Last Decided Revision',{exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Synthetic supported expansion hypothesis',exact:true})).toBeVisible();
 const revisitDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await review('Owner explicitly defers pending changes for a validation checkpoint');await page.getByLabel('Revisit Date',{exact:true}).fill(revisitDate);await action('Defer Hypothesis');await expect(page.getByRole('status')).toHaveText('Owner decision saved.');await page.getByLabel('Disposition Filter',{exact:true}).selectOption('deferred');
 await expect(page.getByText('Disposition: Deferred',{exact:true})).toBeVisible();await expect(page.getByText(`Revisit Date: ${revisitDate}`,{exact:true})).toBeVisible();
 await action('Edit Hypothesis');await page.getByLabel('Hypothesis Title',{exact:true}).fill('Deferred proposal edited without reopening');await action('Save as Proposed');await expect(page.getByRole('heading',{name:'Deferred proposal edited without reopening',exact:true})).toBeVisible();await expect(page.getByText('Disposition: Deferred',{exact:true})).toBeVisible();
 await review('Owner explicitly reopens the revised discovery');await action('Reopen Hypothesis');await expect(page.getByRole('status')).toHaveText('Owner decision saved.');await page.getByLabel('Disposition Filter',{exact:true}).selectOption('');await expect(page.getByText('Disposition: Proposed',{exact:true})).toBeVisible();
 await review('Owner dismisses this hypothesis after considering current practice');await action('Dismiss Hypothesis');await expect(page.getByRole('status')).toHaveText('Owner decision saved.');await page.getByLabel('Disposition Filter',{exact:true}).selectOption('dismissed');await expect(page.getByText('Disposition: Dismissed',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);
 await page.screenshot({path:info.outputPath('owner-disposition-history.png'),fullPage:true});
});

test('unusable assignment acknowledgement survives reload and reconciles one assignment',async({page})=>{
 const id=await expansionUiCustomer(page,'mcteer');let committed=false;
 await page.getByText('Manage Account Owner',{exact:true}).click();await page.getByLabel('Account Owner',{exact:true}).selectOption({label:'panel'});await page.getByLabel('Assignment Rationale',{exact:true}).fill('Synthetic explicit assignment with unusable response');
 await page.route(`**/api/expansion/customers/${id}/owner`,async route=>{if(route.request().method()!=='POST'){await route.continue();return;}const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{receipt:null}})});});
 await page.getByRole('button',{name:'Save Account Owner',exact:true}).click();await expect.poll(()=>committed).toBe(true);await expect(page.getByRole('button',{name:'Check Assignment Status',exact:true})).toBeVisible();
 await page.unroute(`**/api/expansion/customers/${id}/owner`);await page.reload();await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Check Assignment Status',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Assignment confirmed.');
 await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeEnabled();
 await withExpansionDatabase(async db=>expect(Number((await db.query('SELECT count(*) AS n FROM expansion_owner_events WHERE customer_id=$1',[id])).rows[0].n)).toBe(1));
});

test('lost dismissal acknowledgement remains recoverable independently of the record list',async({page})=>{
 const id=await expansionUiCustomer(page),actors=await withExpansionDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')}));
 await assignExpansionOwner(actors.mcteer,id,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:actors.panel.membershipId,rationale:'Explicit synthetic owner for recovery'});await fillExpansionDiscovery(page);let committed=false;
 await page.getByRole('button',{name:'Review Hypothesis',exact:true}).click();await page.getByLabel('Decision Rationale',{exact:true}).fill('Owner dismisses the synthetic discovery');
 await page.route(`**/api/expansion/customers/${id}/commands`,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort('failed');});
 await page.getByRole('button',{name:'Dismiss Hypothesis',exact:true}).click();await expect.poll(()=>committed).toBe(true);await expect(page.getByRole('button',{name:'Check Decision Status',exact:true})).toBeVisible();
 await page.unroute(`**/api/expansion/customers/${id}/commands`);await page.reload();await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Check Decision Status',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Decision confirmed.');
 await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeEnabled();
 await withExpansionDatabase(async db=>{const row=(await db.query('SELECT h.disposition,count(d.id)::int AS decisions FROM expansion_hypotheses h JOIN expansion_decisions d ON d.record_id=h.id WHERE h.customer_id=$1 GROUP BY h.disposition',[id])).rows[0];expect(row).toEqual({disposition:'dismissed',decisions:1});});
});
