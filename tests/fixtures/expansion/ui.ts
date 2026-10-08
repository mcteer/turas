import {randomUUID} from 'node:crypto';
import {expect,type Page} from '@playwright/test';
import {query} from '../../../lib/server/db/client';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {signIn} from '../ui';
import {requireOwnedExpansionClone} from '../../../scripts/expansion-eval-environment';
export async function expansionUiCustomer(page:Page,login:'mcteer'|'panel'|'partner'='panel'){
 requireOwnedExpansionClone();if(process.env.TURAS_EXPANSION_UI_FIXTURE_READY!=='1')throw Error('Use owned expansion UI runner');
 const customerId=randomUUID();await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic expansion WebKit',true)",[customerId,DEMO_IDS.workspace]);
 if(login==='partner')await query(`INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)`,[randomUUID(),DEMO_IDS.partnerMembership,DEMO_IDS.workspace,customerId,DEMO_IDS.mcteer]);
 await signIn(page,login);await page.goto(`/customers/${customerId}/expansion`);return customerId;
}
export async function prepareExpansionDiscovery(page:Page,title='Synthetic discovery hypothesis'){
 await page.getByRole('button',{name:'New Hypothesis',exact:true}).click();
 await page.getByLabel('Hypothesis Title',{exact:true}).fill(title);
 await page.getByLabel('Product Key',{exact:true}).fill('synthetic-product');
 await page.getByLabel('Product Label',{exact:true}).fill('Synthetic Product');
 await page.getByLabel('Problem Key',{exact:true}).fill('response-latency');
 await page.getByLabel('Problem',{exact:true}).fill('Investigate an operating need');
 await page.getByLabel('Customer Benefit',{exact:true}).fill('Potential improvement subject to discovery');
 await page.getByLabel('Proposed Engagement',{exact:true}).fill('Discovery only');
 await page.getByLabel('Next Action',{exact:true}).fill('Ask operating owner about the need');
 await page.getByLabel('Validation Criterion',{exact:true}).fill('Reviewed customer need is recorded');
}
export async function fillExpansionDiscovery(page:Page,title='Synthetic discovery hypothesis',confirm=true){
 await prepareExpansionDiscovery(page,title);
 await page.getByRole('button',{name:'Save as Proposed',exact:true}).focus();await page.keyboard.press('Enter');
 if(confirm)await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}
