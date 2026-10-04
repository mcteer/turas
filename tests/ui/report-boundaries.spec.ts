import {test} from '@playwright/test';
import {publishedReportFixture} from '../fixtures/reports/published';
import {reportUiGuard,checkReportAccessibility,reportUiExpect as expect} from '../fixtures/reports/ui';
import {signIn} from '../fixtures/ui';
import {reportTransaction} from '../../lib/server/reports/commands';
import {invalidateReportSource} from '../../lib/server/reports/invalidation';
import {cleanupReportRevisionPayloads} from '../../lib/server/reports/cleanup';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import {randomUUID} from 'node:crypto';
import {submitReportRevisionCommand} from '../../lib/server/reports/service';
test.beforeEach(async()=>{await reportUiGuard();});
test('unassigned partner cannot retrieve published reports or private history',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture();
 await reportTransaction(db=>db.query("UPDATE customer_grants SET state='revoked' WHERE id=$1",[DEMO_IDS.partnerSharedGrant]));
 await signIn(page,'partner');
 for(const suffix of ['', '/history','/sources','/deliveries']){
  const response=await page.request.get(`/api/reports/${fixture.published.reportId}${suffix}`);
  expect(response.status()).toBe(404);const bytes=await response.text();
  expect(bytes).not.toContain(fixture.published.revisionId);expect(bytes).not.toContain('Executive Summary');
 }
 await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toHaveCount(0);
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('unassigned-partner.png'),fullPage:true});
});
test('internal correction history remains private until fresh publication approval',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture(),sentinel='Recommendation: inspect the next synthetic proof.';
 const revised=await submitReportRevisionCommand(fixture.author,fixture.published.reportId,{action:'revise',expectedVersion:fixture.published.version,requestKey:randomUUID(),rationale:'Review the synthetic correction separately',annotations:[sentinel]}) as {revisionId:string};
 await signIn(page,'panel');await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByText('Reviewer annotations changed.',{exact:false})).toBeVisible();
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('internal-correction.png'),fullPage:true});
 await signIn(page,'partner');await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toBeVisible();
 await expect(page.getByText(sentinel,{exact:false})).toHaveCount(0);
 for(const suffix of ['', '/history','/sources']){
  const response=await page.request.get(`/api/reports/${fixture.published.reportId}${suffix}`);
  expect(response.ok()).toBe(true);const bytes=await response.text();
  expect(bytes).not.toContain(revised.revisionId);expect(bytes).not.toContain(sentinel);
 }
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('partner-published-only.png'),fullPage:true});
});
test('partners see only published delivery and source withdrawal clears report content',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture();
 await signIn(page,'partner');await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Email Delivery'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Review Publication'})).toHaveCount(0);
 await reportTransaction(db=>invalidateReportSource(db,'milestone_baseline',fixture.baselineId));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Content Withheld'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toHaveCount(0);
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('partner-withheld.png'),fullPage:true});
});
test('revoked partner access clears content and denies detail history and sources',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture();
 await signIn(page,'partner');await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toBeVisible();
 await reportTransaction(db=>db.query("UPDATE customer_grants SET state='revoked' WHERE id=$1",[DEMO_IDS.partnerSharedGrant]));
 const denied=page.waitForResponse(response=>response.url().endsWith(`/api/reports/${fixture.published.reportId}`)&&response.status()===404);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await denied;
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toHaveCount(0);
 for(const suffix of ['', '/history','/sources']){
  const response=await page.request.get(`/api/reports/${fixture.published.reportId}${suffix}`);
  expect(response.status()).toBe(404);expect(await response.text()).not.toContain('document');
 }
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('partner-revoked.png'),fullPage:true});
});
test('retention expiry clears an open report and keeps private payloads out of subsequent reads',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture();
 await signIn(page,'panel');await page.goto(`/customers/${fixture.customerId}/reports/${fixture.published.reportId}`);
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toBeVisible();
 await reportTransaction(async db=>{
  await db.query("UPDATE report_revision_states SET payload_expires_at=now()-interval '1 second' WHERE revision_id=$1",[fixture.published.revisionId]);
  await cleanupReportRevisionPayloads(db);
  expect((await db.query('SELECT visibility FROM report_revision_states WHERE revision_id=$1',[fixture.published.revisionId])).rows[0].visibility).toBe('expired');
 });
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Content Withheld'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Executive Summary',exact:true})).toHaveCount(0);
 const response=await page.request.get(`/api/reports/${fixture.published.reportId}`);
 expect(response.ok()).toBe(true);const body=await response.json();expect(body.data.document).toBeNull();expect(body.data.visibility).toBe('withheld');
 expect(JSON.stringify(body)).not.toContain('request_bytes');expect(JSON.stringify(body)).not.toContain('object_key');
 await checkReportAccessibility(page);await page.screenshot({path:info.outputPath('retention-expired.png'),fullPage:true});
});
