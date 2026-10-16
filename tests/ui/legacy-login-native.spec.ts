import {expect,test} from '@playwright/test';
import {testCredentials} from '../fixtures/ui';

test.use({javaScriptEnabled:false});
test('native login rejects invalid credentials and signs in without putting credentials in any URL',async({page})=>{
 const credentials=testCredentials('mcteer');let credentialUrls=0;
 page.on('request',request=>{const url=new URL(request.url());if(url.searchParams.has('username')||url.searchParams.has('password'))credentialUrls++;});
 await page.goto('/login?returnTo=%2Fcustomers');
 await page.getByLabel('Username').fill(credentials.username);await page.getByLabel('Password').fill('wrong-synthetic-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(url=>url.pathname==='/login'&&url.searchParams.get('error')==='invalid');
 await expect(page.getByRole('alert')).toContainText('Invalid credentials');
 await page.getByLabel('Username').fill(credentials.username);await page.getByLabel('Password').fill(credentials.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(url=>url.pathname==='/customers'&&!url.search);
 expect((await page.request.get('/api/auth/session')).status()).toBe(200);
 expect(credentialUrls).toBe(0);
});
