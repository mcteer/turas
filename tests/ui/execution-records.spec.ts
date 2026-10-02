import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect,test } from '@playwright/test';
import { requireOwnedExecutionClone } from '../../scripts/execution-eval-environment';
import { createReviewedExecutionJourney } from '../fixtures/execution/journey';
import { signIn } from '../fixtures/ui';
import { withTransaction } from '../../lib/server/db/client';
import { submitProfileCommand } from '../../lib/server/profiles/service';
import { submitExecutionCommand,readExecutionOverview,previewExecutionCommand } from '../../lib/server/execution/service';
import { createExecutionBaseline } from '../fixtures/execution/baseline';
const expect=baseExpect.configure({timeout:30000});
test.beforeEach(({page})=>{page.setDefaultTimeout(30000);requireOwnedExecutionClone();if(process.env.TURAS_EXECUTION_FIXTURE_READY!=='1')throw new Error('Use the owned008 UI runner');});
async function accessible(page:Parameters<typeof signIn>[0]){const result=await new AxeBuilder({page}).analyze();expect(result.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
test('actual reviewed journey: keyboard setup, activity review and exact milestone acceptance',async({page},testInfo)=>{
  test.setTimeout(240000);const f=await createReviewedExecutionJourney();
  await signIn(page,'panel');await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);
  await expect(page.getByRole('heading',{name:'Execution Log',exact:true})).toBeVisible();
  let setupPosts=0,lostSetup=false;
  await page.route(`**/api/execution/engagements/${f.engagementId}/commands`,async route=>{
    const payload=route.request().postDataJSON();
    if(payload.action==='setup'){setupPosts++;if(!lostSetup){lostSetup=true;const response=await route.fetch();expect(response.ok()).toBe(true);await response.dispose();await route.abort('failed');return;}}
    await route.continue();
  });
  await page.getByRole('button',{name:'Set up execution',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Check save receipt',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check save receipt',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Check save receipt',exact:true})).toHaveCount(0);
  expect(setupPosts).toBe(1);
  await expect(page.getByRole('heading',{name:'Record an Activity',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Activity title',exact:true}).fill('Synthetic delivery observation');
  await page.getByRole('textbox',{name:'Observed work',exact:true}).fill('Human inspected the synthetic delivery proof.');
  await page.getByRole('textbox',{name:'Time zone',exact:true}).fill('UTC');
  await page.getByRole('combobox',{name:'Work package',exact:true}).selectOption('proof');
  page.once('dialog',dialog=>void dialog.dismiss());await page.getByRole('link',{name:'Engagement',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/engagements/${f.engagementId}/execution$`));
  await expect(page.getByRole('textbox',{name:'Observed work',exact:true})).toHaveValue('Human inspected the synthetic delivery proof.');
  page.once('dialog',dialog=>void dialog.dismiss());await page.getByRole('tab',{name:'Time',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Observed work',exact:true})).toHaveValue('Human inspected the synthetic delivery proof.');
  await page.getByRole('button',{name:'Save activity draft',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Synthetic delivery observation',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Submit activity',exact:true}).click();
  await expect(page.getByRole('button',{name:'Submit activity',exact:true})).toHaveCount(0);
  await signIn(page,'mcteer');await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);
  await page.getByRole('button',{name:'Review activity',exact:true}).click();
  await page.getByRole('textbox',{name:'Review rationale',exact:true}).fill('Human reviewed the exact synthetic delivery observation');
  await page.getByRole('button',{name:'Confirm reviewed decision',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByText(/accepted · delivery · revision/)).toBeVisible();
  await page.getByRole('tab',{name:'Milestones',exact:true}).click();
  await page.getByRole('button',{name:'start Proof reviewed',exact:true}).click();await page.getByRole('textbox',{name:'Review rationale',exact:true}).fill('Explicit start after reviewing the current plan');await page.getByRole('button',{name:'Confirm reviewed decision',exact:true}).click();
  await page.getByRole('button',{name:'request review Proof reviewed',exact:true}).click();await page.getByRole('textbox',{name:'Review rationale',exact:true}).fill('Explicit review requested after checking delivery');await page.getByRole('button',{name:'Confirm reviewed decision',exact:true}).click();
  const milestone=page.locator('article').filter({has:page.getByRole('heading',{name:'Proof reviewed',exact:true})});
  await milestone.getByLabel('Synthetic delivery observation',{exact:true}).check();await page.getByRole('button',{name:'accept Proof reviewed',exact:true}).click();
  await page.getByRole('textbox',{name:'Review rationale',exact:true}).fill('Human accepted the milestone against its exact reviewed activity');await page.getByRole('button',{name:'Confirm reviewed decision',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(milestone.getByText('accepted',{exact:true})).toBeVisible();await accessible(page);
  await page.screenshot({path:testInfo.outputPath('reviewed-execution.png'),fullPage:true});
  await signIn(page,'partner');await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);
  await expect(page.getByRole('heading',{name:'Synthetic delivery observation',exact:true})).toBeVisible();expect(await page.getByRole('button',{name:'Review activity',exact:true}).count()).toBe(0);await accessible(page);
});
test('rendered evidence withdrawal clears narrative and dirty source-derived edits before cleanup',async({page},testInfo)=>{
  test.setTimeout(240000);const f=await createReviewedExecutionJourney();
  await submitExecutionCommand(f.actors.author,f.engagementId,{version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:1,plan:f.accepted.aggregateVersion},payload:{baselineId:f.baselineId}});
  const view=await readExecutionOverview(f.actors.author,f.engagementId);
  await submitExecutionCommand(f.actors.author,f.engagementId,{version:'execution-v1',action:'record.create',requestKey:randomUUID(),expectedVersions:{execution:view.version},payload:{baselineId:f.baselineId,record:{kind:'activity',subtype:'work',title:'PRIVATE_WITHDRAWAL_ACTIVITY',narrative:'PRIVATE_WITHDRAWAL_NARRATIVE',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Not assigned',references:[f.reference]}}});
  await signIn(page,'panel');await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);
  await expect(page.getByText('PRIVATE_WITHDRAWAL_NARRATIVE',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Revise activity',exact:true}).click();await page.getByRole('textbox',{name:'Observed work',exact:true}).fill('PRIVATE_WITHDRAWAL_NARRATIVE plus unsaved edit');
  let releaseOld:()=>void=()=>{},oldCaptured:()=>void=()=>{},oldReleased=false,holdNext=true;
  const captured=new Promise<void>(resolve=>{oldCaptured=resolve;}),release=new Promise<void>(resolve=>{releaseOld=resolve;});
  await page.route(`**/api/execution/engagements/${f.engagementId}/records?kind=activity*`,async route=>{
    if(holdNext){holdNext=false;const response=await route.fetch();oldCaptured();await release;try{await route.fulfill({response});}catch{/* Focus revalidation deliberately aborted this superseded read. */}finally{oldReleased=true;await response.dispose();}}else await route.continue();
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await captured;
  const identity=await withTransaction(async db=>(await db.query('SELECT record_id FROM profile_revisions WHERE id=$1',[f.artifact.profileRevisionId])).rows[0]);
  const head=await withTransaction(async db=>(await db.query('SELECT version,current_accepted_revision_id FROM profile_records WHERE id=$1',[identity.record_id])).rows[0]);
  await withTransaction(db=>submitProfileCommand(f.actors.reviewer,f.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:f.artifact.profileRevisionId,expectedRecordVersion:Number(head.version),rationale:'Human withdrew synthetic source claim'},db));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('PRIVATE_WITHDRAWAL_NARRATIVE',{exact:true})).toHaveCount(0,{timeout:15000});
  releaseOld();await expect.poll(()=>oldReleased).toBe(true);
  await expect(page.getByText('PRIVATE_WITHDRAWAL_NARRATIVE',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Observed work',exact:true})).toHaveValue('');await expect(page.getByText(/Source content withheld/)).toBeVisible();await accessible(page);
  await page.screenshot({path:testInfo.outputPath('withdrawn-execution.png'),fullPage:true});
});


test('rejects a preview whose milestone head changes before the reviewed POST reaches the server',async({page},testInfo)=>{
  const f=await withTransaction(db=>createExecutionBaseline(db));
  await submitExecutionCommand(f.author,f.engagementId,{version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:1,plan:f.decision.aggregateVersion},payload:{baselineId:f.baselineId}});
  await signIn(page,'mcteer');await page.goto(`/customers/${f.customerId}/engagements/${f.engagementId}/execution`);
  let posts=0,status=0;
  await page.route(`**/api/execution/engagements/${f.engagementId}/commands`,async route=>{
    const payload=route.request().postDataJSON();
    if(payload.action==='milestone.decide'&&!posts++){
      const view=await readExecutionOverview(f.reviewer,f.engagementId),head=view.milestones.find(m=>m.key==='proof_done')!;
      const candidate={version:'execution-v1',action:'milestone.decide',expectedVersions:{execution:view.version,milestone:head.version},payload:{baselineId:f.baselineId,milestoneKey:head.key,decision:'start',evidenceRevisionIds:[]}};
      const preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
      await submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...preview,requestKey:randomUUID(),rationale:'Other explicit current human decision before browser write'});
    }
    const response=await route.fetch();status=response.status();await route.fulfill({response});
  });
  await page.getByRole('tab',{name:'Milestones',exact:true}).click();
  await page.getByRole('button',{name:'start Proof reviewed',exact:true}).click();
  await page.getByRole('textbox',{name:'Review rationale',exact:true}).fill('Review of the originally displayed exact head');
  await page.getByRole('button',{name:'Confirm reviewed decision',exact:true}).focus();await page.keyboard.press('Enter');
  await expect.poll(()=>status).toBe(409);expect(posts).toBe(1);
  await expect(page.getByRole('status').filter({hasText:'Execution changed; refresh'})).toBeVisible();
  const current=await readExecutionOverview(f.reviewer,f.engagementId);expect(current.milestones.find(m=>m.key==='proof_done')?.state).toBe('in_progress');
  await accessible(page);await page.screenshot({path:testInfo.outputPath('stale-execution-review.png'),fullPage:true});
});
