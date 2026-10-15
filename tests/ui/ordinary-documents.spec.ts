import {expect,test} from '@playwright/test';
import {resolve} from 'node:path';
import {signIn} from '../fixtures/ui';

test('ordinary documents keep their prompt and unverified content without a customer picker',async({page},info)=>{
 await signIn(page,'panel');await page.goto('/s');
 await page.getByRole('button',{name:'Attach documents',exact:true}).click();
 await expect(page).toHaveURL(/\/s\/[0-9a-f-]+\?attachments=1$/);
 const suppliedText='Attachment customer context supplied by a human; do not accept automatically.';
 await expect(page.getByLabel('Attach documents',{exact:true})).toBeEnabled();
 await page.getByLabel('Message Turi').fill('Discuss this document.');
 await page.getByLabel('Attach documents',{exact:true}).setInputFiles({name:'context.txt',mimeType:'text/plain',buffer:Buffer.from(suppliedText)});
 await expect(page.getByRole('button',{name:'Remove context.txt'})).toBeVisible();
 for(const file of ['review.docx','review.pdf','workloads.xlsx']){
  await page.getByLabel('Attach documents',{exact:true}).setInputFiles(resolve('local-artifacts/004/fixtures',file));
  await expect(page.getByRole('button',{name:`Remove ${file}`})).toBeVisible({timeout:20000});
 }
 await page.getByLabel('Message Turi').fill('Discuss this document.');
 let sent='';await page.route('**/eve/v1/session/*',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  sent=route.request().postDataJSON().message;
  await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic unavailable provider'})});
 });
 await expect(page.getByRole('button',{name:'Send message'})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`local-artifacts/ordinary-documents-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Send message'}).click();
 await expect.poll(()=>sent).toContain(suppliedText);
 expect(sent).toContain('Discuss this document.');expect(sent).toContain('unverified content supplied by the user');
 expect(sent).toContain('draft for owner review');
 for(const name of ['review.docx','review.pdf','workloads.xlsx'])expect(sent).toContain(name);
 expect(sent).toContain('Juniper readiness review');
});
