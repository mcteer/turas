import AxeBuilder from '@axe-core/playwright';
import {randomUUID} from 'node:crypto';
import {createProfileTestSession} from '../fixtures/profiles';
import {supportedExpansionProposal} from '../fixtures/expansion/supported';
import {assignExpansionOwner} from '../../lib/server/expansion/owners';
import {submitProfileCommand} from '../../lib/server/profiles/service';
import {withTransaction} from '../../lib/server/db/client';
import {createExpansionDeliveryBaseline} from '../fixtures/expansion/delivery';
import {test,expect} from '@playwright/test';
import {expansionUiCustomer,fillExpansionDiscovery,prepareExpansionDiscovery} from '../fixtures/expansion/ui';
test('scoped ranking explains categorical inputs without commercial prediction',async({page})=>{
 await expansionUiCustomer(page);await fillExpansionDiscovery(page);
 await page.getByText('Why This Order',{exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByText('expansion-ranking-v1',{exact:true})).toBeVisible();
 await expect(page.getByText('Benefit: Unknown',{exact:true})).toBeVisible();
});
test('same product and problem requires explicit related-hypothesis distinction',async({page})=>{
 await expansionUiCustomer(page);await fillExpansionDiscovery(page,'First synthetic hypothesis');
 await fillExpansionDiscovery(page,'Distinct synthetic hypothesis',false);
 await expect(page.getByText('Related Hypotheses',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Distinct Hypothesis Rationale',{exact:true})).toBeVisible();
 await page.getByLabel('Distinct Hypothesis Rationale',{exact:true}).fill('A distinct validation boundary and separately reviewed benefit');
 await page.getByRole('button',{name:'Save Distinct Hypothesis as Proposed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Distinct synthetic hypothesis',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'First synthetic hypothesis',exact:true})).toBeVisible();
});

test('exact delivery references are selected explicitly without changing the accepted plan',async({page})=>{
 const customerId=await expansionUiCustomer(page);
 const delivery=await withTransaction(db=>createExpansionDeliveryBaseline(db,{customerId}));
 const title=delivery.content.title;
 const before=await withTransaction(async db=>(await db.query('SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1',[delivery.created.planId])).rows[0]);
 await prepareExpansionDiscovery(page,'Synthetic linked discovery');
 await page.getByLabel(`Link Plan: ${title}`,{exact:true}).check();
 await page.getByLabel(`Select Engagement: ${title}`,{exact:true}).check();
 await page.getByLabel(`Link Current Baseline: ${title}`,{exact:true}).check();
 await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Synthetic linked discovery',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open Delivery Plan',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open Engagement',exact:true})).toBeVisible();
 await withTransaction(async db=>{
  expect((await db.query('SELECT aggregate_version,accepted_revision_id FROM delivery_plans WHERE id=$1',[delivery.created.planId])).rows[0]).toEqual(before);
  const row=(await db.query('SELECT p.content FROM expansion_hypotheses h JOIN expansion_payloads p ON p.revision_id=h.working_revision_id WHERE h.customer_id=$1',[customerId])).rows[0];
  expect(row.content.deliveryLinks).toHaveLength(2);expect(row.content.selectedEngagementIds).toEqual([delivery.engagementId]);
 });
});

test('withdrawn content supports metadata dismissal and a fresh human revision without reopening',async({page},info)=>{
 test.setTimeout(60000);
 const customerId=await expansionUiCustomer(page),actors=await withTransaction(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer')}));
 await assignExpansionOwner(actors.mcteer,customerId,{contractVersion:'expansion-v1',operation:'assign_owner',requestKey:randomUUID(),expectedVersion:0,membershipId:actors.panel.membershipId,rationale:'Synthetic explicit owner for withdrawn content'});
 const proposal=await supportedExpansionProposal(actors.panel,actors.mcteer,customerId);await page.reload();
 await expect(page.getByRole('heading',{name:proposal.command.content.title,exact:true})).toBeVisible();
 const version=await withTransaction(async db=>Number((await db.query('SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[proposal.need.reviewedRevisionId])).rows[0].version));
 await submitProfileCommand(actors.mcteer,customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:proposal.need.reviewedRevisionId,expectedRecordVersion:version,rationale:'Synthetic original withdrawal with browser open'});
 await page.getByRole('button',{name:'Refresh Expansion',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hypothesis Content Unavailable',exact:true})).toBeVisible();
 await expect(page.getByText(proposal.command.content.problem,{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Review Hypothesis',exact:true}).click();await page.getByLabel('Decision Rationale',{exact:true}).fill('Owner dismisses using metadata after source withdrawal');
 await expect(page.getByRole('button',{name:'Qualify Hypothesis',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Dismiss Hypothesis',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Owner decision saved.');await page.getByLabel('Disposition Filter',{exact:true}).selectOption('dismissed');
 const fresh=page.getByRole('button',{name:'Create Fresh Working Revision',exact:true});await fresh.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Fresh Working Revision',exact:true})).toBeVisible();await expect(page.getByLabel('Problem',{exact:true})).toHaveValue('');
 for(const [label,value] of [['Hypothesis Title','Synthetic fresh human revision'],['Product Key',proposal.command.content.productKey],['Product Label',proposal.command.content.productLabel],['Problem Key',proposal.command.content.problemKey],['Problem','Investigate a new synthetic operating need'],['Customer Benefit','Potential benefit still requires validation'],['Proposed Engagement','Discovery only'],['Next Action','Ask the customer operating owner'],['Validation Criterion','Record a reviewed customer need']])await page.getByLabel(label!,{exact:true}).fill(value!);
 await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();await expect(page.getByRole('heading',{name:'Synthetic fresh human revision',exact:true})).toBeVisible();await expect(page.getByText('Disposition: Dismissed',{exact:true})).toBeVisible();
 await page.getByText('Last Decided Revision',{exact:true}).click();await expect(page.getByText('Evidence Changed — Decided Content Withheld',{exact:true})).toBeVisible();
 await withTransaction(async db=>{const row=(await db.query('SELECT p.content,h.disposition FROM expansion_hypotheses h JOIN expansion_payloads p ON p.revision_id=h.working_revision_id WHERE h.id=$1',[proposal.saved.recordId])).rows[0];expect(row.disposition).toBe('dismissed');expect(row.content.sourceRefs).toEqual([]);expect(row.content.content.assertions).toEqual([]);});
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('fresh-withheld-revision.png'),fullPage:true});
});
