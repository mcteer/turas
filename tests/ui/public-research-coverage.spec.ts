import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import{signIn}from'../fixtures/ui';
import{DEMO_IDS}from'../../lib/server/bootstrap-ids';
test('public coverage distinguishes supported findings and research gaps accessibly',async({page})=>{
 await signIn(page,'panel');
 await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile`,async route=>{
  const response=await route.fetch();const body=await response.json();
  body.data.publicResearchCoverage={asOf:new Date().toISOString(),coverage:[
   {area:'identity',state:'supported',explanation:'One attributed public identity passage is retained.'},
   {area:'employee_testimony',state:'not_found',explanation:'No supported finding was retained in this bounded pass.'}],unknowns:['Formal maturity and internal engagement are not established.']};
  await route.fulfill({response,json:body});
 });
 await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
 const summary=page.getByText('Public Research Coverage',{exact:true});await expect(summary).toBeVisible();await summary.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Company Identity',{exact:true})).toBeVisible();
 await expect(page.getByText(/No Finding Retained/)).toBeVisible();
 await expect(page.getByRole('heading',{name:'Unknowns',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);
});
