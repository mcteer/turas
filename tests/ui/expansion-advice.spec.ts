import {test,expect} from '@playwright/test';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {randomUUID} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {query} from '../../lib/server/db/client';
import {expansionUiCustomer} from '../fixtures/expansion/ui';
test('on-demand Turi offers discovery and a human-edited proposal stays unqualified',async({page},info)=>{
 const customerId=await expansionUiCustomer(page);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Advice State: completed',{exact:true})).toBeVisible({timeout:60000});
 await expect(page.getByText('Operating owner — No reviewed owner observation selected',{exact:true})).toBeVisible();
 await expect(page.getByText('Disposition: Qualified',{exact:true})).toHaveCount(0);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('current-expansion-advice.png'),fullPage:true});
 await page.getByRole('button',{name:'Review Proposal 1',exact:true}).click();await page.getByLabel('Hypothesis Title',{exact:true}).fill('Human-reviewed native proposal');await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Human-reviewed native proposal',exact:true})).toBeVisible();await expect(page.getByText('Disposition: Proposed',{exact:true})).toBeVisible();
 const saved=(await query('SELECT v.advice_attempt_id,v.advice_output_digest,v.advice_suggestion_index FROM expansion_revisions v JOIN expansion_hypotheses h ON h.working_revision_id=v.id WHERE h.customer_id=$1',[customerId])).rows;expect(saved).toHaveLength(1);expect(saved[0].advice_attempt_id).toBeTruthy();expect(saved[0].advice_output_digest).toMatch(/^[a-f0-9]{64}$/);expect(saved[0].advice_suggestion_index).toBe(0);
});
test('stopping an expansion response keeps late output unavailable after reload',async({page})=>{
 const customerId=await expansionUiCustomer(page);await query('INSERT INTO expansion_native_fixture_barriers(customer_id) VALUES($1)',[customerId]);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();
 await expect(page.getByRole('button',{name:'Stop Expansion Advice',exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'Stop Expansion Advice',exact:true}).click();
 await expect(page.getByText('Advice State: cancelled',{exact:true})).toBeVisible({timeout:60000});await query('UPDATE expansion_native_fixture_barriers SET released=true WHERE customer_id=$1',[customerId]);
 await page.reload();await expect(page.getByText('Advice State: cancelled',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Review Proposal/})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Current Advice',exact:true})).toHaveCount(0);
});
test('lost preparation acknowledgement recovers opaque identity and starts once by explicit action',async({page})=>{
 const customerId=await expansionUiCustomer(page);let committed=false;await page.route(`**/api/expansion/customers/${customerId}/advice`,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort('failed');});
 await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();await expect.poll(()=>committed).toBe(true);await page.unroute(`**/api/expansion/customers/${customerId}/advice`);await page.reload();
 await expect(page.getByText('Advice State: prepared',{exact:true})).toBeVisible();expect(Number((await query('SELECT count(*) AS n FROM expansion_native_fixture_calls')).rows[0].n)).toBe(0);
 const storage=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('turas-expansion-advice:')).map(([,value])=>JSON.parse(value)));expect(storage).toHaveLength(1);expect(Object.keys(storage[0])).toEqual(['attemptId']);
 await page.getByRole('button',{name:'Start Prepared Advice',exact:true}).click();await expect(page.getByText('Advice State: completed',{exact:true})).toBeVisible({timeout:60000});expect(Number((await query('SELECT count(*) AS n FROM expansion_native_fixture_calls')).rows[0].n)).toBe(2);
});

test('owner reassignment withholds current advice and clears the suggestion editor before any save',async({page})=>{
 const customerId=await expansionUiCustomer(page);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();await expect(page.getByText('Advice State: completed',{exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'Review Proposal 1',exact:true}).click();
 const reviewer=await withExpansionDatabase(db=>createProfileTestSession(db,'mcteer'));await assignExpansionOwner(reviewer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:reviewer.membershipId,rationale:'Human assigns synthetic account owner'});
 await page.getByRole('button',{name:'Check Advice Status',exact:true}).click();await expect(page.getByText('Advice content withheld. Prepare fresh advice with current evidence.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Current Advice',exact:true})).toHaveCount(0);await expect(page.getByLabel('Hypothesis Title',{exact:true})).toHaveCount(0);expect(Number((await query('SELECT count(*) AS n FROM expansion_hypotheses WHERE customer_id=$1',[customerId])).rows[0].n)).toBe(0);
});
test('lost human suggestion save acknowledgement reconciles the exact saved proposed revision after reload',async({page})=>{
 const customerId=await expansionUiCustomer(page);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();await expect(page.getByText('Advice State: completed',{exact:true})).toBeVisible({timeout:60000});await page.getByRole('button',{name:'Review Proposal 1',exact:true}).click();await page.getByLabel('Hypothesis Title',{exact:true}).fill('Recovered human suggestion');let committed=false;
 await page.route(`**/api/expansion/customers/${customerId}/commands`,async route=>{expect(route.request().postDataJSON().operation).toBe('save_suggestion');const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort('failed');});await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();await expect.poll(()=>committed).toBe(true);await page.unroute(`**/api/expansion/customers/${customerId}/commands`);await page.reload();await page.getByRole('button',{name:'Check Save Status',exact:true}).click();await expect(page.getByRole('heading',{name:'Recovered human suggestion',exact:true})).toHaveCount(1);await expect(page.getByText('Disposition: Proposed',{exact:true})).toBeVisible();expect(Number((await query('SELECT count(*) AS n FROM expansion_revisions v JOIN expansion_hypotheses h ON h.id=v.record_id WHERE h.customer_id=$1',[customerId])).rows[0].n)).toBe(1);
});
test('valid zero-proposal advice exposes useful discovery and no review action',async({page})=>{
 const customerId=await expansionUiCustomer(page);await query("INSERT INTO expansion_native_fixture_modes(customer_id,mode) VALUES($1,'zero')",[customerId]);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();await expect(page.getByText('Advice State: completed',{exact:true})).toBeVisible({timeout:60000});await expect(page.getByText('No proposals. Use the discovery steps to establish the missing evidence.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Review Proposal/})).toHaveCount(0);await expect(page.getByText('Ask the operating owner about the need · Validate: Record a reviewed operating need',{exact:true})).toBeVisible();
});
test('malformed native final output fails without a paid repair or a save action',async({page})=>{
 const customerId=await expansionUiCustomer(page);await query("INSERT INTO expansion_native_fixture_modes(customer_id,mode) VALUES($1,'malformed')",[customerId]);await page.getByRole('button',{name:'Ask Turi for Expansion Proposals',exact:true}).click();await expect(page.getByText('Advice State: failed',{exact:true})).toBeVisible({timeout:60000});await expect(page.getByRole('heading',{name:'Current Advice',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Review Proposal/})).toHaveCount(0);expect(Number((await query('SELECT count(*) AS n FROM expansion_native_fixture_calls')).rows[0].n)).toBe(2);
});
