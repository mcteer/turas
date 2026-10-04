import {test} from '@playwright/test';
import {publishedReportFixture} from '../fixtures/reports/published';
import {reportUiGuard,checkReportAccessibility,reportUiExpect as expect} from '../fixtures/reports/ui';
import {signIn} from '../fixtures/ui';
test.beforeEach(async()=>{await reportUiGuard();});
test('reads real monthly and 92-day quarterly artifacts and downloads exact editable bytes',async({page},info)=>{
 test.setTimeout(300000);const fixture=await publishedReportFixture();await signIn(page,'mcteer');
 for(const report of fixture.reports.slice(1)){
  await page.goto(`/customers/${fixture.customerId}/reports/${report.reportId}`);
  await expect(page.getByRole('heading',{name:'Executive Artifacts',exact:true})).toBeVisible();
  for(const format of ['PDF','PPTX']){
   const download=page.waitForEvent('download');await page.getByRole('link',{name:`Download ${format}`,exact:true}).click();
   const file=await download;expect(await file.failure()).toBeNull();expect(file.suggestedFilename()).toBe(`executive-review.${format.toLowerCase()}`);
  }
  await checkReportAccessibility(page);
 }
 await page.screenshot({path:info.outputPath('quarterly-artifacts.png'),fullPage:true});
});
