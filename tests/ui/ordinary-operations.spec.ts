import {expect,test,type Page} from '@playwright/test';
import {signIn} from '../fixtures/ui';
async function visitAfterSignIn(page:Page,path:string){
 for(let attempt=0;attempt<2;attempt++){
  try{await page.goto(path);return;}catch(error){if(attempt||!(error instanceof Error)||!error.message.includes('interrupted by another navigation')||new URL(page.url()).pathname!=='/s')throw error;}
 }
}
test('ordinary operations and annual services assumptions retain current-theme interaction and reload',async({page})=>{
 await signIn(page,'mcteer');
 await visitAfterSignIn(page,'/portfolio');await expect(page.getByRole('heading',{name:'Delivery Operations Review',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Annual services operating model',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Services Operating Model',exact:true})).toBeVisible();
 await expect(page.locator('dd').filter({hasText:'$897,000'})).toBeVisible();
 await page.getByLabel('Realized hourly rate ($)',{exact:true}).fill('0');
 await expect(page.getByText('Undefined at zero revenue',{exact:true})).toBeVisible();
 await expect(page.getByText('Unavailable at zero rate',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reset assumptions',exact:true}).click();
 await expect(page.getByLabel('Realized hourly rate ($)',{exact:true})).toHaveValue('250');
 await page.getByText('Show calculation and sensitivity',{exact:true}).click();
 await expect(page.getByRole('table')).toBeVisible();
 await page.reload();await expect(page.getByLabel('Realized hourly rate ($)',{exact:true})).toHaveValue('250');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
