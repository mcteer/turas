import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import{signIn}from'../fixtures/ui';
import{DEMO_IDS}from'../../lib/server/bootstrap-ids';
test('public coverage distinguishes supported findings and research gaps accessibly',async({page})=>{
 const sourceRevisionId='00000000-0000-4000-8000-000000000abc';
 const rationale=JSON.stringify({batchDigest:'a'.repeat(64),bodyDigest:'b'.repeat(64),normalizedDigest:'c'.repeat(64),subject:'Synthetic public subject'});
 await signIn(page,'panel');
 await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/sources/${sourceRevisionId}`,route=>route.fulfill({json:{data:{sourceRevisionId,state:'researched',title:'Synthetic public report',location:'https://publisher.org/synthetic-public-report',passage:'A synthetic exact source passage for an attributed public finding.',supportedClaim:'A synthetic attributed public finding.',publicationAt:null,observationAt:null,retrievalAt:new Date().toISOString(),rights:'Synthetic public quotation fixture',checks:{version:'research-check-v3',rationale},quality:{rubricVersion:'evidence-quality-v1',R:1,F:0,D:4,C:0,Q:25,band:'weak',freshness:'Unknown',validUntil:new Date(Date.now()+86400000).toISOString()}}}}));
 await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile`,async route=>{
  const response=await route.fetch();const body=await response.json();
  body.data.attributedResearch=[{sourceRevisionId,title:'Synthetic public report',supportedClaim:'A synthetic attributed public finding.',quality:{band:'weak'}}];
  body.data.publicResearchCoverage={asOf:new Date().toISOString(),description:"Synthetic attributed public company overview.",coverage:[
   {area:'identity',state:'supported',explanation:'One attributed public identity passage is retained.'},
   {area:'employee_testimony',state:'not_found',explanation:'No supported finding was retained in this bounded pass.'}],unknowns:['Formal maturity and internal engagement are not established.']};
  await route.fulfill({response,json:body});
 });
 await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
 const summary=page.getByText('Public Research Coverage',{exact:true});await expect(summary).toBeVisible();await summary.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Synthetic attributed public company overview.',{exact:true})).toBeVisible();
 await expect(page.getByText('Company Identity',{exact:true})).toBeVisible();
 await expect(page.getByText(/No Finding Retained/)).toBeVisible();
 await expect(page.getByRole('heading',{name:'Unknowns',exact:true})).toBeVisible();
 const sourceButton=page.getByRole('button',{name:'View source',exact:true});await sourceButton.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('link',{name:'Open public source',exact:true})).toHaveAttribute('href','https://publisher.org/synthetic-public-report');
 await expect(page.getByText('Research check: '+rationale,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);
});
