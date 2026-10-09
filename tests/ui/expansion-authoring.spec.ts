import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createReviewedPlanWorkload} from '../fixtures/plans/journey';
import {createProfileTestSession} from '../fixtures/profiles';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {weakPublicExpansionEvidence} from '../fixtures/expansion/evidence';
import {saveExpansionProposal} from '../../lib/server/expansion/service';
import {discoveryHypothesis} from '../fixtures/expansion';
import AxeBuilder from '@axe-core/playwright';
import {expansionUiCustomer,fillExpansionDiscovery} from '../fixtures/expansion/ui';
test('customer with no engagement can author an honest discovery proposal using keyboard',async({page},info)=>{
 await expansionUiCustomer(page);await fillExpansionDiscovery(page);
 await expect(page.getByText('Disposition: Proposed',{exact:true})).toBeVisible();
 await expect(page.getByText('Account Owner Unassigned',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);
 await page.screenshot({path:info.outputPath('discovery-proposal.png'),fullPage:true});
});
test('assigned partner cannot open expansion or see internal counts',async({page})=>{
 await expansionUiCustomer(page,'partner');await expect(page.getByRole('heading',{name:'Expansion Opportunities',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toHaveCount(0);
});
test('structured benefit edits remain proposed and preserve immutable identity',async({page},info)=>{
 await expansionUiCustomer(page);await fillExpansionDiscovery(page);
 await page.getByRole('button',{name:'Edit Hypothesis',exact:true}).click();
 await expect(page.getByLabel('Product Key',{exact:true})).toHaveAttribute('readonly','');
 await page.getByText('Evidence, Benefit, and Validation Details',{exact:true}).click();
 await page.getByLabel('Benefit Specificity',{exact:true}).selectOption('qualitative_outcome');
 await page.getByLabel('Benefit Rationale',{exact:true}).fill('Proposed operating improvement subject to customer validation');
 await page.getByLabel('Benefit Validation Criterion',{exact:true}).fill('Customer operating owner validates the observed improvement');
 await page.getByLabel('Hypothesis Title',{exact:true}).fill('Revised synthetic structured hypothesis');
 await page.getByRole('button',{name:'Save as Proposed',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Revised synthetic structured hypothesis',exact:true})).toBeVisible();
 await expect(page.getByText('Disposition: Proposed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit Hypothesis',exact:true}).click();
 await page.getByText('Evidence, Benefit, and Validation Details',{exact:true}).click();
 await expect(page.getByLabel('Benefit Validation Criterion',{exact:true})).toHaveValue('Customer operating owner validates the observed improvement');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);
 await page.screenshot({path:info.outputPath('structured-editor.png'),fullPage:true});
});

test('lost save acknowledgement survives reload and reconciles one saved revision',async({page})=>{
 const customerId=await expansionUiCustomer(page);let committed=false;
 const workloadId=await withExpansionDatabase(async db=>{const panel=await createProfileTestSession(db,'panel'),mcteer=await createProfileTestSession(db,'mcteer');return createReviewedPlanWorkload(db,panel,mcteer,customerId);});
 await page.reload();await page.getByLabel('Workload',{exact:true}).selectOption(workloadId);
 await expect(page).toHaveURL(new RegExp(`workloadId=${workloadId}`));
 await page.route(`**/api/expansion/customers/${customerId}/commands`,async route=>{
  const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort('failed');
 });
 await fillExpansionDiscovery(page,'Lost acknowledgement synthetic hypothesis',false);
 await expect(page.getByRole('button',{name:'Check Save Status',exact:true})).toBeVisible();
 await expect.poll(()=>committed).toBe(true);await page.unroute(`**/api/expansion/customers/${customerId}/commands`);
 await page.reload();await expect(page.getByRole('button',{name:'Check Save Status',exact:true})).toBeVisible();
 await expect(page.getByLabel('Workload',{exact:true})).toHaveValue(workloadId);
 await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Check Save Status',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Save confirmed.');
 await expect(page.getByRole('heading',{name:'Lost acknowledgement synthetic hypothesis',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'New Hypothesis',exact:true})).toBeEnabled();
});

test('attributed public source inspection and historical reads withhold withdrawn evidence',async({page},info)=>{
 const customerId=await expansionUiCustomer(page);
 const actor=await withExpansionDatabase(db=>createProfileTestSession(db,'panel'));
 const evidence=await weakPublicExpansionEvidence(actor,customerId);
 const content={...discoveryHypothesis(),title:'Synthetic public discovery hypothesis',assertions:[{purpose:'product_suitability',classification:'attributed_observation',text:evidence.passage,sourceKeys:[evidence.reference.id]}]};
 await saveExpansionProposal(actor,customerId,{contractVersion:'expansion-v1',operation:'save_hypothesis',requestKey:randomUUID(),workloadId:null,expectedVersion:0,content,sourceRefs:[evidence.reference],selectedEngagementIds:[],deliveryLinks:[]});
 await page.reload();await page.getByRole('button',{name:'Edit Hypothesis',exact:true}).click();
 await page.getByRole('button',{name:'Inspect Selected Source 1',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Source Detail',exact:true})).toBeVisible();
 await expect(page.getByText('Classification: Attributed public research',{exact:true})).toBeVisible();
 await expect(page.locator('blockquote')).toHaveText(evidence.passage);
 await expect(page.getByText('Reliability 1/4',{exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open Original Public Source',exact:true})).toHaveAttribute('href',/https:\/\/vercel.com\/docs\/synthetic-/);
 await page.getByLabel('Search Customer and Shared Evidence',{exact:true}).fill('public marketing observation');
 await page.getByRole('button',{name:'Search Evidence',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Synthetic Public Observation X+/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toHaveLength(0);
 await page.screenshot({path:info.outputPath('public-source-detail.png'),fullPage:true});
 await withExpansionDatabase(db=>db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale)
  VALUES($1,$2,1,'withdraw',$3,'Synthetic public evidence withdrawn with maintenance paused')`,[randomUUID(),evidence.reference.sourceRevisionId,actor.membershipId]));
 await page.reload();await expect(page.getByRole('heading',{name:'Hypothesis Content Unavailable',exact:true})).toBeVisible();
 await expect(page.getByText(evidence.passage,{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'View History',exact:true}).click();await page.getByRole('button',{name:'Open Revision 1',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Evidence Changed — Review Required',exact:true})).toBeVisible();
 await expect(page.getByText(evidence.passage,{exact:true})).toHaveCount(0);
});
