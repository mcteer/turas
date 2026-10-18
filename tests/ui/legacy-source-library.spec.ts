import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {expect,test,type Page} from '@playwright/test';
import {signIn,requireUiFixtureDatabaseUrl,sanitizedScreenshot} from '../fixtures/ui';
import {getCurrentSession} from '../../lib/server/auth/sessions';
import {legacyResearchSource} from '../fixtures/legacy-research';

async function visitAfterSignIn(page:Page,path:string){
 for(let attempt=0;attempt<2;attempt++){
  try{await page.goto(path);return;}
  catch(error){if(attempt||!(error instanceof Error)||!error.message.includes('interrupted by another navigation')||new URL(page.url()).pathname!=='/s')throw error;}
 }
}

test('source library opens from profile, pages retained metadata and reloads on desktop/mobile',async({page},testInfo)=>{
 await signIn(page,'mcteer');
 const cookie=(await page.context().cookies()).find(item=>item.name==='turas_session'||item.name==='__Host-turas_session');
 if(!cookie)throw Error('Owned browser session required');
 const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${cookie.name}=${cookie.value}`}}));
 if(!actor)throw Error('Owned browser actor required');
 const db=new Client({connectionString:requireUiFixtureDatabaseUrl()});await db.connect();
 try{
  const customerId=randomUUID(),identity={...actor,userId:actor.principalId,environmentId:process.env.TURAS_ENVIRONMENT_ID!};
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic source library browser account',false)",[customerId,actor.workspaceId]);
  for(let i=0;i<21;i++)await legacyResearchSource(db,identity,customerId,{quote:'Synthetic public source retained with exact dates.',title:`Synthetic library source ${i+1}`,age:i});
  await visitAfterSignIn(page,`/customers/${customerId}`);
  await page.getByRole('link',{name:'Research Sources',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Research Source Library',exact:true})).toBeVisible();
  await expect(page.locator('article')).toHaveCount(20);
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('article')).toHaveCount(20);
  await page.reload();await expect(page.locator('article')).toHaveCount(20);
  await page.evaluate(()=>window.scrollTo(0,0));
  mkdirSync('local-artifacts/018',{recursive:true});
  await sanitizedScreenshot(page,`local-artifacts/018/source-library-${testInfo.project.name}.png`);
  await page.getByRole('button',{name:'View retained evidence',exact:true}).first().click();
  await expect(page.locator('#source-detail-heading')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }finally{await db.end();}
});
