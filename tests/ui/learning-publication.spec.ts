import AxeBuilder from '@axe-core/playwright';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {withLearningDatabase} from '../fixtures/learning/environment';
import {learningScopedFixture,learningAcceptedOriginal} from '../fixtures/learning/setup';
import {createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate,reviseKnowledgeCandidate} from '../../lib/server/knowledge/service';
import {activateLearning} from '../../scripts/learning-activate';
import {requireOwnedLearningDatabase} from '../../scripts/learning-environment';
import {learningCompletedEvaluation} from '../fixtures/learning/completed-evaluation';
test.beforeEach(()=>{if(process.env.TURAS_LEARNING_UI_FIXTURE_READY!=='1')throw Error('Owned learning UI runner required');});
test('human reviews all eight immutable capture pairs before final exact publication',async({page})=>{
 test.setTimeout(120000); // Sixteen prepared arms and eight immutable human reviews in one journey.
 const fixture=await withLearningDatabase(learningCompletedEvaluation);
 await page.context().addCookies([{name:'turas_session',value:fixture.actors.admin.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`/learning/candidates/${fixture.candidate.id}`);await expect(page.getByRole('button',{name:'Publish Exact Evaluated Revision',exact:true})).toHaveCount(0);
 await page.goto(`/learning/evaluations/${fixture.evaluationId}`);await expect(page.getByRole('heading',{name:'Awaiting Review',exact:true})).toBeVisible();
 for(let index=1;index<=8;index++){
  const caseId=`E${String(index).padStart(2,'0')}`;await page.getByRole('button',{name:`Read and Review ${caseId}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Fixed Synthetic Case Context',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Human Review Expectations',exact:true})).toBeVisible();
  const baseline=page.getByRole('group',{name:'Baseline Human Scores',exact:true}),candidate=page.getByRole('group',{name:'Candidate Human Scores',exact:true}),record=page.getByRole('button',{name:'Record Immutable Case Assessment',exact:true});await expect(record).toBeDisabled();
  for(const group of [baseline,candidate])for(const select of await group.getByRole('combobox').all()){await expect(select).toHaveValue('');await select.selectOption('2');}
  await baseline.getByRole('combobox',{name:'Usefulness',exact:true}).selectOption('1');const checks=page.getByRole('group',{name:'Mandatory Human Checks',exact:true});for(const checkbox of await checks.getByRole('checkbox').all()){await expect(checkbox).not.toBeChecked();await checkbox.check();}
  await page.getByRole('textbox',{name:'Case Assessment Rationale',exact:true}).fill('PRIVATE_SYNTHETIC_GRADING: UI contract only, not actual model fidelity');await record.click();
  await expect(page.getByRole('button',{name:'Record Immutable Case Assessment',exact:true})).toHaveCount(0);
 }
 await expect(page.getByRole('heading',{name:'Passed',exact:true})).toBeVisible();expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('PRIVATE_SYNTHETIC');
 await page.goto(`/learning/candidates/${fixture.candidate.id}`);const publish=page.getByRole('button',{name:'Publish Exact Evaluated Revision',exact:true});await expect(publish).toBeDisabled();await page.getByRole('combobox',{name:'Passing Full Evaluation',exact:true}).selectOption(fixture.evaluationId);
 const final=page.getByRole('group',{name:'Final Publication Review',exact:true});for(const checkbox of await final.getByRole('checkbox').all()){await expect(checkbox).not.toBeChecked();await checkbox.check();}await page.getByRole('textbox',{name:'Publication Rationale',exact:true}).fill('PRIVATE_SYNTHETIC_PUBLICATION: exact evaluated wording');await publish.click();await expect(page.getByText('Actual published head: revision 1, generation 1 · published',{exact:true})).toBeVisible();
 expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??'')).map(v=>v.id)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('PRIVATE_SYNTHETIC');
 await page.reload();await expect(page.getByText('Actual published head: revision 1, generation 1 · published',{exact:true})).toBeVisible();
});
test('administrator explicitly reviews exact sanitized words while partners cannot open the private queue',async({page})=>{
 test.setTimeout(90000); // Fixture, sanitization review, evaluation cancellation and role denial.
 const fixture=await withLearningDatabase(async db=>{
  const scope=await learningScopedFixture(db),lineage=await learningAcceptedOriginal(db,scope.actors.member,scope.actors.admin,scope.customerId);
  const payload={title:'Synthetic browser review practice',productVersion:'Unknown',problem:'An observed concern',prerequisites:'Review current original evidence',solution:'Measure accepted engineering evidence',reasoning:'Ground proposals in observations',applicability:'Applicable engineering contexts',limitations:'No causal attribution',validation:'Verify complete evidence'};
  const candidate=await createKnowledgeCandidate(db,scope.actors.member,{idempotencyKey:randomUUID(),customerId:scope.customerId,payload,lineage:[lineage]});
  await submitKnowledgeCandidate(db,scope.actors.member,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest});
  await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[scope.workspaceId]);return {...scope,candidate};
 });
 await page.context().addCookies([{name:'turas_session',value:fixture.actors.admin.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
 await page.goto('/learning/candidates');await page.getByRole('link',{name:'Synthetic browser review practice',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Candidate Review',exact:true})).toBeVisible();await page.getByRole('button',{name:'Read Original 1',exact:true}).click();await expect(page.getByRole('heading',{name:'Current Original',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Reuse Decision',exact:true}).selectOption('accept');const submit=page.getByRole('button',{name:'Record Reuse Decision',exact:true});await expect(submit).toBeDisabled();
 const group=page.getByRole('group',{name:'Independent Sanitization and Rights Review',exact:true});for(const checkbox of await group.getByRole('checkbox').all()){await expect(checkbox).not.toBeChecked();await checkbox.check();}
 await page.getByRole('textbox',{name:'Review Rationale',exact:true}).fill('PRIVATE_SYNTHETIC_BROWSER_REVIEW');await submit.click();await expect(page.getByText('Accept · Recorded',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??'')).map(v=>v.id)).toEqual([]);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('PRIVATE_SYNTHETIC');
 await page.getByRole('textbox',{name:'Evaluation Maximum Spend (USD)',exact:true}).fill('25');await page.getByRole('button',{name:'Prepare Paired Evaluation',exact:true}).click();await expect(page.getByRole('heading',{name:'Paired Evaluation',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Prepare Next Fixed Arm',exact:true}).click();await expect(page.getByRole('button',{name:'Start Prepared Evaluation Arm',exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel Full Evaluation',exact:true}).click();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Start Prepared Evaluation Arm',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Prepare Next Fixed Arm',exact:true})).toHaveCount(0);
 await page.goto(`/learning/candidates/${fixture.candidate.id}`);await expect(page.getByRole('heading',{name:'Candidate Review',exact:true})).toBeVisible();
 const url=page.url();await page.context().addCookies([{name:'turas_session',value:fixture.actors.partner.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);await page.goto(url);await expect(page.getByRole('heading',{name:'Synthetic browser review practice',exact:true})).toHaveCount(0);await page.goto('/learning/candidates');await expect(page.getByRole('link',{name:'Synthetic browser review practice',exact:true})).toHaveCount(0);
 await withLearningDatabase(async db=>{expect((await db.query('SELECT count(*)::int n FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id WHERE a.workspace_id=$1',[fixture.workspaceId])).rows[0].n).toBe(0);});
});

let withdrawalStage='fixture';
test.afterEach(({},info)=>{if(info.title.startsWith('administrator withdraws')&&info.status!==info.expectedStatus)console.log('LEARNING_WITHDRAWAL_STAGE '+withdrawalStage);});
test('administrator withdraws the actual head while a newer draft has lost its original and new work is disabled',async({page})=>{
 test.setTimeout(90000); // Original loss, disable/withdrawal, reload and a separately reviewed rollback draft.
 withdrawalStage='fixture';
 const fixture=await withLearningDatabase(async db=>{
  const scope=await learningScopedFixture(db),lineage=await learningAcceptedOriginal(db,scope.actors.member,scope.actors.admin,scope.customerId);
  const payload={title:'Synthetic retained published practice',productVersion:'Unknown',problem:'Observed concern',prerequisites:'Check applicability',solution:'Measure accepted evidence',reasoning:'Use reviewed observations',applicability:'Engineering workflows',limitations:'No causal claim',validation:'Verify originals'};
  const candidate=await createKnowledgeCandidate(db,scope.actors.member,{idempotencyKey:randomUUID(),customerId:scope.customerId,payload,lineage:[lineage]});await submitKnowledgeCandidate(db,scope.actors.member,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest});
  await decideKnowledgeCandidate(db,scope.actors.admin,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Reviewed synthetic baseline',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
  await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,scope.workspaceId,true,requireOwnedLearningDatabase(process.env,true));
  const newer=await learningAcceptedOriginal(db,scope.actors.member,scope.actors.admin,scope.customerId);await reviseKnowledgeCandidate(db,scope.actors.member,candidate.id,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:candidate.digest,payload:{...payload,title:'PRIVATE_SYNTHETIC_UNAVAILABLE_DRAFT'},lineage:[newer]});
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[newer.sourceRevisionId]);await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,scope.workspaceId,false,requireOwnedLearningDatabase(process.env,true));
  return {...scope,candidate};
 });
 withdrawalStage='open-current-head';
 await page.context().addCookies([{name:'turas_session',value:fixture.actors.admin.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);await page.goto(`/learning/candidates/${fixture.candidate.id}`);
 await expect(page.getByRole('heading',{name:'PRIVATE_SYNTHETIC_UNAVAILABLE_DRAFT',exact:true})).toHaveCount(0);await expect(page.getByText('Actual published head: revision 1, generation 1 · published',{exact:true})).toBeVisible();
 withdrawalStage='withdraw';
 await page.getByRole('textbox',{name:'Withdrawal Rationale',exact:true}).fill('PRIVATE_SYNTHETIC_WITHDRAWAL_REASON');await page.getByRole('button',{name:'Withdraw Published Practice',exact:true}).click();await expect(page.getByText('Actual published head: revision 1, generation 2 · withdrawn',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Withdraw Published Practice',exact:true})).toHaveCount(0);
 withdrawalStage='accessibility';
 expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact??'')).map(v=>v.id)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('PRIVATE_SYNTHETIC');
 withdrawalStage='reload-withdrawn';
 await page.reload();await expect(page.getByText('Actual published head: revision 1, generation 2 · withdrawn',{exact:true})).toBeVisible();
 withdrawalStage='reactivate';
 await withLearningDatabase(async db=>{await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,fixture.workspaceId,true,requireOwnedLearningDatabase(process.env,true));});await page.reload();
 withdrawalStage='rollback-picker';
 const historical=page.getByRole('combobox',{name:'Historical Published Revision',exact:true});await expect(historical).toBeVisible();
 // Native browser pickers can blur the window without hiding the document.
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(historical).toBeVisible({timeout:2000});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(historical).toBeVisible();
 // Backgrounding still withholds controls and private content until refresh.
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await expect(historical).toHaveCount(0);
 await page.evaluate(()=>{delete (document as unknown as {visibilityState?:string}).visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await expect(historical).toBeVisible();await historical.selectOption({label:'Published Revision 1'});
 withdrawalStage='rollback-originals';
 const originals=page.getByRole('group',{name:'Current Rollback Originals',exact:true});await expect(originals.getByRole('checkbox')).toHaveCount(1);await originals.getByRole('checkbox').check();
 withdrawalStage='rollback-rationale';
 await page.getByRole('textbox',{name:'Rollback Reuse Basis',exact:true}).fill('Current original permission requires independent review');await page.getByRole('textbox',{name:'Rollback Rationale',exact:true}).fill('PRIVATE_SYNTHETIC_ROLLBACK_REASON');withdrawalStage='rollback-submit';await page.getByRole('button',{name:'Create Private Rollback Revision',exact:true}).click();
 withdrawalStage='rollback-refresh';
 await expect(page.getByRole('textbox',{name:'Rollback Rationale',exact:true})).toHaveValue('');await page.getByRole('button',{name:'Refresh Candidate',exact:true}).click();await expect(page.getByRole('heading',{name:'Synthetic retained published practice',exact:true})).toBeVisible();await expect(page.getByText('Draft · Revision 3',{exact:true})).toBeVisible();await expect(page.getByText('Actual published head: revision 1, generation 2 · withdrawn',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Publish Exact Evaluated Revision',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('PRIVATE_SYNTHETIC');
});
